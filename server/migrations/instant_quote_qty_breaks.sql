-- Per-quantity price breaks for instant-quote garments and print methods.
-- JSONB [{ "min_qty": int, "cost": number }] — highest matching min_qty
-- (vs the POOLED order quantity) wins; NULL falls back to the scalar
-- base cost. Added so DTF print cost can scale down with volume and the
-- quoted totals track ~$1 under Custom Ink at each order size.
ALTER TABLE instant_quote_garments      ADD COLUMN IF NOT EXISTS qty_breaks JSONB;
ALTER TABLE instant_quote_print_methods ADD COLUMN IF NOT EXISTS qty_breaks JSONB;

-- Calibrated DTF curve (2026-09): print per piece by pooled quantity.
UPDATE instant_quote_print_methods SET qty_breaks = '[
  {"min_qty": 1,   "cost": 10.00},
  {"min_qty": 6,   "cost": 6.50},
  {"min_qty": 12,  "cost": 5.50},
  {"min_qty": 18,  "cost": 4.50},
  {"min_qty": 24,  "cost": 3.90},
  {"min_qty": 26,  "cost": 3.35},
  {"min_qty": 51,  "cost": 3.15},
  {"min_qty": 101, "cost": 2.75}
]'::jsonb WHERE name = 'DTF';
