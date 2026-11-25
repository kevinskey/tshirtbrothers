# Gang sheets as first-class orders

**Status:** spec, not built. Written 2026-11-25.
**Goal, in Doc's words:** "this whole gang sheet process needs to come in just
like quotes."

## 1. What exists today

Gang sheets are two disconnected halves plus a third, parallel order pipeline.

### The builder — `gang_sheets`

| | |
|---|---|
| Table | `gang_sheets` (id, name, sheet_length_ft, width_in, pricing_tier, total_cost, layout_json, designs, exported_url, preview_url, status, created_by, vendor_*) |
| Customer API | `/api/gangsheet-store/sheets` — `server/routes/gangsheetStore.js:670-780`, scoped `created_by = req.user.id`, cap 20 sheets |
| Admin API | `/api/admin/gangsheets` — `server/routes/gangsheet.js` (list, CRUD, `/:id/export`, `/:id/duplicate`, `/:id/send`) |
| Admin UI | AdminPage section `gangsheet` → `GangSheetList` (`AdminPage.tsx:7601`), builder at `/admin/gangsheet` |
| Statuses | `draft`, `exported` — **9 draft, 7 exported today** |

A sheet has **no customer, no price snapshot, no invoice, no order**.
`total_cost` is a running screen total. `exported` means a PNG got rendered,
not that anyone bought anything.

### The store — `gang_sheet_orders`

| | |
|---|---|
| Table | `gang_sheet_orders` (customer_name/email/phone, length_ft, tier, price_cents, shipping_cents, delivery, ship_address, file_key, status, stripe_session_id, paid_at, ready_at, completed_at, vendor_*, printer_pulled_at, quote_sent_at, admin_note) |
| Buy | `POST /api/gangsheet-store/checkout` — `gangsheetStore.js:502`, anonymous + rate-limited, creates the row `pending_payment` + a Stripe session |
| Paid | `server/routes/payments.js:1703` — a dedicated webhook branch that updates `gang_sheet_orders` **only** |
| Admin UI | `AdminDtfOrdersPage.tsx` — its own queue, its own status ladder, its own vendor send, its own print-agent pull |
| Statuses | `pending_payment` → `paid` → `completed` — **11 rows, every one `source = 'upload'`** |

### The handoff that already exists (and what it loses)

The customer builder *can* reach checkout: `/compose` renders the sheet and
returns a `file_key`, the client stashes it in `sessionStorage` and navigates
to `/dtf?from=builder`, where the upload lane completes a normal checkout
(`GangSheetBuilder.tsx:2008-2060`).

That handoff **carries pixels, not identity**. The resulting order records
`source = 'upload'` and no sheet id, so:

- builder orders are indistinguishable from raw uploads,
- the `gang_sheets` row stays `draft`/`exported` forever,
- re-ordering means rebuilding, and
- nobody can answer "did this sheet ever sell?" — which is exactly how
  **Thanksgiving 2026** (sheet 77, 10 designs, 6ft, $71.94, built by a customer
  on 2026-11-14, abandoned after 1 minute) sat in the admin list looking like
  an order that was never ordered.

The **admin** builder has no checkout path at all — export, duplicate, email.

### What a gang sheet order does NOT get (a quote gets all of it)

- No `quotes` row, no order number, no order dossier (`/admin/order/:quoteId`)
- No `invoices` row, so no `payments[]` ledger — the only cash record is
  `paid_at` + `stripe_session_id` on the order row
- No place to record an offline payment (cash/Zelle/Cash App)
- Not on the Today's Work board or the ops dashboard
- Not in the customer's account order history (`AccountPage.tsx` has zero gang
  sheet references)
- No shipped-notification path through `services/shipNotify.js`
- "Send quote" (`gangsheetStore.js:1246`) is a one-off email with an ad-hoc
  Stripe session for an *adjustment* — it is not a quote, nothing records what
  was quoted, and payment of it books nothing to a ledger

## 2. Target model

A gang sheet becomes a **product line on the existing quote → invoice → order
spine**, not a fourth pipeline.

```
gang_sheets (design artifact, reusable)
    │  one sheet can be bought many times
    ▼
quote  ──►  invoice  ──►  payment (Stripe OR offline)  ──►  order dossier
                                                              ├─ vendor send
                                                              ├─ print agent
                                                              └─ ready / shipped
```

Rules:

1. **The sheet is the artifact; the quote is the sale.** Buying a sheet never
   mutates its layout. A sheet bought twice yields two quotes, one sheet row.
2. **`gang_sheet_orders` becomes a fulfillment record, not a money record.**
   Money moves to `invoices.payments[]`, the single ledger
   (see `tsb_money_truth_sources`). The DTF queue keeps print/vendor state.
3. **Pricing stays where it is.** `gang_sheet_store_settings` is the rate card
   (22": $11.99 / $12.99 / $17.00 per ft standard/rush/hot_rush; 34": $17.99 /
   $18.99 / $23.00; $6.99 flat ship; cutoffs 11:00 / 10:00). The quote records
   a **snapshot** of the rate used, the way quote line items already do.
4. **One admin surface.** The DTF queue stays as the *print* view, but every
   gang sheet order also appears in the order dossier and Today's Work.
5. **Tax:** gang sheets are currently sold tax-free; `price_cents` is the whole
   charge. If they move onto invoices, decide explicitly whether 7.75% applies
   — do not let the invoice editor's default tax silently attach (that bug is
   documented in `tsb_money_truth_sources`). **Open decision for Doc.**

