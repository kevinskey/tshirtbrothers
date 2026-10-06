-- Request #10 (converted from Quote #209): the garment is a CUSTOMER-PROVIDED
-- sweater, not a catalog oxford (Kevin, 2026-10-06). Switching to own-garment
-- mode drops the $/pc gate — customer-supplied goods carry no garment charge,
-- and the 2% spoilage terms apply. Idempotent via the WHERE guard.
UPDATE embroidery_requests
   SET garment_mode = 'own',
       garment_choice = NULL,
       items = NULL,
       notes = COALESCE(notes, '') || ' — Garment: customer-provided sweater (no garment charge; spoilage terms apply).'
 WHERE id = 10
   AND garment_mode IS DISTINCT FROM 'own';
