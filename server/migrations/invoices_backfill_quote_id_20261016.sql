-- Link invoices to the order (quote) they were written for.
--
-- Until 2026-10-16 the admin's "Convert to invoice" button dropped the
-- quote id, so most invoices made that way have quote_id NULL and show no
-- order number. This relinks the unambiguous ones: an invoice with no
-- quote_id gets the quote whose customer email matches when exactly ONE
-- such quote exists in the 90 days before the invoice (and up to a day
-- after, for same-session edits), is not rejected or archived, and is not
-- already linked to another invoice. Anything with two or more candidates
-- is left alone for the admin to link by hand in the invoice editor.
UPDATE invoices i
   SET quote_id = m.quote_id
  FROM (
    SELECT i2.id AS invoice_id,
           MIN(q.id) AS quote_id,
           COUNT(*)  AS candidates
      FROM invoices i2
      JOIN quotes q
        ON LOWER(q.customer_email) = LOWER(i2.customer_email)
       AND q.created_at >= i2.created_at - INTERVAL '90 days'
       AND q.created_at <= i2.created_at + INTERVAL '1 day'
       AND q.status <> 'rejected'
       AND q.archived_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM invoices i3 WHERE i3.quote_id = q.id)
     WHERE i2.quote_id IS NULL
       AND i2.customer_email IS NOT NULL
     GROUP BY i2.id
  ) m
 WHERE i.id = m.invoice_id
   AND m.candidates = 1;