## 3. Schema

```sql
-- Identity carried through the handoff
ALTER TABLE gang_sheet_orders ADD COLUMN gang_sheet_id INT REFERENCES gang_sheets(id);
ALTER TABLE gang_sheet_orders ADD COLUMN quote_id INT REFERENCES quotes(id);
CREATE INDEX ON gang_sheet_orders (gang_sheet_id);
CREATE INDEX ON gang_sheet_orders (quote_id);

-- 'builder' joins the existing 'upload'
-- (source is free text today; values: 'upload' x11)

-- Sheet-level sale state, so the list can stop lying
ALTER TABLE gang_sheets ADD COLUMN last_ordered_at TIMESTAMPTZ;
ALTER TABLE gang_sheets ADD COLUMN order_count INT NOT NULL DEFAULT 0;
```

No column is dropped. `price_cents`/`paid_at` stay on the order row as the
historical record; new money flows additionally to the invoice.

## 4. Server work

1. **`lib/orderFromGangSheet.js`** (new, modelled on `lib/orderFromInvoice.js`):
   `ensureQuoteForGangSheetOrder(order)` — creates a `quotes` row (customer
   from the order, one line item "DTF gang sheet — {n}ft {width}\" {tier}",
   `estimated_price` = price + shipping) and the matching invoice, and links
   both back onto `gang_sheet_orders`.
2. **`POST /checkout`** accepts optional `gang_sheet_id` + `source: 'builder'`
   and persists them. Price is still re-derived server-side from the composed
   pixels — never trust the client (the existing comment at
   `gangsheetStore.js:869` is the contract; keep it).
3. **Webhook** (`payments.js:1703`): after stamping `paid_at`, call
   `ensureQuoteForGangSheetOrder` then book the charge through
   `reconcileInvoicePayments()` with `ref = checkout session id` — the same
   double-book interlock quotes use. **Idempotent:** the branch must stay safe
   on Stripe retries.
4. **Offline payment** works with no new endpoint once the invoice exists:
   `POST /invoices/:id/record-payment` already promotes the order
   (`invoices.js:1220`). Zelle/Cash App/Venmo are in the shared method list as
   of `aaf800a`.
5. **Status mapping** — keep the DTF ladder for print state, derive sale state
   from the invoice: `pending_payment` = unpaid invoice, `paid` = paid invoice,
   `completed` = fulfilled. Do not duplicate "is it paid" in two places.
6. **`/admin/orders/:id/send-quote`** gets retired in favour of the real quote
   send, or rewritten to send *the* invoice. It currently mints an untracked
   Stripe session.
7. **Admin builder checkout**: `/api/admin/gangsheets/:id/create-quote` so Doc
   can turn any sheet — including an abandoned customer draft like
   Thanksgiving 2026 — into a quote and send it.

## 5. Client work

- **Builder handoff** passes `gang_sheet_id` + `source: 'builder'` alongside the
  `file_key` stash, and `/dtf` forwards both to `/checkout`.
- **Admin Gang Sheets list** (the screenshot) grows what the quotes list has:
  owner name, real sale state (`Draft` / `Quoted` / `Paid` / `Printed`, not
  `exported`), last ordered date, and a **"Create quote"** action. The price
  column must read as an estimate until a quote exists.
- **Order dossier** renders a gang sheet line with its preview, and the DTF
  queue links to the dossier.
- **AccountPage** lists gang sheet orders in order history.
- **Abandoned-draft follow-up**: a sheet with designs, no order, no edit for N
  days is a sales lead — surface it. Thanksgiving 2026 is $71.94 of it.

## 6. Backfill

11 existing `gang_sheet_orders`, 10 of them money that already cleared.
Backfill quotes+invoices for them so history isn't split across two models,
following the `tsb_money_truth_sources` discipline:

- snapshot first (`CREATE TABLE backfill_gang_sheet_orders_<date> AS SELECT …`),
- derive each payment from Stripe (`stripe_session_id` is on every paid row) —
  **Stripe is ground truth, never synthesize a payment entry**,
- stamp `ref` = session id so reconciliation can never double-book,
- dry-run in a rolled-back transaction, diff, then commit.

## 7. Phasing

| Phase | Ships | Risk |
|---|---|---|
| 1 | Schema + builder passes `gang_sheet_id`/`source` | none — additive |
| 2 | `ensureQuoteForGangSheetOrder` + webhook booking | medium — touches live money, needs the idempotency test |
| 3 | Admin list rework + "Create quote" | low |
| 4 | Dossier + AccountPage + Today's Work | low |
| 5 | Backfill the 11 historical orders | medium — one-way, snapshot first |
| 6 | Retire `send-quote`, abandoned-draft follow-up | low |

Phase 1 alone fixes the identity loss. Phase 2 is where the real care goes:
every money path in this repo that has ever broken, broke at a webhook.

## 8. Open decisions for Doc

1. **Tax** on gang sheets once they live on invoices — currently charged none.
2. **Do gang sheet orders get order numbers** in the main sequence, or keep
   DTF-local ids? (Kim's texts said "order #27" and nobody could find it — that
   argues for one sequence.)
3. **Backfill or line-in-the-sand?** Leaving the 11 historical orders alone is
   cheaper; it also means two shapes of history forever.
4. **Admin builder sheets** — always quote-first, or allow walk-in print with no
   quote?
