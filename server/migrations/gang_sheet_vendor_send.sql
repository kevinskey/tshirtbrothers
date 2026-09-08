-- Vendor outsourcing: record which print vendor a gang sheet / order was
-- emailed to and when. Idempotent — safe to re-run on boot.
ALTER TABLE gang_sheets ADD COLUMN IF NOT EXISTS vendor_name text;
ALTER TABLE gang_sheets ADD COLUMN IF NOT EXISTS vendor_email text;
ALTER TABLE gang_sheets ADD COLUMN IF NOT EXISTS vendor_sent_at timestamptz;

ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS vendor_name text;
ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS vendor_email text;
ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS vendor_sent_at timestamptz;
