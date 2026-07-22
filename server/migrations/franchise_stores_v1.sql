-- Franchise stores: TSB acts as platform (fulfillment, printer, payment
-- collector) for third-party "stores" (e.g., a GleeWorld tenant's merch
-- store). Each store sells designs it owns; buyer pays TSB; TSB splits
-- the retail per an accepted agreement and pays the store on a schedule.
--
-- Money flow: buyer → TSB Stripe → store_ledger credit → store_payouts
--             ACH → store owner's bank.
--
-- Schema is additive; existing products/quotes/users tables are untouched.
--
-- Apply on droplet:
--   sudo -u postgres psql -d tshirtbrothers -v ON_ERROR_STOP=1 \
--     --single-transaction -f /var/www/tshirtbrothers/server/migrations/franchise_stores_v1.sql

BEGIN;

-- ── stores ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
  id                    SERIAL PRIMARY KEY,
  slug                  VARCHAR(80) NOT NULL UNIQUE,
  name                  VARCHAR(255) NOT NULL,
  owner_email           VARCHAR(255) NOT NULL,
  owner_user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  brand_json            JSONB NOT NULL DEFAULT '{}'::jsonb,
                        -- { logo_url, primary_color, back_url, footer_note, custom_domain }
  gleeworld_tenant_slug VARCHAR(80),
                        -- Optional link back to a GleeWorld tenant. NULL for
                        -- stores that don't have a corresponding tenant site.
  status                VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paused','off')),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stores_gleeworld_tenant_idx
  ON stores (gleeworld_tenant_slug)
  WHERE gleeworld_tenant_slug IS NOT NULL;

