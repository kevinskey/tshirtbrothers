# DTF Gang Sheet Store — Phase 1 (Upload Fast Lane) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sell prepaid 22"-wide DTF gang sheets by the linear foot at tshirtbrothers.com/dtf — length + tier + PNG upload + Stripe Checkout, with an admin production queue.

**Architecture:** New server router `gangsheetStore.js` (config/upload/checkout/admin endpoints) + two new tables; payment completion rides the existing Stripe webhook in `payments.js` via a new `gang_sheet_order_id` metadata branch. New client pages `/dtf` and `/admin/dtf-orders`. Prices and cutoffs live in a settings row; the server is the only price authority.

**Tech Stack:** Existing stack — Express + pg + Stripe + `services/spaces.js` (DO Spaces), React 18 + TS + TanStack Query + Tailwind. One new server dep: `multer` (large-file upload). No new client deps.

## Global Constraints

- **Rates (DECIDED):** Standard **$9/ft**, Rush **$11/ft**, Hot Rush **$15/ft**. Linear: `price = ceil(length_ft) × rate`. Client never sends a price.
- **Turnaround (DECIDED):** Standard = ready in 2 business days; Rush = next business day, order by **11:00** America/New_York; Hot Rush = same day, order by **13:30**. Rush + Hot Rush are **Mon–Fri only**.
- **Sheet:** 22" wide fixed (6,600 px @300 DPI), length 1–20 ft (1 ft = 3,600 px). PNG only, transparent background, max **100 MB**.
- **Delivery:** `pickup` (free) or `ship` (flat **$6.99** = 699 cents).
- **Guest checkout allowed** — no auth on customer endpoints.
- No test framework; verification = droplet `tsc -b` (client build gate in quick-deploy), `node --check` per server file locally, and the manual QA task. Local `npm ci`/`npm install` in client/ FAILS by design — never run client builds locally.
- Worktree: create from origin/main; deploys = push to main + `ssh root@198.211.113.144 bash /var/www/tshirtbrothers/quick-deploy.sh`. NOTE: quick-deploy does NOT install server deps — Task 7 installs `multer` on the droplet explicitly before the code that imports it is restarted.
- Commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Spec: `docs/superpowers/specs/2026-08-15-dtf-gang-sheet-store-design.md`. Line refs below are to origin/main `c45ee2b`.

---

### Task 1: Migration — orders + settings tables

**Files:**
- Create: `server/migrations/gang_sheet_store_v1.sql`

**Interfaces:**
- Produces: tables `gang_sheet_orders`, `gang_sheet_store_settings` (single row id=1) exactly as below; every later task depends on these column names.

- [ ] **Step 1: Write the migration**

```sql
-- Phase 1 of the customer-facing DTF gang sheet store.
-- Spec: docs/superpowers/specs/2026-08-15-dtf-gang-sheet-store-design.md

CREATE TABLE IF NOT EXISTS gang_sheet_store_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rate_standard_cents INT NOT NULL DEFAULT 900,
  rate_rush_cents INT NOT NULL DEFAULT 1100,
  rate_hot_rush_cents INT NOT NULL DEFAULT 1500,
  cutoff_rush TIME NOT NULL DEFAULT '11:00',
  cutoff_hot_rush TIME NOT NULL DEFAULT '13:30',
  min_ft INT NOT NULL DEFAULT 1,
  max_ft INT NOT NULL DEFAULT 20,
  shipping_flat_cents INT NOT NULL DEFAULT 699,
  standard_active BOOLEAN NOT NULL DEFAULT TRUE,
  rush_active BOOLEAN NOT NULL DEFAULT TRUE,
  hot_rush_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO gang_sheet_store_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gang_sheet_orders (
  id SERIAL PRIMARY KEY,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  length_ft INT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('standard','rush','hot_rush')),
  price_cents INT NOT NULL,
  shipping_cents INT NOT NULL DEFAULT 0,
  delivery TEXT NOT NULL DEFAULT 'pickup' CHECK (delivery IN ('pickup','ship')),
  ship_address JSONB,
  file_key TEXT NOT NULL,
  file_width_px INT,
  file_height_px INT,
  source TEXT NOT NULL DEFAULT 'upload',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','in_production','ready','completed','canceled')),
  stripe_session_id TEXT,
  paid_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gang_sheet_orders_status_idx ON gang_sheet_orders (status, created_at);
```

