-- One-time sync of the older Order Detail stage circles (order_stages)
-- into the quotes-list Production checklist (production_steps), so the
-- ops dashboard reads one truth from day one (2026-09-28). Idempotent.
--   pressed    -> pressed  (same meaning, both systems)
--   gang_sent  -> print_ordered  (gang sheet sent to print vendor)
UPDATE quotes
   SET production_steps = production_steps || jsonb_build_object('pressed', order_stages->>'pressed')
 WHERE order_stages ? 'pressed'
   AND NOT (production_steps ? 'pressed');

UPDATE quotes
   SET production_steps = production_steps || jsonb_build_object('print_ordered', order_stages->>'gang_sent')
 WHERE order_stages ? 'gang_sent'
   AND NOT (production_steps ? 'print_ordered');
