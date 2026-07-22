-- Franchise stores: outbound webhook config.
--
-- Adds two columns to `stores` so TSB can notify a store's frontend
-- (e.g., a GleeWorld tenant admin) when an event happens (order.created,
-- order.shipped, payout.paid, return.status_changed). Payloads are signed
-- with HMAC-SHA256 using webhook_secret so receivers can verify origin.
--
-- No dispatch code is wired to live events yet — Week 3 (order capture)
-- is where the first event fires. This migration is landed early so the
-- receiving side (GleeWorld) can be built in parallel against a real
-- schema.
--
-- Apply after franchise_stores_v1.sql:
--   sudo -u postgres psql -d tshirtbrothers -v ON_ERROR_STOP=1 \
--     --single-transaction \
--     -f /var/www/tshirtbrothers/server/migrations/franchise_webhooks_v1.sql

BEGIN;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS order_webhook_url TEXT,
  ADD COLUMN IF NOT EXISTS webhook_secret    TEXT;

COMMENT ON COLUMN stores.order_webhook_url IS
  'HTTPS endpoint on the store frontend that receives outbound webhooks. Nullable — a store may run without webhooks and pull instead.';
COMMENT ON COLUMN stores.webhook_secret IS
  'Shared secret used to sign webhook payloads (HMAC-SHA256). Required when order_webhook_url is set.';

COMMIT;