- [ ] **Step 2: Syntax-check locally** — `psql` isn't available locally; eyeball-verify then rely on droplet apply in Task 7 (`psql -f` aborts loudly on error). Confirm the file has no `$` shell-expansion hazards (it doesn't — no dollar-quoted bodies).

- [ ] **Step 3: Commit**

```bash
git add server/migrations/gang_sheet_store_v1.sql
git commit -m "feat(dtf-store): orders + settings tables migration"
```

(Migration is APPLIED in Task 7, before deploy.)

---

### Task 2: Server — pricing/cutoff lib + public config endpoint

**Files:**
- Create: `server/routes/gangsheetStore.js`
- Modify: `server/index.js` (mount `app.use('/api/gangsheet-store', gangsheetStoreRouter);` next to the other routers ~line 76, import at top with the others)

**Interfaces:**
- Consumes: `pool` from `../db.js`.
- Produces (exact names later tasks use):
  - `loadSettings()` → row of `gang_sheet_store_settings`
  - `tierAvailability(settings, now = new Date())` → `{ standard: {available, reason}, rush: {...}, hot_rush: {...} }`
  - `priceCents(settings, lengthFt, tier)` → int (throws `Error('invalid length'|'invalid tier')`)
  - `GET /api/gangsheet-store/config` → `{ rates: {standard, rush, hot_rush} (cents), tiers: tierAvailability(), min_ft, max_ft, shipping_flat_cents, promises: {standard, rush, hot_rush} (display strings) }`

- [ ] **Step 1: Create the router with lib functions + config route**

```js
import { Router } from 'express';
import pool from '../db.js';

const router = Router();

// Tier promises are copy, centralised so client + emails agree.
export const TIER_PROMISES = {
  standard: 'Ready in 2 business days',
  rush: 'Ready next business day — order by 11:00 AM',
  hot_rush: 'Ready same day — order by 1:30 PM',
};

export async function loadSettings() {
  const { rows } = await pool.query('SELECT * FROM gang_sheet_store_settings WHERE id = 1');
  if (!rows[0]) throw new Error('gang_sheet_store_settings row missing — run gang_sheet_store_v1.sql');
  return rows[0];
}

// Current shop-local wall clock. The droplet runs UTC; the shop is Atlanta.
function atlantaNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return {
    weekday: get('weekday'),                       // 'Mon'..'Sun'
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function beforeCutoff(nowMinutes, cutoff /* 'HH:MM:SS' or 'HH:MM' */) {
  const [h, m] = String(cutoff).split(':').map(Number);
  return nowMinutes < h * 60 + m;
}

export function tierAvailability(settings, now = new Date()) {
  const { weekday, minutes } = atlantaNow(now);
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  const out = {};
  out.standard = settings.standard_active
    ? { available: true }
    : { available: false, reason: 'Temporarily unavailable' };
  for (const [tier, activeCol, cutoffCol] of [
    ['rush', 'rush_active', 'cutoff_rush'],
    ['hot_rush', 'hot_rush_active', 'cutoff_hot_rush'],
  ]) {
    if (!settings[activeCol]) out[tier] = { available: false, reason: 'Temporarily unavailable' };
    else if (weekend) out[tier] = { available: false, reason: 'Mon–Fri only' };
    else if (!beforeCutoff(minutes, settings[cutoffCol])) {
      out[tier] = { available: false, reason: 'Past today\'s cutoff — available again tomorrow' };
    } else out[tier] = { available: true };
  }
  return out;
}

export function priceCents(settings, lengthFt, tier) {
  const ft = Math.ceil(Number(lengthFt));
  if (!Number.isFinite(ft) || ft < settings.min_ft || ft > settings.max_ft) {
    throw new Error('invalid length');
  }
  const rate = {
    standard: settings.rate_standard_cents,
    rush: settings.rate_rush_cents,
    hot_rush: settings.rate_hot_rush_cents,
  }[tier];
  if (!rate) throw new Error('invalid tier');
  return ft * rate;
}

router.get('/config', async (req, res, next) => {
  try {
    const s = await loadSettings();
    res.json({
      rates: { standard: s.rate_standard_cents, rush: s.rate_rush_cents, hot_rush: s.rate_hot_rush_cents },
      tiers: tierAvailability(s),
      min_ft: s.min_ft,
      max_ft: s.max_ft,
      shipping_flat_cents: s.shipping_flat_cents,
      promises: TIER_PROMISES,
    });
  } catch (err) { next(err); }
});

export default router;
```

