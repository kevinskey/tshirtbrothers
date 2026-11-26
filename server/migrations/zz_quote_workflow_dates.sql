-- Additive; existing orders retain NULL when no date was recorded.
-- Applied by the standard migration runner only after deployment is approved.
ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS date_needed DATE;
ALTER TABLE embroidery_requests ADD COLUMN IF NOT EXISTS date_needed DATE;
CREATE INDEX IF NOT EXISTS idx_gang_sheet_orders_date_needed
  ON gang_sheet_orders (date_needed) WHERE date_needed IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_embroidery_requests_date_needed
  ON embroidery_requests (date_needed) WHERE date_needed IS NOT NULL;
