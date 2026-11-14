# T-Shirt Brothers quote, Studio, and order redesign

Development only. PR #92 remains a draft. Main deploys automatically; do not
merge, push main, invoke deployment workflows, or run production migrations
without Kevin's approval.

## Requirements recovered from the November 14 discussion

- Every order needs a requested in-hands date immediately after product type,
  stored throughout quote, dashboard, production, and customer account.
- Keep the existing Studio tools, saved designs, PDF/DST importer, payment
  accounting, and working product flows.
- Garments offer Help Me Choose (estimated quality tiers) and I Know What I
  Want (exact catalog product), with multiple products, colors, sizes, quantity,
  artwork assigned to products/locations, and every mockup/view preserved.
- Studio visual direction: realistic garments, neutral gray canvas, compact
  tools, prominent front/back/sleeves, persistent product details and Get Price;
  retain TSB orange branding.
- Dedicated paths: garment/Studio, embroidery, sublimation, rhinestone, vinyl,
  and DTF-only. Non-garment jobs must not ask garment-size questions.
- Garment/custom auto-prices remain provisional: shop verifies charges and
  issues an official quote; credit actual deposits, require acceptance of
  revised totals, collect deposit before artwork, approve proofs before buying
  blanks or gang sheets. Unpaid official quotes go to Quoted, later Unresponsive,
  retaining history.
- DTF is the exception: full payment upfront, no garment quote/deposit. First
  choose graphics or finished gang sheets. Support multiple files with previews,
  dimensions, per-file copy quantity and replacement/removal. 22/34-inch rolls,
  linear-foot pricing; chest/front/back/sleeve placement suggestions, oversized
  prints above 12 inches, auto layout and opt-in fit-to-one-foot resizing.
  Production outputs must be true-alpha 300-DPI PNGs, with low-resolution
  warnings. Retain originals and finals durably for download and reorder.
- Admin shows all products and proofs, no AI triage; shared production milestones
  for blanks, DTF, embroidery and fulfillment. Status changes must coordinate
  email, SMS, Stripe links, UI notifications, counts, tabs and next actions;
  notification links must open the specific order.

## Implemented and verified in this continuation

### Stage 1 — intake correctness and persistence

- Fixed PR #92's undefined `requested_need_by` variable and double-escaped date
  regex that broke `/api/quote/calculate`.
- Real calendar-date validation; quote saves require a date before database
  acquisition. Live calculation remains usable before a date is chosen.
- Canonical `quotes.date_needed` and JSON requested date persist together;
  customer/admin acknowledgment emails show the requested date.
- Exact products are repriced from catalog data; caller-supplied prices cannot
  override the server, and unavailable selected products no longer silently
  downgrade to generic tier pricing.
- All four artwork locations and per-product mockups persist; sleeve artwork
  cannot be saved at a one-location price. Transaction tests verify two
  independent catalog products, colors, date, assets, COMMIT and release.

### Stage 2 — customer and admin handoff

- Studio exports both sleeve views sequentially along with front/back; a
  sleeve-only design no longer creates a phantom front export.
- Easy Quote supports assigning each upload to selected products and locations;
  Studio assets remain with their selected garment. Classic quote retains its
  existing multiple-product catalog configuration and now stores a required date.
- Exposed exact-product path before customers fill in the tier wizard; retained
  the existing calculator instead of replacing its capabilities.
- DTF-only and rhinestone cards enter their dedicated existing workflows.
- Rhinestone quote saves require a date.
- Admin quote drawer displays original artwork and mockups by product; removed
  quote AI triage presentation while retaining unrelated AI tools.
- Full order view retrieves all linked mockups and exposes the existing
  embroidery PDF/DST workflow. Timeline distinguishes prepared mockups from
  actual approval (preparation must not be represented as approval).
- Public proof fallback supports back-only/sleeve-only submissions.

### Stage 3 — dedicated intake dates and retained DTF purchases

- Public `/quotes`, embroidery intake and DTF paid checkout validate a required
  calendar date before DB, upload or payment work; CGC/embroidery/DTF forms
  collect it. DTF also enforces its artwork agreement on the server.
- Prepared nullable `date_needed` columns for embroidery and DTF orders;
  existing records with no known date remain blank.
- DTF requested dates appear in the production queue, dashboard schedule,
  confirmation email, and account. Embroidery dates appear in admin forms,
  the token-gated request status and account; garment orders now show dates
  in the account's Orders tab as well as Quotes.
- Added signed-in customer DTF purchase history, short-lived private print-file
  downloads, and reorder entry into the existing full-payment checkout.
  Ownership is resolved against the current account, not caller-supplied email;
  unpaid orders are excluded. Reorders require a new date and use current rates.
- Corrected abandoned-checkout cleanup so an abandoned reorder cannot delete
  the file belonging to a paid purchase; regression tests cover shared files.

## Remaining stages — not implemented or certified complete

1. Finish separate method-driven fields for sublimation/vinyl and mixed-method
   jobs. Extend requested dates to admin-created/manual invoice and mockup
   conversion paths, and synchronize linked quote/embroidery changes. Public
   quote/embroidery/DTF intake and customer account dates are covered above.
2. Complete same-family multiple-style Easy Quote selection and per-product
   colors/quantities. Classic currently supports multiple exact products.
3. DTF multi-file cart, per-file copies/placements/dimensions, composed layout,
   opt-in resize/fit approval, oversized pricing, account originals/finals and
   reorder for individual source graphics. Existing single-sheet paid purchases
   now have account download/reorder; multi-file cart is still outstanding.
   Preserve existing 22/34-inch paid checkout and private uploads.
4. Implement official quote review/revision state, payment/art/proof ordering
   guards and shared milestones consistently across all admin entry points.
   A paid provisional deposit must not bypass official quote review.
5. Audit/update notification, SMS/email, Stripe webhook idempotency, deep links,
   badges and Quoted/Unresponsive tab movement as one transition system.
6. Studio visual redesign with before/after visual review at phone/tablet/desktop
   sizes, preserving tools and all saved-design formats.
7. Staging end-to-end validation with database, file storage and Stripe test
   mode, including existing-order regression and customer account/reorder.

## Validation and limits

- Server suite and focused route tests use local doubles; no production DB,
  payment, customer email/SMS or upload was performed.
- Client verification: TypeScript plus Vite `build:nopre` (not the deployment
  script). Existing large-chunk/WASM bundler notices remain.
- Browser smoke test attempted with Puppeteer, but Chromium launch was refused
  by the execution environment (`socket() failed: Operation not permitted`).
  Responsive rendering and real browser end-to-end behavior remain unverified.
- No production migration or deployment has been run. Do not merge this draft
  as a claim that the complete redesign is finished.

## Stage 3 verification and migration dependency

- Server suite: 297 passed, 2 skipped, 0 failed (299 total).
- New tests cover missing/impossible dates across three intake routes, the DTF
  artwork agreement, authentication, ownership-scoped queries, private download
  access, reorder dimensions and retention when a reorder is abandoned.
- Client TypeScript/Vite build and `git diff --check` must pass before upload.
- `server/migrations/zz_quote_workflow_dates.sql` is prepared, NOT applied.
  It must be applied by a role owning both tables before releasing this code.
  Older embroidery migrations document that the application role may not own
  `embroidery_requests`; do not rely on the boot runner to resolve permissions.
  No live database/migration or Stripe test-mode integration has been exercised.