- [ ] **Step 2: Mount in `server/index.js`** — import `gangsheetStoreRouter from './routes/gangsheetStore.js'` beside the other imports; add `app.use('/api/gangsheet-store', gangsheetStoreRouter);` beside `app.use('/api/admin/gangsheets', ...)` (~line 76). The webhook raw-body middleware at line 53 only covers `/api/payments/webhook` — no interaction.

- [ ] **Step 3: Verify** — `node --check server/routes/gangsheetStore.js && node --check server/index.js`.

- [ ] **Step 4: Commit** — `feat(dtf-store): pricing lib + public config endpoint`

---

### Task 3: Server — PNG upload endpoint (multer → Spaces, header-parsed dimensions)

**Files:**
- Modify: `server/routes/gangsheetStore.js` (append), `server/package.json` (add `"multer": "^1.4.5-lts.1"` to dependencies — edit the JSON directly; do NOT run npm install locally)

**Interfaces:**
- Consumes: `uploadObject({ key, body, contentType, acl })` and `SPACES_BUCKET` from `../services/spaces.js` — read that file first and match its actual `uploadObject` signature (it exists at `server/services/spaces.js:51`; if the parameter names differ, follow the file, not this plan).
- Produces: `POST /api/gangsheet-store/upload` (multipart field `file`) → `{ file_key, width_px, height_px, bytes }` | 400 `{ error }`. Key format: `gangsheet-orders/<yyyy-mm>/<random>.png`, uploaded with private ACL.

- [ ] **Step 1: Append the upload route**

