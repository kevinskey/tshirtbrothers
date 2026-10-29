-- SanMar EPDD bulk-feed support.
--
-- The SFTP feed (SanMar_EPDD_csv.zip -> SanMar_EPDD.csv, ~435k rows, 44
-- columns) carries fields the SOAP product-info service does not return,
-- most importantly MSRP and MAP_PRICING. Those two are what make MAP
-- compliance checkable in SQL instead of by hand, so they are the reason
-- this migration exists rather than just reusing the v1 columns.
BEGIN;

ALTER TABLE sanmar_products
  -- MAP floor: SanMar caps advertised discounts (10% off MSRP for retail
  -- brands, 20% for house brands). map_price is SanMar's own computed
  -- floor, so prefer it over deriving one from msrp.
  ADD COLUMN IF NOT EXISTS msrp              NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS map_price         NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS suggested_price   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS subcategory       TEXT,
  -- A SKU is listed once per category it belongs to (45% of the catalog is
  -- in more than one, up to 4), so the feed's 435k rows collapse to ~161k
  -- SKUs. category/subcategory keep the alphabetically-first value for
  -- compatibility with the SOAP rows; these arrays keep the full taxonomy
  -- so a category filter doesn't miss a product under its second category.
  ADD COLUMN IF NOT EXISTS categories        TEXT[],
  ADD COLUMN IF NOT EXISTS subcategories     TEXT[],
  ADD COLUMN IF NOT EXISTS gtin              TEXT,
  ADD COLUMN IF NOT EXISTS pms_color         TEXT,
  ADD COLUMN IF NOT EXISTS mainframe_color   TEXT,
  ADD COLUMN IF NOT EXISTS companion_styles  TEXT,
  -- Aggregate availability as of the feed file, NOT live inventory. Live
  -- numbers come from services/sanmar.js getInventory(); this is only good
  -- for coarse filtering (e.g. hiding styles at zero).
  ADD COLUMN IF NOT EXISTS feed_qty          INT,
  ADD COLUMN IF NOT EXISTS source            TEXT NOT NULL DEFAULT 'soap';

CREATE INDEX IF NOT EXISTS idx_sanmar_products_category
  ON sanmar_products (category);
-- GIN so `categories && ARRAY['Outerwear']` can use an index.
CREATE INDEX IF NOT EXISTS idx_sanmar_products_categories
  ON sanmar_products USING gin (categories);
-- Partial index: the storefront almost always filters to sellable blanks.
CREATE INDEX IF NOT EXISTS idx_sanmar_products_sellable
  ON sanmar_products (brand_name, style)
  WHERE visible AND NOT decorated_only;

