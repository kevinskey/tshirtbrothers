-- The S&S transformer already produces `style_number` (the brand's model
-- code, e.g. "5000" for Gildan Heavy Cotton), but the products table
-- never stored it — so search by "G500" / "5000" returns nothing.
-- Add the column and a search index for fast ILIKE.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS style_number VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_products_style_number
  ON products (LOWER(style_number)) WHERE style_number IS NOT NULL;
