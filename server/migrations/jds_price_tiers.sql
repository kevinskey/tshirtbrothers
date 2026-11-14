-- Quantity-break pricing for the JDS / Custom Gift Club storefront.
--
-- Until now jds_products carried ONE price, so a customer buying 48 paid
-- the same per unit as a customer buying one. Every competitor selling the
-- same blanks publishes a ladder, so bulk buyers either got quoted by hand
-- or went elsewhere.
--
-- Stored as JSONB on the product rather than as a child table on purpose:
-- the tiers are read on every product fetch and every checkout line, they
-- are always written and replaced as a whole set, and nothing ever queries
-- across products BY tier. A join would buy nothing and cost a round trip.
--
-- Shape: [{"min_qty": 1, "unit_price_cents": 2400}, ...]
--   * ordered ascending by min_qty, lowest tier must be min_qty 1
--   * the price that applies is the LAST tier whose min_qty <= quantity
--   * NULL or [] means no ladder — fall back to retail_price_cents, which
--     is what every existing product does, so this migration changes the
--     price of nothing already published.
--
-- These are BLANK prices. Personalization is added on top per unit at
-- max($5, 25%) exactly as before, so the engraved price falls out of the
-- tier rather than needing a second ladder to be kept in step with it.

ALTER TABLE jds_products
  ADD COLUMN IF NOT EXISTS price_tiers JSONB;

-- Guard the shape at the database rather than trusting every writer. A
-- malformed ladder here would silently mis-price an order, and the row
-- outlives whatever code wrote it.
ALTER TABLE jds_products
  DROP CONSTRAINT IF EXISTS jds_products_price_tiers_shape;

ALTER TABLE jds_products
  ADD CONSTRAINT jds_products_price_tiers_shape CHECK (
    price_tiers IS NULL
    OR (
      jsonb_typeof(price_tiers) = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(price_tiers) AS t
        WHERE jsonb_typeof(t) <> 'object'
           OR jsonb_typeof(t->'min_qty') <> 'number'
           OR jsonb_typeof(t->'unit_price_cents') <> 'number'
           OR (t->>'min_qty')::numeric < 1
           OR (t->>'unit_price_cents')::numeric <= 0
      )
    )
  );

COMMENT ON COLUMN jds_products.price_tiers IS
  'Quantity-break BLANK prices, [{min_qty, unit_price_cents}] ascending. '
  'Last tier with min_qty <= qty wins. NULL/[] falls back to retail_price_cents.';
