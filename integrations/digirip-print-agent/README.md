# DigiRIP print agent

Prints paid DTF gang sheet orders on the shop's own Prestige instead of
emailing them to a vendor.

Customer sheets live as private PNGs in DigitalOcean Spaces. Until now the
only ways out were the **Download** button and **Send to vendor** in
`/admin`. This agent is a third: a small Node script on the Windows PC that
runs DigiRIP. Every 30 seconds it asks the site for paid sheets nobody has
started, downloads each one, drops it into DigiRIP's **hot folder**, and
tells the site. The order then shows *Pulled to Prestige L2 Pro* in the
admin queue and moves to **in production**. Nothing is pulled twice.

Sheets wider than the press (34" orders on a 24" printer) are skipped with
a log line and stay in the queue for a vendor send.

## One-time setup

### 1. Server: create the agent key

On the droplet:

```bash
openssl rand -hex 32          # copy the output
sudo cp -n /var/www/tshirtbrothers/server/.env /root/env-backup-$(date +%F)
sudo nano /var/www/tshirtbrothers/server/.env     # add: PRINT_AGENT_KEY=<that hex>
sudo pm2 restart tshirtbrothers-api
```

The API answers 503 on the agent routes until this key exists, so nothing
can be pulled by accident before you are ready.

### 2. Shop PC: install Node and the agent

1. Install Node.js 20 or newer (LTS installer from nodejs.org, defaults are
   fine).
2. Copy this folder (`integrations/digirip-print-agent`) to the PC, for
   example `C:\TSB\print-agent`.
3. Copy `config.example.json` to `config.json` and fill it in:

   | key | value |
   | --- | --- |
   | `api_key` | the hex string from step 1 |
   | `hot_folder` | the folder DigiRIP watches (step 3) |
   | `archive_dir` | optional. DigiRIP deletes hot-folder files once it ingests them, so this keeps a copy of every sheet. Leave `""` to skip |
   | `max_width_in` | widest sheet the press takes. 24 for the XL2 Pro, 18 for an L2 |
   | `printer_name` | label shown in `/admin` |

### 3. DigiRIP: the hot folder

You do not need to find DigiRIP's default folder. Make your own and point
DigiRIP at it:

1. Create `C:\TSB\HotFolder` in Explorer.
2. In DigiRIP, right-click the Prestige queue in the left pane and open
   **Queue Properties** (DigiRIP is CADlink Digital Factory under the
   hood, so this is the same place Digital Factory keeps it). Find the
   **Hot Folder** setting, enable it, and browse to `C:\TSB\HotFolder`.
   Save and make sure the queue is **started**, not paused.
3. Set the queue's default page/media to the roll width and let the job
   size come from the file: sheets are exported at exactly 300 DPI, so a
   22" × 3 ft order arrives as a 6600 × 10800 px PNG and lands at true size.
4. Put a test PNG in the folder by hand. If a job appears in the queue,
   the hot folder works.

If the menu names differ in your version, the DTF Station knowledge base
(dtfstation.com/knowledge-base) covers DigiRIP's queue properties.

### 4. First run

In a terminal in the agent folder:

```
node agent.mjs --check
```

This confirms the key, the API, that the hot folder is writable, and lists
the sheets currently waiting. Then:

```
node agent.mjs --once
```

pulls them. Watch DigiRIP pick each file up.

### 5. Keep it running

Task Scheduler → Create Task:

- Trigger: **At log on** (the user who runs DigiRIP).
- Action: Start a program → `C:\TSB\print-agent\run-agent.bat`.
- Settings: untick "Stop the task if it runs longer than"; tick "If the task
  fails, restart every 1 minute".

`run-agent.bat` restarts the agent if it ever exits. Log lines go to the
console and to `agent.log` beside the script.

## File names

```
TSB-41-22in-x-3ft-Mary-Jones-HOTRUSH.png
```

Order number, sheet width, length, customer, and `-RUSH` / `-HOTRUSH` when
the tier needs the operator's attention. Hot rush and rush orders come off
the queue first.

## Safety notes

- Files are downloaded to `staging/` and only renamed into the hot folder
  once the byte count matches Spaces and the PNG header checks out, so
  DigiRIP never ingests a partial file.
- `state.json` records every pull locally. If the PC loses network between
  writing the file and reporting it, the report is retried next pass and
  the sheet is not downloaded again.
- A sheet the server flagged as a probable white background (opaque art
  with a white border) is still pulled but logged with a warning. Check
  the preview in `/admin` before it prints white ink.
- Delete a file from the hot folder and the order stays "pulled". To
  reprint, use **Download** in `/admin`, or remove the order id from
  `state.json` and clear `printer_pulled_at` on the order.

## API (server side)

All under `/api/gangsheet-store/print-agent`, header `x-print-agent-key`:

| route | purpose |
| --- | --- |
| `GET /ping` | key check |
| `GET /queue` | paid, un-pulled, un-vendored orders with a 1-hour presigned file link and byte size |
| `POST /orders/:id/pulled` | `{ printer, filename }` → sets `printer_pulled_at`, moves `paid` → `in_production`; idempotent |
