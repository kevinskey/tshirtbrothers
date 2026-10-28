-- Store back office v1 — the tables a store's own people need in order to
-- run their storefront without a TSB staffer doing it for them.
--
-- Context: TSB already has three write surfaces for stores —
--   /api/admin/group-stores  (TSB staff, full control)
--   /api/stores              (machine-to-machine, x-store-api-key)
--   /api/group-store-admin   (the store's own admins — read-mostly today)
-- The gap is the third one, plus four things that have no table at all:
-- per-store promos, per-store shipping, editable storefront content, and
-- product categories/ordering.
--
-- Existing tables deliberately NOT reused:
--   promotions   — TSB-global (no store_id), 48 live rows; adding a store_id
--                  would make every existing row ambiguously global. New
--                  table instead, so the TSB promo engine keeps its meaning.
--   hero_slides  — also TSB-global, and shaped for the TSB homepage rotator
--                  (image + link + sort). Store heroes need copy fields too.
--   categories   — a global tree used by the TSB /shop catalog, unrelated to
--                  a store's own merchandising.
--
-- Safe to re-run.

BEGIN;

-- ── Per-store promo codes ────────────────────────────────────────────────
-- Mirrors the shape of `promotions` so the checkout code can treat them
-- alike, but scoped to one store and with its own redemption counter.
CREATE TABLE IF NOT EXISTS store_promotions (
  id                SERIAL PRIMARY KEY,
  store_id          INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code              VARCHAR(64)  NOT NULL,
  headline          VARCHAR(255),
  subtext           TEXT,
  -- 'percent' | 'amount' | 'free_shipping'
  discount_type     VARCHAR(32)  NOT NULL,
  -- percent: 0-100. amount: cents. free_shipping: ignored.
  discount_value    NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_order_cents   INTEGER      NOT NULL DEFAULT 0,
  max_uses          INTEGER,
  max_uses_per_email INTEGER,
  times_used        INTEGER      NOT NULL DEFAULT 0,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  starts_at         TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  created_by        VARCHAR(255),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT store_promotions_type_chk
    CHECK (discount_type IN ('percent', 'amount', 'free_shipping'))
);

-- Codes are unique per store, case-insensitively — shoppers type them by
-- hand and two stores may legitimately both want SUMMER10.
CREATE UNIQUE INDEX IF NOT EXISTS store_promotions_store_code_uniq
  ON store_promotions (store_id, lower(code));

-- One row per redemption, so max_uses_per_email can be enforced and the
-- store can see who used what.
CREATE TABLE IF NOT EXISTS store_promotion_redemptions (
  id            SERIAL PRIMARY KEY,
  promotion_id  INTEGER NOT NULL REFERENCES store_promotions(id) ON DELETE CASCADE,
  store_order_id INTEGER REFERENCES store_orders(id) ON DELETE SET NULL,
  buyer_email   VARCHAR(255),
  amount_off_cents INTEGER NOT NULL DEFAULT 0,
  redeemed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS store_promotion_redemptions_promo_idx
  ON store_promotion_redemptions (promotion_id);
CREATE INDEX IF NOT EXISTS store_promotion_redemptions_email_idx
  ON store_promotion_redemptions (promotion_id, lower(buyer_email));

-- ── Per-store shipping ───────────────────────────────────────────────────
-- Stores price shipping as simple rules, not live carrier rates: TSB is
-- merchant of record and buys the real label later through EasyPost, so
-- what a store configures here is what the SHOPPER is charged.
CREATE TABLE IF NOT EXISTS store_shipping_rules (
  id               SERIAL PRIMARY KEY,
  store_id         INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  label            VARCHAR(120) NOT NULL,
  -- 'flat' | 'per_item' | 'free_over' | 'pickup'
  rule_type        VARCHAR(32)  NOT NULL,
  amount_cents     INTEGER      NOT NULL DEFAULT 0,
  -- free_over: order subtotal at/above which this rule charges nothing
  threshold_cents  INTEGER,
  sort_order       INTEGER      NOT NULL DEFAULT 0,
  active           BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT store_shipping_rules_type_chk
    CHECK (rule_type IN ('flat', 'per_item', 'free_over', 'pickup'))
);

CREATE INDEX IF NOT EXISTS store_shipping_rules_store_idx
  ON store_shipping_rules (store_id, active, sort_order);

-- ── Editable storefront content ──────────────────────────────────────────
-- One row per content block per store. `key` is the slot the storefront
-- asks for ('hero', 'promo_bar', 'about'); `body` is whatever that slot's
-- component expects. Keeping it jsonb means a new slot needs no migration.
--
-- This is what makes the LHT hero editable: today its eyebrow, headline,
-- subcopy and CTA labels are hardcoded JSX in
-- client/src/lht/pages/HomePage.tsx.
CREATE TABLE IF NOT EXISTS store_content (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  key         VARCHAR(64)  NOT NULL,
  body        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_by  VARCHAR(255),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- A slot can hold several ordered blocks (a hero carousel), so the
-- uniqueness is on (store, key, sort_order), not (store, key).
CREATE UNIQUE INDEX IF NOT EXISTS store_content_slot_uniq
  ON store_content (store_id, key, sort_order);
CREATE INDEX IF NOT EXISTS store_content_lookup_idx
  ON store_content (store_id, key) WHERE active;

-- ── Store-owned product categories ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_categories (
  id          SERIAL PRIMARY KEY,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL,
  slug        VARCHAR(120) NOT NULL,
  description TEXT,
  image_url   TEXT,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS store_categories_slug_uniq
  ON store_categories (store_id, slug);

-- A product can sit in several categories (the joggers set belongs in both
-- "Fall 2026" and "Sets"), so this is a join table rather than a column.
CREATE TABLE IF NOT EXISTS store_product_categories (
  store_product_id  INTEGER NOT NULL REFERENCES store_products(id) ON DELETE CASCADE,
  store_category_id INTEGER NOT NULL REFERENCES store_categories(id) ON DELETE CASCADE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (store_product_id, store_category_id)
);

-- ── store_products gains merchandising fields ────────────────────────────
-- sort_order: today /api/store-shop orders by published_at DESC, so a store
-- cannot choose what leads. gallery_json: cover_image is a single image.
ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS sort_order   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gallery_json JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compare_at_cents INTEGER;

-- ── Grants ───────────────────────────────────────────────────────────────
-- Migrations run as postgres but the app connects as tsbadmin; without
-- these the app gets "permission denied for table" at runtime. This bit us
-- on the newsletters table before.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tsbadmin') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON
      store_promotions, store_promotion_redemptions, store_shipping_rules,
      store_content, store_categories, store_product_categories
      TO tsbadmin;
    GRANT USAGE, SELECT ON
      store_promotions_id_seq, store_promotion_redemptions_id_seq,
      store_shipping_rules_id_seq, store_content_id_seq,
      store_categories_id_seq
      TO tsbadmin;
  END IF;
END $$;

COMMIT;
