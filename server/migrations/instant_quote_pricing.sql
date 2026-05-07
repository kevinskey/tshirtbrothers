-- Instant Quote Calculator — schema + seed.
--
-- Tables prefixed instant_quote_* so they don't collide with the existing
-- AI Pricing tables. Customer-facing calculator at /instant-quote will read
-- these tables on every keystroke; shop owner edits them via /admin
-- (section=instant-quote-pricing).
--
-- Cost basis:  numbers below are the SHOP's wholesale cost. The configured
--              markup_multiplier (default 2.0) handles retail margin.
--              Adjust in admin once calibrated against real jobs.

-- garments: catalog of garment styles, one row per (name, quality_tier).
CREATE TABLE IF NOT EXISTS instant_quote_garments (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,                -- 'T-shirt', 'Hoodie', etc.
  quality_tier  TEXT NOT NULL,                -- 'Standard' | 'Premium' | 'Ultra'
  base_cost     NUMERIC(10,2) NOT NULL,
  image_url     TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  UNIQUE (name, quality_tier)
);

-- print_methods: Screen / DTF / DTG / Embroidery.
-- charges_per_color = true means setup_fee_per_color is multiplied by the
-- screen-color count. For embroidery setup_fee is a one-time digitizing
-- fee per design (per location).
CREATE TABLE IF NOT EXISTS instant_quote_print_methods (
  id                   SERIAL PRIMARY KEY,
  name                 TEXT NOT NULL UNIQUE,
  setup_fee_per_color  NUMERIC(10,2) NOT NULL DEFAULT 0,
  base_per_piece_cost  NUMERIC(10,2) NOT NULL,
  charges_per_color    BOOLEAN NOT NULL DEFAULT false,
  active               BOOLEAN NOT NULL DEFAULT true,
  sort_order           INTEGER NOT NULL DEFAULT 0
);

-- quantity_tiers: ordered ranges with cumulative discount on the base cost.
-- max_qty = NULL is the open-ended top tier (501+).
CREATE TABLE IF NOT EXISTS instant_quote_quantity_tiers (
  id            SERIAL PRIMARY KEY,
  min_qty       INTEGER NOT NULL,
  max_qty       INTEGER,
  discount_pct  NUMERIC(5,4) NOT NULL DEFAULT 0,    -- 0.10 = 10% off
  sort_order    INTEGER NOT NULL DEFAULT 0
);

-- shop settings: singleton row (id=1). Holds the global knobs.
CREATE TABLE IF NOT EXISTS instant_quote_settings (
  id                    INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  markup_multiplier     NUMERIC(5,4) NOT NULL DEFAULT 2.0,
  rush_surcharge_pct    NUMERIC(5,4) NOT NULL DEFAULT 0.25,
  rush_threshold_days   INTEGER NOT NULL DEFAULT 5,
  standard_turnaround   INTEGER NOT NULL DEFAULT 10,
  rush_turnaround       INTEGER NOT NULL DEFAULT 5,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────
-- Seed: realistic Gildan / Bella+Canvas / Comfort Colors retail print-shop
-- defaults. Standard ≈ Gildan 5000-class basics, Premium ≈ Bella+Canvas /
-- Next Level, Ultra ≈ Comfort Colors / Champion.
-- ────────────────────────────────────────────────────────────────────────

INSERT INTO instant_quote_garments (name, quality_tier, base_cost, sort_order) VALUES
  ('T-shirt',     'Standard',  3.50, 10),
  ('T-shirt',     'Premium',   6.00, 11),
  ('T-shirt',     'Ultra',     9.50, 12),
  ('Tank',        'Standard',  4.00, 20),
  ('Tank',        'Premium',   6.50, 21),
  ('Tank',        'Ultra',     9.00, 22),
  ('Long-sleeve', 'Standard',  6.00, 30),
  ('Long-sleeve', 'Premium',   9.00, 31),
  ('Long-sleeve', 'Ultra',    12.50, 32),
  ('Polo',        'Standard',  9.00, 40),
  ('Polo',        'Premium',  14.00, 41),
  ('Polo',        'Ultra',    19.00, 42),
  ('Sweatshirt',  'Standard',  9.50, 50),
  ('Sweatshirt',  'Premium',  14.50, 51),
  ('Sweatshirt',  'Ultra',    19.50, 52),
  ('Hoodie',      'Standard', 11.50, 60),
  ('Hoodie',      'Premium',  18.00, 61),
  ('Hoodie',      'Ultra',    24.00, 62),
  ('Hat',         'Standard',  5.50, 70),
  ('Hat',         'Premium',  10.00, 71),
  ('Hat',         'Ultra',    18.00, 72)
ON CONFLICT (name, quality_tier) DO NOTHING;

INSERT INTO instant_quote_print_methods (name, setup_fee_per_color, base_per_piece_cost, charges_per_color, sort_order) VALUES
  ('Screen Print', 25.00, 1.50, true,  10),
  ('DTF',           0.00, 4.00, false, 20),
  ('DTG',           0.00, 6.00, false, 30),
  ('Embroidery',   45.00, 5.50, false, 40)   -- setup_fee_per_color is reused as setup_fee_per_design for embroidery (charges_per_color=false)
ON CONFLICT (name) DO NOTHING;

INSERT INTO instant_quote_quantity_tiers (min_qty, max_qty, discount_pct, sort_order) VALUES
  (1,   10,   0.00,  10),
  (11,  25,   0.05,  20),
  (26,  50,   0.10,  30),
  (51,  100,  0.15,  40),
  (101, 250,  0.22,  50),
  (251, 500,  0.30,  60),
  (501, NULL, 0.35,  70)
ON CONFLICT DO NOTHING;

INSERT INTO instant_quote_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
