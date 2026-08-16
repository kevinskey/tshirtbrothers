# DTF Gang Sheet Store — Customer-Facing Operation Design

**Date:** 2026-08-15
**Status:** Draft for Kevin's review — see **Decisions needed** before any build.
**Reference model:** kolormatrix.com (22" gang sheets by the linear foot; upload
or build; Standard/Rush/Hot-Rush; prepaid at checkout).

## Goal

Sell DTF gang sheet printing directly on tshirtbrothers.com as a prepaid retail
product: a customer sizes a sheet, uploads or builds their art, pays in full,
and picks it up (or has it shipped). No quote round-trip for this product —
price is deterministic (`feet × rate`), so it checks out like merchandise.

This complements, not replaces, the existing flows: the Instant Quote's
"DTF pressing only" card keeps handling *pressing* ($3/each), and full
custom-printed apparel keeps going through quotes.

## What already exists (reuse, don't rebuild)

- **Gang sheet builder** (`client/src/components/gangsheet/`, `/admin/gangsheet`):
  fabric.js canvas, 22" × 300 DPI, 1–20 ft, foot/inch grid, drag + snap,
  per-design quantity duplication, bin-packing auto-layout
  (`lib/gangsheet/binPacking.ts`), DPI utilities (`lib/gangsheet/dpiUtils.ts`),
  size presets, PNG export, and `PRICING` constants (currently KolorMatrix's
  $6/$8/$12 per foot).
- **`gang_sheets` table**: name, `sheet_length_ft`, `pricing_tier`,
  `total_cost`, `layout_json`, `designs`, `status`, `exported_url`.
- **Stripe Checkout plumbing**: quote Lock-In already creates Checkout Sessions
  and consumes `checkout.session.completed` webhooks; gang sheet payment reuses
  the same account/key/webhook endpoint with different metadata.
- **File storage**: DO Spaces via the existing upload path + storage proxy.
- **Umami analytics** for funnel events.

## Products

Two SKUs, mirroring KolorMatrix:

