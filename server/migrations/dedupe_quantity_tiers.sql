-- Quantity tiers got duplicated (ids 1-7 and 8-14 hold the same ranges),
-- so the Instant Quote page shows every tier button twice. Keep the lower
-- id of each (min_qty, max_qty) pair and drop the rest, then add a unique
-- index so the admin upsert route can't reintroduce duplicates.

DELETE FROM instant_quote_quantity_tiers a
USING instant_quote_quantity_tiers b
WHERE a.min_qty = b.min_qty
  AND COALESCE(a.max_qty, -1) = COALESCE(b.max_qty, -1)
  AND a.id > b.id;

CREATE UNIQUE INDEX IF NOT EXISTS instant_quote_quantity_tiers_range_unique
  ON instant_quote_quantity_tiers (min_qty, COALESCE(max_qty, -1));
