-- Legacy columns retain the first sheet for compatibility; this is the full
-- purchased manifest, including each private file, dimensions, copies and price.
ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS sheets_json JSONB;
