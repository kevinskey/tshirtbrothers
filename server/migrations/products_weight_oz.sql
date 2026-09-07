-- Per-item shipping weight in ounces, derived from S&S caseWeight/caseQty
-- (see scripts/backfill-weights.js). NULL = not yet backfilled; checkout
-- falls back to a default garment weight.
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_oz NUMERIC;
