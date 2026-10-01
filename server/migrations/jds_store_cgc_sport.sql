-- Custom Gift Club sport/activity facet for the gift catalog.
-- Multi-valued because a few SKUs legitimately serve two sports
-- ("Baseball/Softball Glove Resin"), and NULL/empty for the ~92% of the
-- catalog that has no sport at all. Values are derived from product names
-- by server/lib/cgcSports.js at publish time and in the boot backfill.
ALTER TABLE jds_products ADD COLUMN IF NOT EXISTS cgc_sport TEXT[];

-- Marks rows the classifier has already considered, so the backfill can tell
-- "no sport" apart from "not yet scanned" without rescanning 3,700 rows each boot.
ALTER TABLE jds_products ADD COLUMN IF NOT EXISTS cgc_sport_scanned BOOLEAN NOT NULL DEFAULT FALSE;

-- GIN supports the `? = ANY(cgc_sport)` / `&&` lookups the facet and filter use.
CREATE INDEX IF NOT EXISTS jds_products_cgc_sport_idx
  ON jds_products USING GIN (cgc_sport);
