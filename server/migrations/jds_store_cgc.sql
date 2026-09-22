-- Custom Gift Club (sister brand) on top of the JDS retail catalog.
-- Named jds_store_cgc.sql so it sorts after jds_store.sql — it depends on
-- jds_products existing.
--
-- cgc_category is presentation metadata derived from product names by
-- server/lib/cgcCategories.js (JDS's details endpoint supplies no category
-- field); it is backfilled by server/services/cgcCatalog.js at boot and
-- set at publish time, NOT here, so the keyword rules live in one place.
--
-- Orders: a CGC cart can hold several SKUs, which jds_orders (one row =
-- one SKU) cannot represent, so CGC gets its own order pair. Rows are
-- created 'pending' before the Stripe session and flipped to 'paid' by the
-- webhook in routes/payments.js (metadata.cgc_order_id).

ALTER TABLE jds_products ADD COLUMN IF NOT EXISTS cgc_category TEXT;

CREATE INDEX IF NOT EXISTS jds_products_cgc_category_idx
  ON jds_products (cgc_category) WHERE active;

CREATE TABLE IF NOT EXISTS cgc_orders (
  id                 SERIAL PRIMARY KEY,
  stripe_session_id  TEXT UNIQUE,          -- set at session creation; webhook idempotency
  status             VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | paid | ordered | shipped | cancelled
  customer_email     TEXT,
  customer_name      TEXT,
  shipping_address   JSONB,
  subtotal_cents     INTEGER NOT NULL DEFAULT 0,
  shipping_cents     INTEGER NOT NULL DEFAULT 0,
  total_cents        INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cgc_order_items (
  id                    SERIAL PRIMARY KEY,
  order_id              INTEGER NOT NULL REFERENCES cgc_orders(id) ON DELETE CASCADE,
  sku                   VARCHAR(60) NOT NULL,
  product_name          TEXT,
  qty                   INTEGER NOT NULL DEFAULT 1,
  unit_price_cents      INTEGER NOT NULL,
  personalization_cents INTEGER NOT NULL DEFAULT 0,
  personalization       JSONB               -- { lines[], font, notes, artUrl } or null for blanks
);

CREATE INDEX IF NOT EXISTS cgc_orders_status_idx ON cgc_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS cgc_order_items_order_idx ON cgc_order_items (order_id);
