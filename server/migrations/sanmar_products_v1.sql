-- SanMar product catalog, synced from the SanMar Standard SOAP API
-- (getProductInfoByBrand). One row per uniqueKey = style+color+size SKU.
BEGIN;

CREATE TABLE IF NOT EXISTS sanmar_products (
  unique_key      BIGINT PRIMARY KEY,          -- SanMar uniqueKey (inventoryKey + sizeIndex)
  inventory_key   BIGINT NOT NULL,             -- style+color grouping key
  style           TEXT NOT NULL,               -- e.g. PC61
  brand_name      TEXT NOT NULL,
  product_title   TEXT,
  product_description TEXT,
  category        TEXT,
  keywords        TEXT,
  color           TEXT,                        -- catalog color name
  size            TEXT,
  size_index      INT,
  available_sizes TEXT,
  case_size       INT,
  piece_weight    NUMERIC(8,4),
  product_status  TEXT,                        -- Active / Closeout / Discontinued
  piece_price     NUMERIC(10,2),
  dozen_price     NUMERIC(10,2),
  case_price      NUMERIC(10,2),
  piece_sale_price NUMERIC(10,2),
  dozen_sale_price NUMERIC(10,2),
  case_sale_price NUMERIC(10,2),
  sale_start_date DATE,
  sale_end_date   DATE,
  price_code      TEXT,
  images          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- front/back/side model, flats, swatches, specSheet
  -- Brand-restriction flag: Nike, OGIO, New Era, Eddie Bauer, Alternative
  -- Apparel etc. may not be sold blank / DTC per SanMar's reseller terms.
  decorated_only  BOOLEAN NOT NULL DEFAULT false,
  visible         BOOLEAN NOT NULL DEFAULT true,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sanmar_products_style ON sanmar_products (style);
CREATE INDEX IF NOT EXISTS idx_sanmar_products_brand ON sanmar_products (brand_name);
CREATE INDEX IF NOT EXISTS idx_sanmar_products_inventory_key ON sanmar_products (inventory_key);
CREATE INDEX IF NOT EXISTS idx_sanmar_products_status ON sanmar_products (product_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON sanmar_products TO tsbadmin;

COMMIT;
