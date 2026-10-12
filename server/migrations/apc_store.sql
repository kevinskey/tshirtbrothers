-- All Print Club (APC, allprintclub.com) — sister-brand storefront selling
-- commercial print products (business cards, flyers, postcards, banners…)
-- fulfilled by the 4over trade-printer API.
--
-- Catalog tables are OURS, synced from 4over (services/apcCatalog.js /
-- services/fourover.js) so browsing never hits their API. Until Doc's 4over
-- API keys arrive, a small demo catalog (source = 'demo') is seeded in JS at
-- boot; the first real sync disables demo rows and inserts source = '4over'.
--
-- Print pricing is per-RUN, not per-piece: quantity is itself a product
-- option (a "runsize"), so a variant = one full option combination with one
-- price. apc_order_items.qty means "how many identical runs".
--
-- Orders: created 'pending' before the Stripe session and flipped to 'paid'
-- by the webhook in routes/payments.js (metadata.apc_order_id), mirroring
-- cgc_orders. After payment the order is auto-submitted to 4over when the
-- API is configured; until then fourover_status stays 'awaiting_api_keys'.

CREATE TABLE IF NOT EXISTS apc_products (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(120) NOT NULL UNIQUE,  -- our stable handle (4over product sku when synced)
  fourover_uuid   TEXT UNIQUE,                   -- null for demo rows
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'Print Products',
  description     TEXT NOT NULL DEFAULT '',
  image_url       TEXT,
  -- [{ group: 'size', values: [{ id: 'sz-35x2', name: '3.5 x 2' }, …] }, …]
  option_groups   JSONB NOT NULL DEFAULT '[]',
  enabled         BOOLEAN NOT NULL DEFAULT FALSE, -- published on the storefront
  source          VARCHAR(10) NOT NULL DEFAULT 'demo', -- demo | 4over
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apc_products_category_idx
  ON apc_products (category) WHERE enabled;

CREATE TABLE IF NOT EXISTS apc_variants (
  id                  SERIAL PRIMARY KEY,
  product_id          INTEGER NOT NULL REFERENCES apc_products(id) ON DELETE CASCADE,
  -- option value ids sorted and joined with '|' — the price-lookup key
  option_key          TEXT NOT NULL,
  -- { size: '3.5 x 2', Stock: '14pt', qty: '500', … } for display
  options             JSONB NOT NULL DEFAULT '{}',
  cost_cents          INTEGER NOT NULL,            -- 4over trade price (never exposed publicly)
  retail_cents        INTEGER NOT NULL,            -- cost × (1 + markup_percent/100), re-priced on markup change
  fourover_price_uuid TEXT,
  UNIQUE (product_id, option_key)
);

CREATE INDEX IF NOT EXISTS apc_variants_product_idx ON apc_variants (product_id);

-- Single-row-per-key settings (markup_percent, flat shipping, …) editable
-- from the TSB admin without a deploy.
CREATE TABLE IF NOT EXISTS apc_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO apc_settings (key, value) VALUES
  ('markup_percent', '70'),
  ('flat_shipping_cents', '999')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS apc_orders (
  id                 SERIAL PRIMARY KEY,
  stripe_session_id  TEXT UNIQUE,          -- set at session creation; webhook idempotency
  status             VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | paid | ordered | shipped | cancelled
  customer_email     TEXT,
  customer_name      TEXT,
  shipping_address   JSONB,
  subtotal_cents     INTEGER NOT NULL DEFAULT 0,
  shipping_cents     INTEGER NOT NULL DEFAULT 0,
  total_cents        INTEGER NOT NULL DEFAULT 0,
  fourover_order_id  TEXT,                 -- 4over's id once submitted
  fourover_status    TEXT,                 -- awaiting_api_keys | submitted | submit_failed
  submit_error       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS apc_order_items (
  id               SERIAL PRIMARY KEY,
  order_id         INTEGER NOT NULL REFERENCES apc_orders(id) ON DELETE CASCADE,
  product_code     VARCHAR(120) NOT NULL,
  product_name     TEXT,
  option_key       TEXT NOT NULL,
  options          JSONB NOT NULL DEFAULT '{}',
  qty              INTEGER NOT NULL DEFAULT 1,  -- identical runs of this combination
  unit_price_cents INTEGER NOT NULL,            -- retail per run at purchase time
  artwork          JSONB,                       -- [{ side: 'front'|'back', url }] print-ready files
  note             TEXT
);

CREATE INDEX IF NOT EXISTS apc_orders_status_idx ON apc_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS apc_order_items_order_idx ON apc_order_items (order_id);
