-- Nightly JDS re-snapshot (services/jdsSync.js) bookkeeping: when each SKU
-- was last checked against the live JDS catalog, how many JDS has on hand,
-- and a human-readable flag when the refreshed cost eats the retail margin
-- or the SKU vanished from the catalog.
ALTER TABLE jds_products ADD COLUMN IF NOT EXISTS available_quantity INTEGER;
ALTER TABLE jds_products ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
ALTER TABLE jds_products ADD COLUMN IF NOT EXISTS sync_note TEXT;
