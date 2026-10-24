-- Rhinestone / bling v1 — StoneCut hand-off + pricing engine.
--
-- Two concerns:
--   1. rhinestone_designs   — production metadata for a design published out
--      of StoneCut (rhinestones.tshirtbrothers.com). The *picture* still lives
--      in admin_designs so the Design Studio, Mockups, and the gang-sheet
--      builder pick it up with no changes; this table carries the things only
--      a rhinestone job needs: the stone BOM, physical size, and the cut file.
--   2. rhinestone_pricing_settings — one tunable row behind the /bling instant
--      price and the admin quote. Defaults are calibrated against competitor
--      pricing captured 2026-10-24 (see services/rhinestonePricing.js).
--
-- Run on droplet:
--   sudo -u postgres psql -d tshirtbrothers -f migrations/rhinestone_v1.sql

CREATE TABLE IF NOT EXISTS rhinestone_designs (
  id               SERIAL PRIMARY KEY,
  -- The art-library row holding the preview PNG. ON DELETE SET NULL so
  -- pruning the picture doesn't take the production record with it.
  design_id        INTEGER REFERENCES admin_designs(id) ON DELETE SET NULL,
  name             VARCHAR(500) NOT NULL,
  slug             VARCHAR(200) UNIQUE,
  preview_url      TEXT,
  -- Cut file (SVG of the template holes) as published by StoneCut.
  svg_url          TEXT,
  width_mm         NUMERIC(10,2),
  height_mm        NUMERIC(10,2),
  stone_count      INTEGER NOT NULL DEFAULT 0,
  -- [{ size: 'SS10', color: '#c0c0c0', n: 812, stone_mm: 2.8 }, ...] — the
  -- exact shape stoneBom() returns in StoneCut, stored verbatim.
  stone_bom        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Fraction of the design's bounding box actually covered by stones, 0..1.
  -- Drives the high-coverage upcharge.
  coverage         NUMERIC(5,4),
  -- Shown on /bling when true. Published designs start hidden so Doc can
  -- curate the gallery rather than have every test job go public.
  featured         BOOLEAN NOT NULL DEFAULT FALSE,
  tags             TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rhinestone_designs_featured ON rhinestone_designs(featured, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rhinestone_designs_design_id ON rhinestone_designs(design_id);

CREATE TABLE IF NOT EXISTS rhinestone_pricing_settings (
  id                         INTEGER PRIMARY KEY DEFAULT 1,
  -- Per-stone sell rate by POOLED order quantity, SS10 as the index size.
  -- [{ min_qty, rate }] — highest matching min_qty wins.
  stone_rate_breaks          JSONB NOT NULL,
  -- Multiplier on the SS10 rate per stone size: { "SS6": 0.75, ... }
  size_multipliers           JSONB NOT NULL,
  -- Flat per-garment press labor. Mirrors PRESS_ONLY_RATE in instantQuote.js.
  press_labor_per_piece      NUMERIC(10,2) NOT NULL DEFAULT 3.00,
  -- One-time art/template digitizing, waived at digitizing_waived_at_qty+.
  digitizing_fee             NUMERIC(10,2) NOT NULL DEFAULT 25.00,
  digitizing_waived_at_qty   INTEGER NOT NULL DEFAULT 24,
  -- Floor so a 40-stone accent still covers handling.
  min_decoration_per_piece   NUMERIC(10,2) NOT NULL DEFAULT 8.00,
  -- Designs denser than coverage_threshold cost more to brush and press.
  coverage_threshold         NUMERIC(5,4) NOT NULL DEFAULT 0.75,
  coverage_upcharge_pct      NUMERIC(5,4) NOT NULL DEFAULT 0.15,
  -- Garment markup applied to wholesale blank cost (TSB house 2x).
  garment_markup             NUMERIC(5,3) NOT NULL DEFAULT 2.000,
  -- Flat rush surcharge on the whole order (NOT per-day — unlike
  -- quotes.rush_pct, which is a fraction per day. Different feature.)
  rush_surcharge_pct         NUMERIC(5,4) NOT NULL DEFAULT 0.25,
  -- Charged only if the customer wants a physical/press proof. Digital
  -- proofs are free on purpose — competitors charge ~$17 for one.
  proof_fee                  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  updated_at                 TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT rhinestone_pricing_singleton CHECK (id = 1)
);

-- Seed the single row. Rates calibrated 2026-10-24 so a 100 sq-in / ~800
-- stone SS10 design lands just under Your Custom Transfers' per-square-inch
-- price at every volume break while holding 60%+ gross margin on stones
-- (bulk SS10 runs ~$0.0072/stone at 10 gross).
INSERT INTO rhinestone_pricing_settings (id, stone_rate_breaks, size_multipliers)
VALUES (
  1,
  '[{"min_qty":1,"rate":0.055},{"min_qty":12,"rate":0.042},{"min_qty":24,"rate":0.028},{"min_qty":48,"rate":0.023},{"min_qty":100,"rate":0.020}]'::jsonb,
  '{"SS6":0.75,"SS10":1.0,"SS16":1.5,"SS20":2.0,"SS30":3.2}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Make "rhinestone" a first-class art category so published StoneCut designs
-- land in a real bucket in the Design Studio's Add Art panel instead of a
-- stray string.
INSERT INTO art_categories (name, display_name, position)
VALUES ('rhinestone', 'Rhinestone / Bling', 50)
ON CONFLICT (name) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON rhinestone_designs TO tsbadmin;
GRANT USAGE, SELECT ON SEQUENCE rhinestone_designs_id_seq TO tsbadmin;
GRANT SELECT, INSERT, UPDATE ON rhinestone_pricing_settings TO tsbadmin;