### 1. Upload Your Gang Sheet (Phase 1 — the fast lane)
Customer already has a print-ready gang sheet file.
- Pick **sheet length** (1–20 ft, 22" wide fixed) — slider or stepper, price
  updating live.
- Pick **turnaround tier** (see Turnaround).
- Upload ONE print-ready PNG. "What you upload is exactly what prints."
- Optional order note.
- Pay full amount via Stripe Checkout.

### 2. Build Your Gang Sheet (Phase 2 — customer builder)
Customer lays out individual designs on the sheet in the browser.
- The existing admin builder, opened to customers with a customer mode:
  own sheets only, simplified chrome, mobile-usable viewport.
- Sheet length can auto-grow as designs are added; price ticker always visible
  (`length × rate` for the selected tier).
- "Checkout this sheet" exports the flattened PNG server-side (or client-side
  export upload, as the admin builder does today) and enters the same payment
  flow as Product 1.
- Requires an account (sheets persist across sessions); the fast lane does not.

## Pricing model

- `price = ceil(sheet_length_ft) × per_foot_rate[tier]` — linear, no volume
  discount (matches KolorMatrix; simple to reason about and to change later).
- **Rates are data, not code.** New `gang_sheet_settings` row (or reuse the
  instant-quote settings table pattern): `rate_standard`, `rate_rush`,
  `rate_hot_rush`, `cutoff_rush` (local time), `cutoff_hot_rush`,
  `min_ft`, `max_ft`, `shipping_flat_cents`, `active` per tier. Editable from
  the admin (small settings card on the existing pricing admin page).
- The client shows prices from a `GET /api/gangsheet-store/config` endpoint;
  the SERVER recomputes the price at checkout-session creation. The client
  never sends a price, only `length_ft` + `tier` (+ `shipping` choice).

## Turnaround tiers & cutoffs

Three tiers, names/promises configurable. Kevin's launch promise is
**KolorMatrix's ladder plus one day** (2026-08-15):
- **Standard** — ready in 2 business days.
- **Rush** — ready next business day if ordered before `cutoff_rush` (11:00).
- **Hot Rush** — ready same day if ordered before `cutoff_hot_rush` (1:30).

Cutoff behavior: past the cutoff (America/New_York), the tier's option shows
"available again tomorrow" and is unselectable; the server rejects it too
(clock checked at session-creation time). Weekends: tiers 2–3 disabled
(Mon–Fri only), configurable later if needed.

**Operational reality check (Kevin):** only promise what the shop can staff.
Tier names/promises are copy in the settings row, so tightening or loosening
them is an admin edit, not a deploy.

## File requirements & validation

- PNG only, transparent background, artwork at final print size, 300 DPI
  target, max file size 100 MB.
- Hard validations at upload (client + server): file type, byte size,
  pixel width == 6,600 px (22" × 300 DPI) ± tolerance, pixel height ≤
  `length_ft × 3,600 px` for the chosen length. If height exceeds the chosen
  length, offer one-tap "bump to N ft" (recompute price) instead of erroring.
- Soft warnings (don't block): effective DPI below ~150 (via existing
  dpiUtils logic), fully opaque background detection skipped (too many false
  positives) — instead show a "transparent background required" checklist the
  customer must tick.
- Uploads go to a **private** Spaces prefix (`gangsheet-orders/`), served to
  admin via the storage proxy; customer files are production assets, not
  public.
- Large-file path: the current base64-JSON upload tops out well under 100 MB —
  Phase 1 needs a direct multipart upload endpoint (or presigned PUT via the
  storage proxy) with a progress bar.

## Checkout & payment

- Full prepayment (retail), not the 50% deposit model.
- `POST /api/gangsheet-store/checkout` with `{ length_ft, tier, delivery:
  'pickup'|'ship', file_key, email?, name?, note? }` → server validates
  cutoff + file, computes price (+ flat shipping if shipping), creates a
  Stripe Checkout Session (line item "DTF Gang Sheet 22in × N ft — TIER"),
  `metadata: { gangSheetOrderId }`, and returns the redirect URL.
- Existing webhook endpoint gains a branch: `checkout.session.completed` with
  `gangSheetOrderId` → mark order `paid`, fire emails.
- Guest checkout allowed for the fast lane: email captured by Stripe and
  mirrored onto the order. Logged-in customers get the order attached to their
  account (shows on AccountPage orders list later — Phase 3).
- Refund/cancel handling stays manual via Stripe dashboard (as today).

## Order lifecycle & fulfillment

New `gang_sheet_orders` table (distinct from quotes — different lifecycle):
`id, customer_name, customer_email, customer_phone?, length_ft, tier,
price_cents, shipping_cents, delivery ('pickup'|'ship'), ship_address jsonb?,
file_url, source ('upload'|'builder'), builder_sheet_id?, note, status,
stripe_session_id, paid_at, ready_at, completed_at, created_at`.

Statuses: `pending_payment → paid → in_production → ready → completed`
(+ `canceled`). Transitions are admin actions except `paid` (webhook).

Notifications (existing email service):
- Customer: order confirmation (on paid), "your transfers are ready for
  pickup" / "shipped" (on ready/shipped).
- Admin: new paid order alert with tier + cutoff clock prominently displayed
  (a Hot Rush order needs to interrupt someone).

## Admin

- **Production queue** page (admin): open orders sorted by tier urgency then
  paid time; each row: sheet preview thumbnail, length/tier, countdown against
  the promise, download-file button (via storage proxy), status advance
  buttons. Simplest build: a new tab on the existing admin dashboard.
- **Settings card**: the rates/cutoffs/shipping fields from Pricing model.
- Existing `/admin/gangsheet` builder keeps working for shop-side layout work;
  admin can also create an order on a customer's behalf from a built sheet.

## Customer-facing surface

- New page `/dtf` ("DTF Transfers by the Foot"): hero with per-foot price,
  length picker + tier picker + live price, upload dropzone, checklist,
  checkout button. Follows the site's above-the-fold rule: price + CTA on the
  first screen.
- Nav: "DTF Transfers" entry in the hamburger + Services page card; the
  quote page's "DTF pressing only" card links to it ("Need the transfers
  printed too? Order a gang sheet →") and vice versa ("Want us to press
  these? $3/shirt — start a quote").
- Umami events: `dtf-length-set`, `dtf-tier-pick`, `dtf-upload`,
  `dtf-checkout-start`, plus Stripe completion measured server-side.
- SEO: prerendered marketing copy on `/dtf` (the prerender pipeline already
  covers new routes listed in its config).

## Phasing

- **Phase 1 — Upload fast lane** (the revenue): `/dtf` page, config endpoint,
  direct upload, checkout + webhook, orders table, admin queue tab, emails,
  cross-links, analytics. Ships alone.
- **Phase 2 — Customer builder**: customer mode of the existing builder,
  account-gated, save/resume, checkout from builder. Ships after Phase 1
  proves demand (watch Umami + orders).
- **Phase 3 — Niceties**: orders on AccountPage, reorder button, shipping
  label integration, bulk/volume discounts if competitive pressure demands.

## Decisions needed from Kevin (spec ships with these defaults)

| Decision | Default in this spec | Notes |
|---|---|---|
| Per-foot rates | **DECIDED:** $3 Standard / $4 Rush / $6 Hot Rush | Kevin set $3/ft Standard 2026-08-15; Rush tiers keep KolorMatrix's x1.33/x2 multipliers — confirm those two |
| Turnaround promises | **DECIDED (KolorMatrix + 1 day):** Standard = 2 business days; Rush = next business day by 11:00; Hot Rush = same day by 1:30 | Kevin, 2026-08-15 |
| Weekend service | Mon–Fri only for Rush/Hot Rush | |
| Shipping | Pickup free; flat $6.99 USPS option | Or pickup-only at launch |
| Guest checkout | Allowed on fast lane | Builder requires account |
| Minimum | 1 ft | |

## Error handling

Upload failures surface inline with retry; checkout-session failures show the
price card error pattern from the quote page; a paid webhook for an unknown
order logs loudly and emails admin (money arrived, order missing = must never
be silent). Cutoff race (customer pays at 11:02 for an 11:00 tier): server
validates at session creation, and the webhook accepts whatever the session
was created with — the 2-minute race is absorbed by the shop, not the
customer.

## Out of scope

- Auto-nesting customer files into shared shop sheets (internal efficiency
  play, later).
- Per-square-inch pricing, multi-width sheets, color-matching guide product.
- Changing anything about quote-flow pressing ($3/each) or apparel quoting.

## Testing

Droplet `tsc -b` gates the client; `node --check` on new server routes;
Stripe test-mode session end-to-end before flipping live; manual QA checklist
per phase (upload limits, cutoff boundaries at 10:59/11:01, webhook replay,
admin queue actions, both delivery modes).
