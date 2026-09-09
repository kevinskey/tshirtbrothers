-- Quote #164: split the single 200-pc line item into one line per size at
-- the corrected two-sided (2-location) pricing. Per-piece sale price =
-- (garment 4.03 + size upcharge + DTF 2.75 x 2 locations) x 0.78 x 2.
-- Line totals sum to exactly 3082.56, matching quotes.estimated_price.
-- Idempotent: the DELETE only matches the original single line (old total
-- 2224.56); once replaced, the CTE is empty and nothing inserts.
WITH old AS (
  DELETE FROM quote_items
  WHERE quote_id = 164 AND line_total = 2224.56 AND quantity = 200
  RETURNING design_url
)
INSERT INTO quote_items
  (quote_id, position, product_id, product_name, color, sizes, quantity,
   print_areas, design_url, unit_price, line_total)
SELECT
  164, v.pos, NULL, 'Premium T-shirt', 'Black', v.sizes::jsonb, v.qty,
  '["front","back"]'::jsonb, o.design_url, v.unit, v.total
FROM old o,
  (VALUES
    (0, '[{"size":"M","quantity":25}]',  25, 14.87, 371.67),
    (1, '[{"size":"L","quantity":75}]',  75, 14.87, 1115.01),
    (2, '[{"size":"XL","quantity":75}]', 75, 14.87, 1115.01),
    (3, '[{"size":"2XL","quantity":15}]', 15, 17.99, 269.80),
    (4, '[{"size":"3XL","quantity":10}]', 10, 21.11, 211.07)
  ) AS v(pos, sizes, qty, unit, total);
