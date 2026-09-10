-- Elijah Robb (2026-09-10): his $1500.38 invoice INV-20260910-005 (id 62)
-- was created standalone, so it wasn't linked to his quote #173 and didn't
-- reflect the $378 deposit he paid at quote acceptance ("$378 deposit
-- carries over" per the quote notes). Link it and record the deposit as a
-- payment. Both statements are idempotent.

UPDATE invoices SET quote_id = 173
 WHERE id = 62 AND quote_id IS NULL;

UPDATE invoices
   SET payments = COALESCE(payments, '[]'::jsonb) || jsonb_build_array(
         jsonb_build_object(
           'amount', 378.00,
           'method', 'deposit (quote #173)',
           'date', '2026-09-10T04:40:30Z'
         )
       ),
       amount_paid = COALESCE(amount_paid, 0) + 378.00,
       amount_due = GREATEST(total - (COALESCE(amount_paid, 0) + 378.00), 0),
       status = 'partial',
       updated_at = NOW()
 WHERE id = 62
   AND NOT COALESCE(payments, '[]'::jsonb) @> '[{"method": "deposit (quote #173)"}]'::jsonb;
