-- Orders opened from invoices that ended up with NO line items.
--
-- The 20261016 backfill only copied items for invoices whose quote_id was
-- still NULL at that moment, and the runtime opener skipped the copy when
-- the order row already existed — so an order could open empty and stay
-- empty (TSB-268 / INV-20261020-001 did: the admin drawer showed "No
-- product on this quote yet" for a paid 11-piece embroidery job). Copy the
-- invoice's items onto every invoice-opened order that still has none.
INSERT INTO quote_items (quote_id, position, product_name, quantity, unit_price, line_total)
SELECT
  q.id,
  it.ord - 1,
  NULLIF(TRIM(it.val->>'description'), ''),
  COALESCE(NULLIF(it.val->>'quantity', '')::numeric, 0)::int,
  NULLIF(it.val->>'unit_price', '')::numeric,
  COALESCE(
    NULLIF(it.val->>'total', '')::numeric,
    ROUND(NULLIF(it.val->>'unit_price', '')::numeric * COALESCE(NULLIF(it.val->>'quantity', '')::numeric, 0), 2))
FROM quotes q
JOIN invoices i ON i.id = q.source_invoice_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(i.items::jsonb) = 'array' THEN i.items::jsonb ELSE '[]'::jsonb END)
  WITH ORDINALITY AS it(val, ord)
WHERE NOT EXISTS (SELECT 1 FROM quote_items qi WHERE qi.quote_id = q.id);