-- ── store_agreements ─────────────────────────────────────────────────────
-- Immutable acceptance record. TSB sets the fee + payout terms; the store
-- owner accepts. Every published product freezes a reference to the
-- agreement that was active at publish time — so a mid-flight change to
-- the store agreement doesn't retroactively affect past orders.
--
-- Two kinds:
--   'store'    — the store's default split/payout terms
--   'campaign' — override for a fundraising campaign (also snapshotted per
--                campaign so the goal + cadence are locked at launch time)
CREATE TABLE IF NOT EXISTS store_agreements (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind                  VARCHAR(20) NOT NULL CHECK (kind IN ('store','campaign')),
  campaign_ref          VARCHAR(120),
                        -- For kind='campaign': external campaign identifier
                        -- (e.g., gleeworld's gw_merch_campaigns slug). NULL
                        -- for kind='store'.
  fee_config_json       JSONB NOT NULL,
                        -- { percent_of_retail: 15, min_per_item_cents: 200,
                        --   ..other knobs.. }
  payout_terms_json     JSONB NOT NULL,
                        -- { cadence: 'monthly'|'per_campaign_close'|'weekly',
                        --   min_threshold_cents: 5000, method: 'ach' }
  accepted_by_email     VARCHAR(255) NOT NULL,
  accepted_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_agreements_lookup_idx
  ON store_agreements (store_id, kind, campaign_ref);

-- ── store_designs ────────────────────────────────────────────────────────
-- IP owned by the store. TSB stores the JSON for printing but does not
-- have a license to reuse or resell.
CREATE TABLE IF NOT EXISTS store_designs (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name                  VARCHAR(255) NOT NULL,
  design_json           JSONB NOT NULL,
  thumbnail_url         TEXT,
  status                VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','approved','published','archived')),
  created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_designs_store_updated_idx
  ON store_designs (store_id, updated_at DESC);

-- ── store_products ───────────────────────────────────────────────────────
-- Published/purchasable item. Retail price is set by the store owner.
-- active_agreement_id freezes the split at publish time so orders reference
-- the exact terms that were in effect when the item went live.
CREATE TABLE IF NOT EXISTS store_products (
  id                    SERIAL PRIMARY KEY,
  store_id              INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  design_id             INTEGER REFERENCES store_designs(id) ON DELETE RESTRICT,
  campaign_ref          VARCHAR(120),
                        -- Same shape as store_agreements.campaign_ref;
                        -- when set, treat the product as scoped to a
                        -- fundraising campaign.
  tsb_blank_ss_id       VARCHAR(100) NOT NULL,
                        -- References products.ss_id — the S&S blank being
                        -- printed on.
  title                 VARCHAR(255) NOT NULL,
  slug                  VARCHAR(160) NOT NULL,
  description           TEXT,
  cover_image           TEXT,
  retail_price_cents    INTEGER NOT NULL CHECK (retail_price_cents > 0),
  variants_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
                        -- { sizes: [...], colors: [...] }
  active_agreement_id   INTEGER NOT NULL REFERENCES store_agreements(id) ON DELETE RESTRICT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  opens_at              TIMESTAMP WITH TIME ZONE,
  closes_at             TIMESTAMP WITH TIME ZONE,
  published_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, slug)
);

CREATE INDEX IF NOT EXISTS store_products_store_active_idx
  ON store_products (store_id, is_active, published_at DESC);

-- ── store_orders ─────────────────────────────────────────────────────────
-- One row per checkout. TSB is the merchant of record (single Stripe
-- account); the split is calculated per line at capture time and frozen
-- into split_snapshot_json.
CREATE TABLE IF NOT EXISTS store_orders (
  id                     SERIAL PRIMARY KEY,
  store_id               INTEGER NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  tsb_order_ref          VARCHAR(120) NOT NULL UNIQUE,
                         -- The TSB-side order id / stripe payment intent /
                         -- however TSB's fulfillment system references it.
  buyer_email            VARCHAR(255) NOT NULL,
  subtotal_cents         INTEGER NOT NULL,
  shipping_cents         INTEGER NOT NULL DEFAULT 0,
  tax_cents              INTEGER NOT NULL DEFAULT 0,
  gross_total_cents      INTEGER NOT NULL,
  split_snapshot_json    JSONB NOT NULL,
                         -- Frozen at capture:
                         --   { agreement_id, percent_of_retail, per_item_cents,
                         --     lines: [{ store_product_id, qty, retail_cents,
                         --                store_earnings_cents,
                         --                tsb_earnings_cents }] }
  store_earnings_cents   INTEGER NOT NULL DEFAULT 0,
  tsb_earnings_cents     INTEGER NOT NULL DEFAULT 0,
  status                 VARCHAR(30) NOT NULL DEFAULT 'paid'
                         CHECK (status IN ('paid','printing','shipped','delivered','refunded','cancelled')),
  created_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at             TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_orders_store_created_idx
  ON store_orders (store_id, created_at DESC);

-- ── store_ledger ─────────────────────────────────────────────────────────
-- Append-only ledger of what TSB owes each store. Sales are credits,
-- refunds and payouts are debits. Balance = SUM(amount_cents) per store.
CREATE TABLE IF NOT EXISTS store_ledger (
  id            SERIAL PRIMARY KEY,
  store_id      INTEGER NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  entry_type    VARCHAR(20) NOT NULL
                CHECK (entry_type IN ('sale','refund','payout','adjustment')),
  amount_cents  INTEGER NOT NULL,
                -- Positive for credits (sale, positive adjustment);
                -- negative for debits (refund, payout, negative adjustment).
  order_id      INTEGER REFERENCES store_orders(id) ON DELETE RESTRICT,
  payout_id     INTEGER,
                -- FK filled after store_payouts row exists; not enforced
                -- here to allow the ledger row to be inserted first.
  memo          TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_ledger_store_created_idx
  ON store_ledger (store_id, created_at DESC);

-- ── store_payouts ────────────────────────────────────────────────────────
-- When TSB actually pays a store — either on cadence or on campaign close.
CREATE TABLE IF NOT EXISTS store_payouts (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  period_start   TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end     TIMESTAMP WITH TIME ZONE NOT NULL,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  method         VARCHAR(20) NOT NULL DEFAULT 'ach'
                 CHECK (method IN ('ach','check','stripe_transfer','manual')),
  status         VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','sent','paid','failed','reversed')),
  reference      VARCHAR(255),
                 -- ACH trace number, check number, Stripe transfer id, etc.
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at        TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS store_payouts_store_created_idx
  ON store_payouts (store_id, created_at DESC);

-- Backfill the FK on store_ledger.payout_id now that store_payouts exists.
ALTER TABLE store_ledger
  ADD CONSTRAINT store_ledger_payout_fk
  FOREIGN KEY (payout_id) REFERENCES store_payouts(id) ON DELETE RESTRICT
  DEFERRABLE INITIALLY DEFERRED;

-- ── store_return_requests ────────────────────────────────────────────────
-- Buyer submits a return form on the tenant site; the tenant site posts to
-- TSB via /api/stores/:slug/return-requests. TSB reviews and either
-- approves (issue refund + reverse ledger entry) or rejects.
CREATE TABLE IF NOT EXISTS store_return_requests (
  id             SERIAL PRIMARY KEY,
  store_id       INTEGER NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
  order_id       INTEGER NOT NULL REFERENCES store_orders(id) ON DELETE RESTRICT,
  buyer_email    VARCHAR(255) NOT NULL,
  reason         TEXT NOT NULL,
  photos_json    JSONB NOT NULL DEFAULT '[]'::jsonb,
  status         VARCHAR(20) NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','approved','rejected','refunded')),
  tsb_notes      TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at    TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS store_return_requests_store_status_idx
  ON store_return_requests (store_id, status, created_at DESC);

-- ── touched_at trigger for store_designs ────────────────────────────────
CREATE OR REPLACE FUNCTION store_designs_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS store_designs_touch_trg ON store_designs;
CREATE TRIGGER store_designs_touch_trg
BEFORE UPDATE ON store_designs
FOR EACH ROW EXECUTE FUNCTION store_designs_touch();

COMMIT;
