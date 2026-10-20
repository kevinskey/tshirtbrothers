# Live Hard Truth — livehardtruth.com

Sister-brand streetwear storefront (Leora Johnson's brand), rebuilt from the
original Lovable-hosted site and wired into the TSB backend. Shipped
2026-10-20 on branch `feat/live-hard-truth`.

## Where things live

| Thing | Location |
|---|---|
| Client app | `client/src/lht/` (LhtApp.tsx, pages, components, lib) |
| Host detection | `client/src/lht/lib/brand.ts` — `VITE_LHT_HOSTS`, defaults `livehardtruth.com,www` |
| Path mount (preview) | `tshirtbrothers.com/live-hard-truth` |
| Branded HTML shell | `client/scripts/make-lht-shell.mjs` → `dist/index-lht.html` |
| Brand assets | `client/public/lht/` (campaign + 11 set colorways + cap/mug/journal photos, guide PDF, Leora photo); favicon `client/public/lht-icon.png` |
| Store + products | `server/migrations/lht_v1.sql` — store `live-hard-truth` (`store_type` `business`, subdomain `livehardtruth`), 4 `store_products` |
| Brand API | `server/routes/lht.js` → `/api/lht/leads`, `/api/lht/truth-session`; leads in `lht_leads` |
| nginx vhost | `deploy/nginx/livehardtruth.com.conf` (hand-applied, see header runbook) |

## Money flow

Commerce is 100% the shared store-shop system — nothing brand-specific:

- Product data from `GET /api/store-shop/live-hard-truth[/products|/product/:slug]`.
- Buy-now → `POST /api/payments/create-store-checkout`; bag →
  `create-store-cart-checkout` (bag capped at 10 lines, localStorage `lht_cart`).
- Stripe webhook captures into `store_orders` + `store_ledger`; fulfillment in
  Admin → Web Stores / Store Orders like any store.
- Colorways ride `variants_json.colors`; per-color photography and swatch
  hexes are client-side (`client/src/lht/lib/catalog.ts`). Size upcharges
  (2XL +$2, 3XL +$3) apply from the shared `sizeUpcharges` table.
- Shipping weights come from the `lht:*` pseudo-blank rows seeded into
  `products` (set 42 oz, journal 14, mug 18, cap 6). These are excluded from
  the public blanks shop via `ss_id NOT LIKE 'lht:%'` filters in
  `routes/products.js`.
- **Open item:** the seeded store agreement is `percent_of_retail: 100`
  (all revenue to TSB, store earnings 0). Set Leora's real split in
  Admin → Web Stores before payouts matter. Blank/decoration cost columns on
  the store products are also unset.

## Catalog (lifted from the original site bundle)

| Product | Slug | Price | Variants |
|---|---|---|---|
| LIVE HARD TRUTH Joggers Set | `live-hard-truth-joggers-set` | $124.99 | XS–3XL; 11 colors (Espresso, Onyx, Ember, Merlot, Olive, Red, White, Pink, Blue, Green, Purple) |
| Hard Truth Journal | `hard-truth-journal` | $26.00 | A5 |
| Hard Truth Mug | `hard-truth-mug` | $22.00 | 11 oz / 15 oz |
| Hard Truth Hat | `hard-truth-hat` | $29.99 | One Size; Onyx / Merlot / Olive |

## The Truth Session (`/truth`)

Faithful port of the original 7-step reflection: 6 multiple-choice questions,
an optional free-text "the truth I've been avoiding", then lead capture.
`POST /api/lht/truth-session`:

- Crisis language in the free text (regex in `routes/lht.js`) returns
  `{safety: true}` — the client shows ONLY the 988 lifeline screen, and the
  shop gets a notification email. No reading, no merch upsell.
- Otherwise a **deterministic** scoring engine (no AI dependency) votes the
  answers into one of five Truth Colors (Onyx/Ember/Merlot/Espresso/Olive),
  each with a written reading/hardTruth/nextStep/affirmation personalized
  with the visitor's own answers. The client renders the reading, a share
  card (canvas → Web Share API), and "Shop your color" into the joggers set.
- Every session lands in `lht_leads` (`source='truth'`, answers + color).

## Leads

`POST /api/lht/leads` (`source` `guide` | `newsletter`) → `lht_leads` +
Resend notification to SHOP_NOTIFY_EMAIL. The free guide PDF
(`/lht/the-other-side-of-fourteen-guide.pdf`) unlocks client-side after
submission — same behavior as the original site.

## Bring-up checklist (domain cutover)

1. Deploy main (auto via GitHub workflow) — migration seeds everything;
   verify at tshirtbrothers.com/live-hard-truth first.
2. name.com DNS: repoint livehardtruth.com + www A records from Lovable
   (185.158.133.1) to 198.211.113.144. Keep the Lovable project until after
   cutover in case of rollback.
3. Apply `deploy/nginx/livehardtruth.com.conf` per its header runbook
   (port-80 first, certbot, reconcile, `nginx -t && systemctl reload nginx`).
4. `LHT_DOMAIN=https://livehardtruth.com` in server/.env + pm2 restart
   (optional today — nothing server-side links out yet).
5. No analytics on the LHT shell by design — give LHT its own GA/Clarity IDs
   before adding any.

## Not ported (original site had them, deliberately deferred)

- `/join` — the "AI-hosted community / AI life coaching" page (no backend
  for it here; decide if it's wanted).
- AI-generated readings (original used a Lovable server function + LLM);
  the deterministic engine replaces it.
- Email delivery of the reading/guide (original said "email delivery is not
  available yet" too — leads are captured for a future campaign).