-- All-TEXT staging table. The feed is third-party CSV with empty strings
-- for absent numerics and occasional junk in free-text fields, so load it
-- untyped and cast during the upsert -- a bad cell then fails one column
-- instead of aborting a 435k-row COPY.
CREATE UNLOGGED TABLE IF NOT EXISTS sanmar_feed_staging (
  unique_key                    TEXT,
  product_title                 TEXT,
  product_description           TEXT,
  style                         TEXT,
  available_sizes               TEXT,
  brand_logo_image              TEXT,
  thumbnail_image               TEXT,
  color_swatch_image            TEXT,
  product_image                 TEXT,
  spec_sheet                    TEXT,
  price_text                    TEXT,
  suggested_price               TEXT,
  category_name                 TEXT,
  subcategory_name              TEXT,
  color_name                    TEXT,
  color_square_image            TEXT,
  color_product_image           TEXT,
  color_product_image_thumbnail TEXT,
  size                          TEXT,
  qty                           TEXT,
  piece_weight                  TEXT,
  piece_price                   TEXT,
  dozens_price                  TEXT,
  case_price                    TEXT,
  price_group                   TEXT,
  case_size                     TEXT,
  inventory_key                 TEXT,
  size_index                    TEXT,
  sanmar_mainframe_color        TEXT,
  mill                          TEXT,
  product_status                TEXT,
  companion_styles              TEXT,
  msrp                          TEXT,
  map_pricing                   TEXT,
  front_model_image_url         TEXT,
  back_model_image              TEXT,
  front_flat_image              TEXT,
  back_flat_image               TEXT,
  product_measurements          TEXT,
  pms_color                     TEXT,
  gtin                          TEXT,
  decoration_spec_sheet         TEXT,
  image_3d_url                  TEXT,
  video_url                     TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON sanmar_feed_staging TO tsbadmin;

-- The feed ships HTML entities in titles and descriptions ("OGIO &#174;",
-- "Tri-Blend &#8482;"). Decoding is a function rather than a replace() chain
-- in the loader because the feed mixes three conventions and new ones keep
-- turning up: named refs, standards-compliant numerics, and Windows-1252
-- numerics in the 128-159 range. That last group is why chr() alone is
-- wrong -- &#153; means (TM) in cp1252 but chr(153) is a control character.
CREATE OR REPLACE FUNCTION sanmar_decode_entities(txt TEXT)
RETURNS TEXT AS $$
DECLARE
  out TEXT := txt;
  m   TEXT[];
  cp  INT;
BEGIN
  IF out IS NULL THEN
    RETURN NULL;
  END IF;

  -- Windows-1252 numerics first: these code points are undefined in Unicode
  -- and must be remapped, not passed to chr().
  out := replace(out, '&#145;', '‘');
  out := replace(out, '&#146;', '’');
  out := replace(out, '&#147;', '“');
  out := replace(out, '&#148;', '”');
  out := replace(out, '&#149;', '•');
  out := replace(out, '&#150;', '–');
  out := replace(out, '&#151;', '—');
  out := replace(out, '&#153;', '™');

  -- Decimal refs, tolerating the zero-padded form (&#0153;) the feed also
  -- emits. Anything below 160 has already been handled or is a control
  -- character we drop rather than inject into product copy.
  FOR m IN SELECT regexp_matches(out, '&#(0*\d+);', 'g') LOOP
    cp := m[1]::INT;
    IF cp = 153 THEN
      out := replace(out, '&#' || m[1] || ';', '™');
    ELSIF cp BETWEEN 160 AND 1114111 THEN
      out := replace(out, '&#' || m[1] || ';', chr(cp));
    ELSE
      out := replace(out, '&#' || m[1] || ';', '');
    END IF;
  END LOOP;

  -- Hexadecimal refs (&#x2122;).
  FOR m IN SELECT regexp_matches(out, '&#[xX]([0-9a-fA-F]+);', 'g') LOOP
    cp := ('x' || lpad(m[1], 8, '0'))::BIT(32)::INT;
    IF cp BETWEEN 160 AND 1114111 THEN
      out := regexp_replace(out, '&#[xX]' || m[1] || ';', chr(cp), 'g');
    END IF;
  END LOOP;

  out := replace(out, '&mdash;',  '—');
  out := replace(out, '&ndash;',  '–');
  out := replace(out, '&reg;',    '®');
  out := replace(out, '&trade;',  '™');
  out := replace(out, '&copy;',   '©');
  out := replace(out, '&deg;',    '°');
  out := replace(out, '&hellip;', '…');
  out := replace(out, '&rsquo;',  '’');
  out := replace(out, '&lsquo;',  '‘');
  out := replace(out, '&rdquo;',  '”');
  out := replace(out, '&ldquo;',  '“');
  out := replace(out, '&bull;',   '•');
  out := replace(out, '&nbsp;',   ' ');
  out := replace(out, '&quot;',   '"');
  out := replace(out, '&apos;',   '''');
  out := replace(out, '&lt;',     '<');
  out := replace(out, '&gt;',     '>');
  out := replace(out, '&amp;',    '&');  -- last, so &amp;reg; resolves

  RETURN NULLIF(btrim(regexp_replace(out, '\s+', ' ', 'g')), '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMIT;
