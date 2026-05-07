-- Save persisted instant-quote calculator results: the full input set
-- (so admin can rerun the calculation later) plus a snapshot of the
-- price the customer was shown at save time. Existing per-product
-- columns (sizes, color, etc.) are nullable; the calculator path uses
-- inputs_json instead. design_type='instant-quote' identifies these
-- rows in the admin Quotes list.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS inputs_json      JSONB,
  ADD COLUMN IF NOT EXISTS calculated_price NUMERIC(10,2);
