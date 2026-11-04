-- Non-apparel line items on quotes: delivery/courier, bagging, gift wrapping,
-- art, digitizing, setup, rush and misc fees.
--
-- Fees live in quote_items like everything else, but they are NOT garments:
-- their quantity must not inflate the quote's garment count, and a fee must
-- never become the quote's headline product_name (rebuildQuoteTotals picks
-- the first item for that). item_type is what lets those two reads skip them.
--
-- 'product' = a garment/physical item, 'fee' = a service or charge line.

ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS item_type VARCHAR(32) NOT NULL DEFAULT 'product';

-- Backfill: existing fee-ish rows were typed in as free-text custom items
-- with no catalog product and no per-size counts. Name match is the only
-- signal we have; it's narrow on purpose so a real product named e.g.
-- "Delivery Bag" isn't reclassified.
UPDATE quote_items
   SET item_type = 'fee'
 WHERE item_type = 'product'
   AND product_id IS NULL
   AND COALESCE(jsonb_array_length(sizes), 0) = 0
   AND product_name ~* '(fee|digitiz|gift wrap|bagging|polybag|courier|setup charge|art charge)';
