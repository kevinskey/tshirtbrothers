-- Backfill: give every existing quote at least one line item.
--
-- Historically the POST /quotes route only wrote the top-level
-- product/sizes/quantity/estimated_price columns and skipped
-- quote_items — so older quotes render as "no product on this quote
-- yet" in the admin drawer even though the quote has real data on it.
-- New quotes now auto-create a placeholder in the POST handler; this
-- migration retro-fits the same behavior for existing rows.
--
-- Idempotent: only inserts for quotes that currently have zero items.

BEGIN;

INSERT INTO quote_items
  (quote_id, position, product_id, product_name, color,
   sizes, quantity, print_areas, design_url,
   unit_price, line_total)
SELECT
  q.id,
  0                                                                             AS position,
  q.product_id,
  q.product_name,
  q.color,
  COALESCE(
    CASE
      WHEN jsonb_typeof(q.sizes::jsonb) IN ('array','object')
        THEN q.sizes::jsonb
      ELSE '[]'::jsonb
    END,
    '[]'::jsonb
  )                                                                             AS sizes,
  COALESCE(q.quantity, 0)                                                       AS quantity,
  COALESCE(
    CASE
      WHEN jsonb_typeof(q.print_areas::jsonb) IN ('array','object')
        THEN q.print_areas::jsonb
      ELSE '[]'::jsonb
    END,
    '[]'::jsonb
  )                                                                             AS print_areas,
  q.design_url,
  CASE
    WHEN q.estimated_price IS NOT NULL AND q.estimated_price > 0
     AND q.quantity        IS NOT NULL AND q.quantity        > 0
    THEN ROUND((q.estimated_price / q.quantity)::numeric, 2)
    ELSE NULL
  END                                                                           AS unit_price,
  CASE
    WHEN q.estimated_price IS NOT NULL AND q.estimated_price > 0
    THEN ROUND(q.estimated_price::numeric, 2)
    ELSE NULL
  END                                                                           AS line_total
FROM quotes q
LEFT JOIN quote_items qi ON qi.quote_id = q.id
WHERE qi.id IS NULL
GROUP BY q.id;

COMMIT;
