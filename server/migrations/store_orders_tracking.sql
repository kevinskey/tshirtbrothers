-- Tracking for storefront orders, so a store sale can be shipped with the
-- same trail a quote gets: buy a label, record the number, tell the buyer.
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS tracking_number  TEXT;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS tracking_carrier TEXT;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS label_url        TEXT;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS shipped_at       TIMESTAMPTZ;
-- Set when the buyer has been emailed their tracking, so re-marking an
-- order fulfilled never re-sends the same notice.
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS shipped_email_sent_at TIMESTAMPTZ;
