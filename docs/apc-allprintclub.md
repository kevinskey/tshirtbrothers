# All Print Club (allprintclub.com)

Sister-brand storefront selling commercial print (business cards, flyers,
postcards, banners, stickers, yard signs) fulfilled by the **4over** trade
printer. Mirrors the CGC pattern: same bundle, same server, own branding.

## Where things live

| Piece | Path |
|---|---|
| Storefront | `client/src/apc/` — mounts at `/print-club/*` on TSB hosts, at `/` on `VITE_APC_HOSTS` (default allprintclub.com) |
| API | `server/routes/apc.js` → `/api/apc` |
| 4over client | `server/services/fourover.js` (auth scheme verified by `server/scripts/fourover-smoke.mjs`) |
| Catalog/orders service | `server/services/apcCatalog.js` |
| Tables | `server/migrations/apc_store.sql` — apc_products / apc_variants / apc_settings / apc_orders / apc_order_items |
| Branded shell | `client/scripts/make-apc-shell.mjs` → `dist/index-apc.html` (in the build chain) |
| nginx vhost | `deploy/nginx/allprintclub.com.conf` (hand-applied; bring-up steps in its header) |

## How money flows

1. Customer configures a product (options → `apc_variants.option_key`),
   uploads print-ready art (front/back via `/api/quotes/upload-design` → Spaces).
2. `POST /api/apc/checkout` re-resolves every price server-side, writes a
   pending `apc_orders` row + items in a transaction, creates the Stripe
   session with `metadata.apc_order_id`.
3. Webhook (`routes/payments.js`) flips the order to `paid`, then calls
   `submitPaidOrderToFourOver()` fire-and-forget:
   - keys configured → `POST /orders` to 4over, store `fourover_order_id`,
     status → `ordered`;
   - keys missing → `fourover_status = 'awaiting_api_keys'` (fulfill
     manually on trade.4over.com);
   - submit error → `fourover_status = 'submit_failed'` + `submit_error`
     (customer is unaffected — they paid; fix and resubmit or order manually).

## Pricing model

Print pricing is **per run** — quantity is a product option, a variant is one
full option combination with one price. Retail = 4over cost ×
(1 + `markup_percent`/100), rounded to psychological price points
(`retailFromCost`). Markup + flat shipping live in `apc_settings`, editable
via `PUT /api/apc/admin/settings` (re-prices all variants). Default 70%.

## Demo catalog vs. real 4over sync

Until the 4over API keys exist, boot seeds 6 demo products
(`seedApcDemoCatalog`, `source='demo'`) with realistic options and plausible
trade costs so the whole flow is testable. When keys land:

1. Put `FOUROVER_PUBLIC_KEY` / `FOUROVER_PRIVATE_KEY` in droplet `server/.env`.
2. `node --env-file=.env scripts/fourover-smoke.mjs` — verifies auth and
   prints real response field names; reconcile them against the parsing in
   `syncFourOverCatalog()` and the `submitOrder` payload (the official docs
   are gated behind the API-license login at api-users.4over.com).
3. `POST /api/apc/admin/sync` (admin JWT) — imports the real catalog
   (products arrive **disabled**; publish from the admin), disables demo rows.

## Bring-up checklist (not yet done)

- [ ] 4over API keys requested from Doc's 4over account rep
- [ ] DNS A records: allprintclub.com + www → 198.211.113.144 (WordPress.com DNS)
- [ ] nginx vhost + LE cert per `deploy/nginx/allprintclub.com.conf` header
- [ ] `APC_DOMAIN=https://allprintclub.com` in droplet `server/.env`, pm2 restart
- [ ] Smoke-test checkout with Stripe test or a cheap real product
- [ ] Admin UI section for APC (products/settings/orders currently API-only)
