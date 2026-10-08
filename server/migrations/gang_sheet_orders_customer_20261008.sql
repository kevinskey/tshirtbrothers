-- DTF buyers are customers: the checkout now requires a phone (same as the
-- quote form) and links each order to the users row it creates or finds.
ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS user_id INTEGER;
CREATE INDEX IF NOT EXISTS gang_sheet_orders_user_id_idx ON gang_sheet_orders (user_id);
