-- Quotes become a header for an ordered list of line items.
-- Before: 1 quote = 1 product (product_id, quantity, sizes, color, print_areas,
-- estimated_price all on the quotes row).
-- After:  1 quote = N line items in quote_items, with the legacy quote columns
-- kept around so older code paths (customer accept page, instant-quote saves,
-- invoice/email generation) keep working while we cut over.
--
-- Backfill: every existing quote that has a product_id or product_name gets
-- exactly one row in quote_items derived from its current single-product
-- fields. The application reads from quote_items if any exist, otherwise
-- falls back to the legacy columns.
--
-- Run:  psql "$DATABASE_URL" -f server/migrations/quote_items_table.sql

CREATE TABLE IF NOT EXISTS quote_items (
  id             SERIAL PRIMARY KEY,
  quote_id       INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL DEFAULT 0,
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name   VARCHAR(255),           -- snapshot of the name at quote time
  color          VARCHAR(100),
  sizes          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{size, quantity}, ...]
  quantity       INTEGER NOT NULL DEFAULT 0,           -- total across sizes
  print_areas    JSONB NOT NULL DEFAULT '[]'::jsonb,
  design_url     TEXT,
  unit_price     NUMERIC(10,2),
  line_total     NUMERIC(10,2),
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON quote_items(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_items_position ON quote_items(quote_id, position);

-- Backfill: one line item per existing quote, only if it doesn't already
-- have items (idempotent — safe to re-run after partial runs).
INSERT INTO quote_items (
  quote_id, position, product_id, product_name, color, sizes, quantity,
  print_areas, design_url, unit_price, line_total
)
SELECT
  q.id,
  0,
  q.product_id,
  COALESCE(q.product_name,
           (SELECT name FROM products WHERE id = q.product_id)),
  q.color,
  COALESCE(q.sizes, '[]'::jsonb),
  COALESCE(q.quantity, 0),
  COALESCE(q.print_areas, '[]'::jsonb),
  q.design_url,
  CASE
    WHEN q.quantity IS NOT NULL AND q.quantity > 0 AND q.estimated_price IS NOT NULL
      THEN ROUND(q.estimated_price::numeric / q.quantity, 2)
    ELSE NULL
  END,
  q.estimated_price
FROM quotes q
WHERE NOT EXISTS (SELECT 1 FROM quote_items qi WHERE qi.quote_id = q.id);
