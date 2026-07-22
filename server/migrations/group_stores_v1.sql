-- Group Stores: TSB-curated, white-label storefronts for organizations
-- (schools, choirs, teams, alumni groups, etc.). Distinct from the
-- earlier "franchise" concept where the store owner supplied designs
-- and TSB paid them a split. In the Group Stores model:
--
--   • TSB picks products from the S&S catalog and publishes them.
--   • TSB designs the storefront (brand, hero, decoration).
--   • Members buy shirts; TSB is merchant of record; TSB fulfills.
--   • The organization ("group admin") has read-only order visibility
--     and can place bulk orders through the same store.
--   • If the store is a fundraiser, a slice of margin routes to the
--     organization via the existing store_ledger / store_payouts flow.
--
-- Schema strategy: additive extension of the existing franchise tables.
-- Existing "franchise" stores keep working; new group stores are
-- distinguished by stores.store_type = 'group'.

BEGIN;

-- ── stores: mark type + fulfillment + fundraiser knobs ───────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS store_type VARCHAR(20) NOT NULL DEFAULT 'franchise'
    CHECK (store_type IN ('franchise', 'group'));

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS fulfillment_mode VARCHAR(20) NOT NULL DEFAULT 'ship_only'
    CHECK (fulfillment_mode IN ('ship_only', 'pickup_only', 'both'));

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS pickup_location_json JSONB NOT NULL DEFAULT '{}'::jsonb;
  -- { name, address_line1, address_line2, city, state, zip, hours_note,
  --   contact_email, contact_phone }

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS is_fundraiser BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS fundraiser_json JSONB NOT NULL DEFAULT '{}'::jsonb;
  -- { goal_cents, ends_at, contribution_type: 'percent'|'fixed',
  --   contribution_value: 15 (percent) or 500 (cents per item),
  --   headline, description }

CREATE INDEX IF NOT EXISTS stores_type_status_idx
  ON stores (store_type, status);

-- ── store_admins: group-side users with read-only order access ───────────
-- Members of the organization who can log into the group-admin dashboard
-- to see order status, bulk-purchase, and (if fundraiser) view running
-- totals. They CANNOT edit products, prices, or designs — that's TSB's
-- job. Auth is magic-link: request code → email → exchange for session
-- token.
CREATE TABLE IF NOT EXISTS store_admins (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email             VARCHAR(255) NOT NULL,
  name              VARCHAR(255),
  role              VARCHAR(20) NOT NULL DEFAULT 'viewer'
                    CHECK (role IN ('viewer', 'bulk_buyer', 'owner')),
                    -- viewer: orders + fundraiser totals (read-only)
                    -- bulk_buyer: viewer + can place bulk orders
                    -- owner: bulk_buyer + can invite/remove other admins
  invited_by_email  VARCHAR(255),
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at     TIMESTAMP WITH TIME ZONE,
  UNIQUE (store_id, email)
);

CREATE INDEX IF NOT EXISTS store_admins_email_idx
  ON store_admins (email);

-- ── store_admin_login_codes: short-lived magic-link codes ────────────────
CREATE TABLE IF NOT EXISTS store_admin_login_codes (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email       VARCHAR(255) NOT NULL,
  code_hash   VARCHAR(255) NOT NULL,
                -- sha256 of the 6-digit code, never store cleartext
  expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
  consumed_at TIMESTAMP WITH TIME ZONE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_admin_login_codes_lookup_idx
  ON store_admin_login_codes (store_id, email, consumed_at, expires_at);

-- ── store_admin_sessions: post-login session tokens ──────────────────────
CREATE TABLE IF NOT EXISTS store_admin_sessions (
  id           SERIAL PRIMARY KEY,
  store_id     INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  admin_id     INTEGER NOT NULL REFERENCES store_admins(id) ON DELETE CASCADE,
  token_hash   VARCHAR(255) NOT NULL UNIQUE,
                 -- sha256 of the bearer token
  expires_at   TIMESTAMP WITH TIME ZONE NOT NULL,
  revoked_at   TIMESTAMP WITH TIME ZONE,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_admin_sessions_admin_idx
  ON store_admin_sessions (admin_id, expires_at DESC);

-- ── store_orders: fulfillment type + bulk flag ───────────────────────────
ALTER TABLE store_orders
  ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(20) NOT NULL DEFAULT 'ship'
    CHECK (fulfillment_type IN ('ship', 'pickup'));

ALTER TABLE store_orders
  ADD COLUMN IF NOT EXISTS is_bulk BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE store_orders
  ADD COLUMN IF NOT EXISTS placed_by_admin_id INTEGER
    REFERENCES store_admins(id) ON DELETE SET NULL;
  -- Non-null when a group admin placed the order (bulk buy). NULL for
  -- normal member checkouts.

-- ── store_products: track the source S&S SKU explicitly ──────────────────
-- The existing column tsb_blank_ss_id already references the S&S blank
-- being printed on. For TSB-curated group products, we also want to
-- record the decoration cost and margin so the fundraiser math is
-- deterministic. Add optional cost/decoration columns; if unset, the
-- store's default fundraiser rate applies.
ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS blank_cost_cents INTEGER;

ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS decoration_cost_cents INTEGER;

ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS min_qty INTEGER NOT NULL DEFAULT 1
    CHECK (min_qty >= 1);

-- ── design_id nullable for TSB-curated products ──────────────────────────
-- For group stores TSB may reference an existing design or attach a
-- decoration file directly to the product without a store_designs row.
ALTER TABLE store_products
  ALTER COLUMN design_id DROP NOT NULL;

-- (design_id is already nullable per franchise_stores_v1.sql, but this
-- statement is safe to re-run.)

-- ── ss_catalog_cache: nightly-synced S&S catalog for the picker ──────────
-- Populated by a scheduled job hitting the S&S API. The TSB admin
-- picker reads this table so the browse UI doesn't hammer S&S. Refresh
-- cadence: nightly. Real-time stock still requires an S&S call at
-- checkout for low-stock items — a phase-2 concern.
CREATE TABLE IF NOT EXISTS ss_catalog_cache (
  ss_id          VARCHAR(100) PRIMARY KEY,
                   -- S&S style number / SKU
  brand          VARCHAR(120),
  name           VARCHAR(255) NOT NULL,
  category       VARCHAR(120),
  description    TEXT,
  base_cost      NUMERIC(10, 2),
                   -- TSB wholesale cost per unit, decimal dollars
  colors         JSONB NOT NULL DEFAULT '[]'::jsonb,
  sizes          JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_url      TEXT,
  raw_json       JSONB,
                   -- Full S&S payload snapshot for debugging / re-parse
  synced_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ss_catalog_cache_brand_idx
  ON ss_catalog_cache (brand);

CREATE INDEX IF NOT EXISTS ss_catalog_cache_category_idx
  ON ss_catalog_cache (category);

COMMIT;
