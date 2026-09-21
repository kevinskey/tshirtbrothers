-- Orders completed via the status dropdown before 2026-09-21 got no
-- fulfillment trail (the PATCH route only stamped earlier stages), so the
-- order-detail timeline showed "Completed" with no date. Backfill pickup
-- orders with their best-known completion moment. Idempotent: only touches
-- completed rows that still have no stamp at all.
UPDATE quotes
   SET fulfillment_method = COALESCE(fulfillment_method, 'pickup'),
       picked_up_at = COALESCE(balance_paid_at, ready_at, accepted_at, created_at)
 WHERE status = 'completed'
   AND picked_up_at IS NULL
   AND shipped_at IS NULL
   AND COALESCE(shipping_method, 'pickup') <> 'ship';