```js
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import { uploadObject } from '../services/spaces.js';

const upload = multer({
  dest: '/tmp/gangsheet-uploads',
  limits: { fileSize: 100 * 1024 * 1024 },
});

// PNG dimensions live in the IHDR chunk: bytes 16-19 width, 20-23 height
// (big-endian), after the 8-byte signature + 4-byte length + 'IHDR'.
// Parsing the header directly avoids an image-processing dependency.
function pngDimensions(buf) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(SIG)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

router.post('/upload', upload.single('file'), async (req, res, next) => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const head = Buffer.alloc(24);
    const fd = fs.openSync(tmpPath, 'r');
    fs.readSync(fd, head, 0, 24, 0);
    fs.closeSync(fd);
    const dims = pngDimensions(head);
    if (!dims) return res.status(400).json({ error: 'File must be a PNG' });
    // 22" x 300 DPI = 6,600 px, ±2% tolerance per spec.
    if (Math.abs(dims.width - 6600) > 132) {
      return res.status(400).json({ error: `Sheet must be 6,600 px wide (22" at 300 DPI); got ${dims.width} px` });
    }
    const key = `gangsheet-orders/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.png`;
    await uploadObject({
      key,
      body: fs.createReadStream(tmpPath),
      contentType: 'image/png',
      acl: 'private',
    });
    res.json({ file_key: key, width_px: dims.width, height_px: dims.height, bytes: req.file.size });
  } catch (err) { next(err); }
  finally { if (tmpPath) fs.unlink(tmpPath, () => {}); }
});
```

- [ ] **Step 2: Read `server/services/spaces.js`** and adapt the `uploadObject` call to its real signature (streaming body + private ACL + explicit ContentLength if the SDK requires it for streams — if `uploadObject` only takes buffers, read the tmp file into a buffer instead; 100 MB fits droplet RAM but note it in the commit message).

- [ ] **Step 3: Verify** — `node --check server/routes/gangsheetStore.js`. Confirm `server/package.json` diff adds only multer.

- [ ] **Step 4: Commit** — `feat(dtf-store): PNG upload endpoint with header-parsed dimension validation`

---

### Task 4: Server — checkout endpoint + webhook branch + paid emails

**Files:**
- Modify: `server/routes/gangsheetStore.js` (append checkout), `server/routes/payments.js` (webhook branch, in the `checkout.session.completed` processor around `server/routes/payments.js:482-592` — it already branches on `metadata.quoteId` / `metadata.invoice_id`; add `gang_sheet_order_id`), `server/services/email.js` (append two senders)

**Interfaces:**
- Consumes: `loadSettings`, `tierAvailability`, `priceCents`, `TIER_PROMISES` (Task 2). Stripe client: instantiate exactly as `payments.js` does (read its top — same `process.env.STRIPE_SECRET_KEY` pattern).
- Produces:
  - `POST /api/gangsheet-store/checkout` `{ length_ft, tier, delivery, file_key, width_px?, height_px?, name?, email?, note?, ship_address? }` → `{ url }` (Stripe redirect) | 400 `{ error }`
  - Webhook: sessions with `metadata.gang_sheet_order_id` mark the order `paid` and fire `sendGangSheetPaidToCustomer({ order })` + `sendGangSheetPaidToAdmin({ order })` (both exported from `email.js`).

- [ ] **Step 1: Append checkout to gangsheetStore.js**

```js
import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post('/checkout', async (req, res, next) => {
  try {
    const { length_ft, tier, delivery = 'pickup', file_key, width_px, height_px,
            name, email, note, ship_address } = req.body || {};
    const s = await loadSettings();
    if (!['standard', 'rush', 'hot_rush'].includes(tier)) {
      return res.status(400).json({ error: 'Pick a turnaround option' });
    }
    const avail = tierAvailability(s)[tier];
    if (!avail.available) {
      return res.status(400).json({ error: `That turnaround isn't available right now (${avail.reason}).` });
    }
    if (!['pickup', 'ship'].includes(delivery)) return res.status(400).json({ error: 'Invalid delivery option' });
    if (!file_key || !/^gangsheet-orders\/[\w-]+\/[\w-]+\.png$/.test(String(file_key))) {
      return res.status(400).json({ error: 'Upload your sheet first' });
    }
    let cents;
    try { cents = priceCents(s, length_ft, tier); }
    catch { return res.status(400).json({ error: `Length must be ${s.min_ft}–${s.max_ft} ft` }); }
    // Height must fit the purchased length (1 ft = 3,600 px, +2% tolerance).
    if (height_px && height_px > Math.ceil(length_ft) * 3600 * 1.02) {
      return res.status(400).json({ error: 'Your file is taller than the sheet length you picked — bump the length up' });
    }
    const shippingCents = delivery === 'ship' ? s.shipping_flat_cents : 0;

    const ins = await pool.query(
      `INSERT INTO gang_sheet_orders
        (customer_name, customer_email, length_ft, tier, price_cents, shipping_cents,
         delivery, ship_address, file_key, file_width_px, file_height_px, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [name || null, email || null, Math.ceil(Number(length_ft)), tier, cents, shippingCents,
       delivery, ship_address ? JSON.stringify(ship_address) : null,
       file_key, width_px || null, height_px || null, note || null],
    );
    const orderId = ins.rows[0].id;

    const domain = process.env.PUBLIC_URL || 'https://tshirtbrothers.com';
    const tierLabel = { standard: 'Standard', rush: 'Rush', hot_rush: 'Hot Rush' }[tier];
    const lineItems = [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `DTF Gang Sheet 22in × ${Math.ceil(Number(length_ft))} ft — ${tierLabel}`,
          description: TIER_PROMISES[tier],
        },
        unit_amount: cents,
      },
      quantity: 1,
    }];
    if (shippingCents > 0) {
      lineItems.push({
        price_data: { currency: 'usd', product_data: { name: 'Shipping (flat)' }, unit_amount: shippingCents },
        quantity: 1,
      });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: email || undefined,
      success_url: `${domain}/dtf/success?order=${orderId}`,
      cancel_url: `${domain}/dtf`,
      metadata: { gang_sheet_order_id: String(orderId) },
    });
    await pool.query('UPDATE gang_sheet_orders SET stripe_session_id = $1 WHERE id = $2', [session.id, orderId]);
    res.json({ url: session.url });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Webhook branch in payments.js** — read the `checkout.session.completed` processor (`payments.js:482+`). BEFORE its existing "no quoteId or invoice_id" warning fallback, add:

```js
  const gangSheetOrderId = session.metadata?.gang_sheet_order_id;
  if (gangSheetOrderId) {
    const { rows } = await pool.query(
      `UPDATE gang_sheet_orders
         SET status = 'paid', paid_at = now(),
             customer_email = COALESCE(customer_email, $2),
             customer_name = COALESCE(customer_name, $3)
       WHERE id = $1 AND status = 'pending_payment' RETURNING *`,
      [gangSheetOrderId, session.customer_details?.email || null, session.customer_details?.name || null],
    );
    if (!rows[0]) {
      console.error(`[Stripe Webhook] gang_sheet_order ${gangSheetOrderId} missing or not pending — session ${session.id}; MONEY RECEIVED, investigate`);
      return;
    }
    const order = rows[0];
    Promise.allSettled([
      sendGangSheetPaidToCustomer({ order }),
      sendGangSheetPaidToAdmin({ order }),
    ]).then((results) => results.forEach((r) => {
      if (r.status === 'rejected') console.error('[Stripe Webhook] gang sheet email failed:', r.reason?.message);
    }));
    return;
  }
```

Import the two senders at the top of payments.js alongside its existing email imports. Match the surrounding function's async/await style exactly (read it first — if the processor isn't async at that point, follow its promise style).

- [ ] **Step 3: Emails in email.js** — append, following the file's `detailRow`/layout helpers (read a nearby sender like `sendInstantQuoteToAdmin` and mirror its structure and export style):

```js
export async function sendGangSheetPaidToCustomer({ order }) {
  // Subject: `Order #${order.id} confirmed — DTF Gang Sheet 22in × ${order.length_ft} ft`
  // Body rows: size, tier promise (import TIER_PROMISES from ../routes/gangsheetStore.js),
  // total $((order.price_cents + order.shipping_cents)/100).toFixed(2),
  // delivery (pickup address for 'pickup' — reuse the footer address the other emails use — or "ships to you"),
  // and the note that we'll email again when it's ready.
}
export async function sendGangSheetPaidToAdmin({ order }) {
  // Subject: `💰 ${order.tier === 'hot_rush' ? 'HOT RUSH — ' : order.tier === 'rush' ? 'RUSH — ' : ''}Gang sheet order #${order.id} (${order.length_ft} ft)`
  // Body: customer contact, size/tier/delivery/total, order note, and a link
  // to https://tshirtbrothers.com/admin/dtf-orders . Tier urgency leads the subject
  // so a Hot Rush interrupts.
}
```

Write these as REAL implementations following the file's own HTML-building helpers — the comments above define the required content, the file defines the style. (The implementer must not leave these as comments.)

- [ ] **Step 4: Verify** — `node --check` on all three files.

- [ ] **Step 5: Commit** — `feat(dtf-store): checkout session + webhook branch + paid emails`

---

### Task 5: Server — admin endpoints (queue, status, private file download)

**Files:**
- Modify: `server/routes/gangsheetStore.js` (append admin sub-routes), `server/services/email.js` (append `sendGangSheetReadyToCustomer({ order })`)

**Interfaces:**
- Consumes: `authenticate, adminOnly` from `../middleware/auth.js` (same import as `server/routes/gangsheet.js:3`); `getSpacesClient`, `SPACES_BUCKET` from `../services/spaces.js`; `GetObjectCommand` from `@aws-sdk/client-s3` (already a server dependency — verify in package.json; it is what spaces.js uses).
- Produces:
  - `GET /api/gangsheet-store/admin/orders?status=open|all` → array of orders (open = paid/in_production/ready), newest Hot Rush first: `ORDER BY (tier = 'hot_rush') DESC, (tier = 'rush') DESC, paid_at ASC NULLS LAST`
  - `PATCH /api/gangsheet-store/admin/orders/:id` `{ status }` → updated row; sets `ready_at`/`completed_at` timestamps; transitioning to `ready` fires `sendGangSheetReadyToCustomer`
  - `GET /api/gangsheet-store/admin/orders/:id/file` → streams the private PNG from Spaces with `Content-Disposition: attachment; filename="order-<id>.png"`

- [ ] **Step 1: Append the admin routes**

```js
import { authenticate, adminOnly } from '../middleware/auth.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSpacesClient, SPACES_BUCKET } from '../services/spaces.js';

const adminGuard = [authenticate, adminOnly];

router.get('/admin/orders', ...adminGuard, async (req, res, next) => {
  try {
    const openOnly = (req.query.status || 'open') !== 'all';
    const { rows } = await pool.query(
      `SELECT * FROM gang_sheet_orders
        ${openOnly ? `WHERE status IN ('paid','in_production','ready')` : ''}
        ORDER BY (tier = 'hot_rush') DESC, (tier = 'rush') DESC, paid_at ASC NULLS LAST, created_at DESC
        LIMIT 200`,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

const NEXT_STATUSES = ['paid', 'in_production', 'ready', 'completed', 'canceled'];
router.patch('/admin/orders/:id', ...adminGuard, async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!NEXT_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const { rows } = await pool.query(
      `UPDATE gang_sheet_orders SET status = $1,
         ready_at = CASE WHEN $1 = 'ready' THEN now() ELSE ready_at END,
         completed_at = CASE WHEN $1 = 'completed' THEN now() ELSE completed_at END
       WHERE id = $2 RETURNING *`,
      [status, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    if (status === 'ready' && rows[0].customer_email) {
      sendGangSheetReadyToCustomer({ order: rows[0] })
        .catch((e) => console.error('[dtf-store] ready email failed:', e.message));
    }
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/admin/orders/:id/file', ...adminGuard, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT file_key FROM gang_sheet_orders WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
    const obj = await getSpacesClient().send(new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: rows[0].file_key }));
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="order-${req.params.id}.png"`);
    obj.Body.pipe(res);
  } catch (err) { next(err); }
});
```

Import `sendGangSheetReadyToCustomer` from `../services/email.js`.

- [ ] **Step 2: `sendGangSheetReadyToCustomer({ order })` in email.js** — real implementation in the file's house style: subject `Your DTF transfers are ready! — Order #${order.id}`; body: pickup instructions + shop address/hours for `delivery='pickup'`, "your order has shipped" wording for `'ship'`.

- [ ] **Step 3: Verify** — `node --check server/routes/gangsheetStore.js server/services/email.js`. Confirm `@aws-sdk/client-s3` is in `server/package.json` dependencies (it is — spaces.js imports it); if the import name differs there, mirror spaces.js.

- [ ] **Step 4: Commit** — `feat(dtf-store): admin queue, status transitions + ready email, private file download`

---

### Task 6: Client — /dtf page, success page, admin queue page, routes + links

**Files:**
- Create: `client/src/pages/DtfStorePage.tsx`, `client/src/pages/DtfSuccessPage.tsx`, `client/src/pages/AdminDtfOrdersPage.tsx`
- Modify: `client/src/App.tsx` (three routes), `client/src/components/layout/Navbar.tsx` (nav entry), `client/src/pages/InstantQuotePage.tsx` (cross-link), `client/scripts/prerender.mjs` (add `/dtf` if routes are a static list — READ the file first; if routes come from a fetched sitemap, update the sitemap source instead, `server` grep: `sitemap`)

**Interfaces:**
- Consumes: `GET /api/gangsheet-store/config`, `POST /upload` (multipart), `POST /checkout` (Task 2–4 shapes, cents fields). `trackEvent` — copy the tiny helper from `InstantQuotePage.tsx` (module-level `trackEvent(event, data)` wrapping `window.umami`) into DtfStorePage rather than importing across pages.
- Produces: routes `/dtf`, `/dtf/success`, `/admin/dtf-orders`.

- [ ] **Step 1: DtfStorePage.tsx** — single-screen order form in the site's house style (Layout + Seo, orange accents, cards). Structure (all in one file, ~400 lines):
  - `useQuery(['dtf-config'], fetch /api/gangsheet-store/config)`.
  - **Length stepper**: numeric input + −/+ buttons, clamped to `min_ft..max_ft`; live line `22" × N ft`.
  - **Tier pills**: three pill buttons from `config.tiers`; unavailable tiers render disabled with their `reason` under the label; each shows `$(rate/100)/ft` and the promise string.
  - **Delivery pills**: Pickup (free, Fairburn) / Ship (+`$(shipping_flat_cents/100)`); `ship` reveals name/address fields (line1, city, state, zip — kept in local state, sent as `ship_address`).
  - **Upload dropzone**: accepts one PNG; before uploading, client-side dimension check via `createImageBitmap`/`Image` — reject non-6600±132-px-wide files with the same message the server uses; if `height_px > length_ft × 3600`, show one-tap **"Bump to N ft (+$X)"** that raises the stepper. On accept, `POST /upload` via `FormData` + `fetch`, progress via `XMLHttpRequest` if `fetch` progress isn't worth the complexity — a simple "Uploading…" spinner is acceptable Phase 1. Store `{file_key, width_px, height_px}`.
  - **Transparent-background checklist**: required checkbox — "My file is a transparent-background PNG at print size. What I upload is exactly what prints."
  - **Price summary card** (sticky on mobile bottom): `N ft × $rate = $X` + shipping line + total; **Checkout** button disabled until file uploaded + checkbox ticked + email non-empty (collect email + name inline above the button); on click `POST /checkout` → `window.location.href = url`; surface 400 errors inline (cutoff race: the message from the server IS the UX).
  - Umami events: `dtf-tier-pick {tier}`, `dtf-upload`, `dtf-checkout-start {ft, tier}`.
  - Copy blocks: hero line "DTF Transfers by the Foot — 22″ gang sheets, $9/ft" (pull rate from config, don't hardcode), file-requirements list (PNG · transparent · 300 DPI · 22″/6,600 px wide · max 100 MB), and the tier-promise table.
- [ ] **Step 2: DtfSuccessPage.tsx** — thank-you card: "Payment received — order #N. We emailed your confirmation. {tier promise}." Reads `?order=` for display only (no auth, no data fetch — keep it dumb).
- [ ] **Step 3: AdminDtfOrdersPage.tsx** — clone `GangSheetPage.tsx`'s admin-gate pattern (`client/src/pages/GangSheetPage.tsx:10-27` — token check + `/api/auth/me` role check) around a queue table: rows = id, size/tier badge (Hot Rush = red, Rush = amber), customer, delivery, paid time + a countdown label against the promise (computed client-side: hot_rush = same-day EOD, rush = next business day EOD, standard = paid+2 business days), Download button (`/api/gangsheet-store/admin/orders/:id/file` with auth header via fetch → blob), and status-advance buttons (paid→in_production→ready→completed, plus cancel). `useQuery` with 30 s `refetchInterval`.
- [ ] **Step 4: Routes in App.tsx** — `/dtf` → DtfStorePage, `/dtf/success` → DtfSuccessPage, `/admin/dtf-orders` → AdminDtfOrdersPage (imports at top, routes beside `/sale`'s).
- [ ] **Step 5: Links** — Navbar: add `{ label: 'DTF Transfers', href: '/dtf' }` to `subNavEntries` (after 'Get a Quote'; it feeds the hamburger). InstantQuotePage: in the `dtfpress` seed-card's custom form amber banner (find `Pressing is priced live`), append a second sentence: `Need the transfers printed? <Link to="/dtf">Order a gang sheet from $9/ft →</Link>` — since the banner is a string today, convert that banner's press-only branch to JSX children. DtfStorePage gets the mirror link: "Want us to press these for you? $3/shirt — <Link to='/quote'>start a quote</Link>."
- [ ] **Step 6: prerender.mjs** — read it; add `/dtf` to its route source so the page prerenders (skip `/dtf/success` and `/admin/dtf-orders`).
- [ ] **Step 7: Commit** — `feat(dtf-store): customer /dtf page, success page, admin queue, nav + cross-links`

---

### Task 7: Migrate, install, deploy, verify

**Files:** none (ops)

- [ ] **Step 1: Push branch → type-check on droplet** (worktree + symlink BOTH node_modules, per the established trick):

```bash
git push origin HEAD
ssh root@198.211.113.144 '
  cd /var/www/tshirtbrothers &&
  rm -rf /tmp/dtfck; git worktree prune; git worktree add -q /tmp/dtfck <BRANCH-OR-SHA>
  ln -sfn /var/www/tshirtbrothers/client/node_modules /tmp/dtfck/client/node_modules
  ln -sfn /var/www/tshirtbrothers/node_modules /tmp/dtfck/node_modules
  cd /tmp/dtfck/client && npx tsc -b --force; echo "tsc exit: $?"
  cd /var/www/tshirtbrothers && git worktree remove --force /tmp/dtfck'
```
Fix and repeat until `tsc exit: 0`.

- [ ] **Step 2: Apply migration** (before the code that needs it):

```bash
ssh root@198.211.113.144 'cd /var/www/tshirtbrothers && git fetch origin && git show origin/<BRANCH>:server/migrations/gang_sheet_store_v1.sql | sudo -u postgres psql tshirtbrothers'
```
(Adjust DB name to what `server/.env` `DB_NAME` says — check first: `grep DB_ /var/www/tshirtbrothers/server/.env`.)

- [ ] **Step 3: Install multer on droplet** — `ssh root@198.211.113.144 'cd /var/www/tshirtbrothers/server && npm install multer@^1.4.5-lts.1'` (quick-deploy won't).

- [ ] **Step 4: Merge to main + deploy** — ff-push then `bash /var/www/tshirtbrothers/quick-deploy.sh`; confirm `tshirtbrothers-api` restarts clean (`pm2 logs tshirtbrothers-api --lines 20 --nostream` — a bad import crashes the API at boot, watch for restart loops).

- [ ] **Step 5: End-to-end QA** (browser, then Kevin):
  1. `/dtf` loads; config prices show $9/$11/$15; tier availability matches the clock (after 1:30 PM Atlanta, Hot Rush disabled with reason).
  2. Upload a wrong-width PNG → clean client-side rejection; a correct 6,600-px-wide test PNG → uploads, dimensions shown.
  3. Height > length → "Bump to N ft" flow raises price correctly.
  4. Checkout button disabled until file + checkbox + email present.
  5. Checkout redirects to Stripe with correct line items (verify amounts on the Stripe page, then CANCEL — do not pay).
  6. **Kevin**: one real $9 1-ft Standard pickup order end-to-end, verify webhook flips it to `paid`, both emails arrive, order appears in `/admin/dtf-orders`, Download returns the exact uploaded PNG, advance to `ready` fires the ready email — then refund the $9 in the Stripe dashboard.
  7. `/dtf` present in prerendered output (`curl -s https://tshirtbrothers.com/dtf | grep -c "DTF Transfers"` ≥ 1).

- [ ] **Step 6: Report** — funnel note: Umami events now cover the page; compare card-taps on `quote-card-tap {card: dtfpress}` vs `/dtf` traffic after a week.

---

## Self-review notes (already applied)

- Spec coverage: pricing/settings (T1/T2), cutoffs enforced client+server (T2/T4/T6), upload + validation + bump-to-N-ft (T3/T6), prepaid Stripe + webhook + unknown-order loud failure (T4), lifecycle + queue + ready email (T5/T6), cross-links + analytics + prerender (T6), decisions table values embedded in Global Constraints. Phase 2/3 items intentionally absent.
- Deviation from spec, deliberate: server-side dimension check parses the PNG header (width always; height also available) rather than adding an image library — satisfies "client + server" validation without new heavy deps.
- Stripe amounts are integer cents end-to-end; no float math on money anywhere in the plan.
