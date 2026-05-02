-- Custom font registry for the design studio.
--
-- Admin uploads .ttf / .otf files via /api/admin/custom-fonts. Files land
-- in DO Spaces under the `custom-fonts/` prefix; this table indexes them
-- so the FontPicker can render the list and the page can inject @font-face
-- rules pointing at the hosted URLs.
--
-- Licensing: this table assumes Kevin (the operator) only uploads fonts he
-- has redistribution rights for. There is NO enforcement of that here —
-- it's an operational responsibility, not a code one.

BEGIN;

CREATE TABLE IF NOT EXISTS custom_fonts (
  id              SERIAL       PRIMARY KEY,
  -- CSS-safe family name (no quotes / commas). Used as the value of the
  -- font-family CSS property AND as the picker row's display label unless
  -- display_name is also provided. Unique because two @font-face rules
  -- with the same family on the same page collide and the last one wins
  -- — that's a footgun we'd rather catch at write time.
  family_name     VARCHAR(120) NOT NULL UNIQUE,
  -- Optional friendlier label for the picker (e.g. "Hand-lettered Bold")
  -- when the family_name itself is awkward.
  display_name    VARCHAR(200),
  file_url        TEXT         NOT NULL,
  file_size       INTEGER,
  -- Maps to the FontPicker's category chips. Defaults to 'custom' so admins
  -- don't HAVE to pick — the picker creates a Custom chip when the catalog
  -- includes any rows with this category.
  category        VARCHAR(40)  NOT NULL DEFAULT 'custom',
  uploader_user_id INTEGER     REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE custom_fonts IS
  'Custom fonts uploaded via /api/admin/custom-fonts and surfaced in the FontPicker as a Custom category.';
COMMENT ON COLUMN custom_fonts.family_name IS
  'CSS font-family value. UNIQUE — two @font-face rules with the same family collide on the page.';

CREATE INDEX IF NOT EXISTS idx_custom_fonts_created
  ON custom_fonts(created_at DESC);

COMMIT;
