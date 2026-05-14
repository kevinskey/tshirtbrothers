-- Explicit categories table for the Art Library so admin can create
-- empty categories before assigning designs into them, rename categories
-- without scattering UPDATEs, and reorder how they appear in the Add Art
-- panel. Categories on admin_designs.category still live as plain strings
-- (the FK is logical, not enforced) so existing reads keep working.
--
-- Run: psql "$DATABASE_URL" -f server/migrations/art_categories_table.sql

CREATE TABLE IF NOT EXISTS art_categories (
  name          VARCHAR(100) PRIMARY KEY,        -- slug stored on admin_designs.category
  display_name  VARCHAR(100),                    -- shown in the UI; falls back to name
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_art_categories_position ON art_categories(position, name);

-- Backfill: seed one row per distinct category currently in admin_designs.
INSERT INTO art_categories (name, display_name, position)
SELECT category, NULL, 0
  FROM admin_designs
 WHERE category IS NOT NULL AND category <> ''
 GROUP BY category
ON CONFLICT (name) DO NOTHING;
