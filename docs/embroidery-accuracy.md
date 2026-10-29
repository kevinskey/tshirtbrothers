# Embroidery accuracy reporting

Open the PNG stitch estimator and expand **Estimate accuracy & calibration samples**. This staff-only dashboard reads every saved estimate, not the 30-item recent list or the current quote alone. Existing manual/DST-header actual counts are reused. No algorithm, preview, pricing or quote-application behavior changes.

## Measurement

For each valid positive estimate/actual pair, signed percentage error is `(estimate - actual) / actual * 100`. MAPE is the mean absolute percentage error. Bias is the mean signed percentage error: positive means overestimation. Zero pairs return null metrics (displayed as a dash), not zero error. Counts expose missing actuals and actuals with unusable estimates. Review outliers use a fixed absolute error **greater than 30%**; this is an operational review threshold, not a statistical significance test. Small actual counts can produce large percentage errors. Outliers remain in aggregate metrics.

Coverage and dimensions come from each saved estimate. Coverage describes visible artwork, not the eventual stitch density. Sparse is <35%, mixed is 35–<70%, dense is ≥70%. Finished size groups use longest side: small ≤4 inches, medium >4–8, large >8. Unknown values remain unclassified. Staff can open any table row (including old records outside the recent list), label simple/moderate/complex artwork, and record the actual count. Definitions appear in the dashboard. Filters select table records; group summaries and top metrics always describe the whole dataset.

## Collection and calibration

Production database contents are not available in a repository checkout. No production sample count or accuracy claim was inferred from code or synthetic tests, and no correction factors have been fitted. The live endpoint evaluates the current records when an authenticated staff member opens the dashboard.

The initial collection target is at least 30 independent designs and at least 5 paired counts in each complexity, coverage and size group. The dashboard reports deficits per group; a design can satisfy multiple groups. Meeting marginal targets is only readiness for human review: it does not prove representative joint coverage or statistical reliability. Unclassified designs should be labeled. Seek simple lettering, moderate multicolor logos, fine-detail complex designs, sparse outlines and dense fills at left-chest, mid-size and large finished sizes, including combinations used frequently in production.

Confirm that actual counts correspond to the exact saved artwork and finished dimensions. Avoid counting repeated artwork as independent examples. Review DST headers against digitizing software when possible; header counts are user-supplied observations, not independently verified ground truth. Investigate flagged errors for size mismatch, background treatment, fabric, underlay, density and digitizer choices. Retain genuinely difficult samples. Before any correction-factor work, document independent design families, estimator/settings cohorts, representative combinations, fabric and digitizing conditions, and reserve unseen designs for validation. The current estimator has no historical version identifier, so pooled metrics alone cannot certify a future algorithm revision. No automatic corrections or automatic customer pricing are enabled by this feature.

## API and storage

- `GET /api/admin/stitch-estimator/saved/accuracy`: no-store observational report, all saved records, no artwork assets or customer data included.
- `POST /api/admin/stitch-estimator/saved/:id/calibration`: `{ "complexity": "simple|moderate|complex|unclassified" }`. Stores only this new metadata at `data.calibration`; estimate values and assets are preserved with `jsonb_set`.
- Both reuse the existing authenticated admin router, database table and actual-count endpoint. No migration required.

## Validation

Focused tests: `node --test server/lib/embroideryAccuracy.test.js server/routes/embroideryEstimates.test.js`.
Client: `npm run build:nopre --workspace client`.

Manual production check: log in as staff; expand the dashboard; inspect paired count and deficits; open a design; classify it; record a matching actual count; verify dashboard refresh and reopen persistence. Verify an old saved design, preview download, mockup opening and quote application. No production records should be fabricated merely to test this flow.
