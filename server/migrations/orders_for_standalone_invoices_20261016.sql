-- Every invoice gets an order number.
--
-- The order number is TSB-<quote id>, so an invoice with no quote behind it
-- (written from scratch in the admin, or converted before the link was kept)
-- had nothing to show. This opens an order for each such invoice: a quotes
-- row built from the invoice's customer and line items, linked both ways
-- through quotes.source_invoice_id and invoices.quote_id. New standalone
-- invoices get the same treatment on save (server/lib/orderFromInvoice.js).
--
-- Paid invoices open as 'paid' orders, everything else as 'accepted', so
-- they land in the Open Orders list; follow_up_sent_at is stamped so the
-- abandoned-quote follow-up never chases them as leads.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS source_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_source_invoice_id ON quotes(source_invoice_id);

INSERT INTO quotes
  (customer_name, customer_email, customer_phone, product_name, quantity,
   estimated_price, status, notes, accepted_at, follow_up_sent_at,
   source_invoice_id, created_at)
SELECT
  COALESCE(NULLIF(i.customer_name, ''), 'Customer'),
  COALESCE(i.customer_email, ''),
  i.customer_phone,
  COALESCE(
    (SELECT NULLIF(TRIM(it->>'description'), '')
       FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(i.items::jsonb) = 'array' THEN i.items::jsonb ELSE '[]'::jsonb END) it
      WHERE NULLIF(TRIM(it->>'description'), '') IS NOT NULL
      LIMIT 1)
    || CASE WHEN jsonb_typeof(i.items::jsonb) = 'array' AND jsonb_array_length(i.items::jsonb) > 1
            THEN ' +' || (jsonb_array_length(i.items::jsonb) - 1) || ' more' ELSE '' END,
    'Custom order'),
  GREATEST(1, COALESCE(
    (SELECT SUM(COALESCE(NULLIF(it->>'quantity', '')::numeric, 0))
       FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(i.items::jsonb) = 'array' THEN i.items::jsonb ELSE '[]'::jsonb END) it),
    0))::int,
  i.total,
  CASE WHEN i.status = 'paid' THEN 'paid' ELSE 'accepted' END,
  'Order opened from invoice ' || i.invoice_number,
  i.created_at,
  NOW(),
  i.id,
  i.created_at
FROM invoices i
WHERE i.quote_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM quotes q WHERE q.source_invoice_id = i.id);

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
WHERE i.quote_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM quote_items qi WHERE qi.quote_id = q.id);

UPDATE invoices i
   SET quote_id = q.id
  FROM quotes q
 WHERE q.source_invoice_id = i.id
   AND i.quote_id IS NULL;
