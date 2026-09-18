-- JDS gifts & awards store: curated JDS Industries blanks sold retail
-- through Stripe Checkout. Products are published from the admin Blanks
-- (JDS) lookup with a snapshot of the JDS catalog data; orders are
-- captured by the Stripe webhook (metadata.jds_sku) and fulfilled
-- manually on jdsindustries.com (JDS has no ordering API).

CREATE TABLE IF NOT EXISTS jds_products (
  id                 SERIAL PRIMARY KEY,
  sku                VARCHAR(60) NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  description        TEXT,
  image_url          TEXT,
  cost_cents         INTEGER,              -- JDS one-piece cost at publish time
  retail_price_cents INTEGER NOT NULL CHECK (retail_price_cents > 0),
  weight_oz          NUMERIC(6,1),         -- parcel estimate for shipping tiers
  active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jds_orders (
  id                 SERIAL PRIMARY KEY,
  stripe_session_id  TEXT NOT NULL UNIQUE, -- idempotency for webhook retries
  sku                VARCHAR(60) NOT NULL,
  product_name       TEXT,
  qty                INTEGER NOT NULL DEFAULT 1,
  unit_price_cents   INTEGER NOT NULL,
  shipping_cents     INTEGER NOT NULL DEFAULT 0,
  total_cents        INTEGER NOT NULL,
  customer_email     TEXT,
  customer_name      TEXT,
  shipping_address   JSONB,
  status             VARCHAR(20) NOT NULL DEFAULT 'paid',  -- paid | ordered | shipped | cancelled
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jds_orders_status_idx ON jds_orders (status, created_at DESC);
