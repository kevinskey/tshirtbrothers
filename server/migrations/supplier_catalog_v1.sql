-- Unified blanks catalog across suppliers (S&S + SanMar), deduped by price.
--
-- When the same garment is carried by both suppliers the cheaper one wins.
-- The hard part is deciding what "the same garment" means, because the two
-- catalogs disagree about both brand names and style numbers:
--
--   * SanMar prefixes some brands' styles  -- BC1010 vs S&S 1010
--   * S&S appends a suffix for Jerzees     -- 21MR  vs SanMar 21M
--   * One brand is spelled differently     -- "Next Level Apparel" vs "Next Level"
--
-- Matching on the raw strings finds 168 shared styles; normalizing finds 368.
-- The rules live in a table rather than in SQL or JS so they can be corrected
-- without a deploy -- supplier style conventions are not stable, and a wrong
-- rule silently either hides a product or merges two different garments.
BEGIN;

CREATE TABLE IF NOT EXISTS supplier_brand_map (
  id              SERIAL PRIMARY KEY,
  sanmar_brand    TEXT NOT NULL UNIQUE,  -- as spelled in sanmar_products.brand_name
  ss_brand        TEXT NOT NULL,         -- as spelled in products.brand
  -- Prefix SanMar puts on this brand's style numbers, stripped before
  -- comparing (e.g. 'BC' so BC1010 matches S&S 1010). NULL = no prefix.
  sanmar_prefix   TEXT,
  -- Suffix S&S puts on this brand's style numbers, stripped before comparing
  -- (e.g. 'R' so S&S 21MR matches SanMar 21M). NULL = no suffix.
  ss_suffix       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only brands carried by BOTH suppliers need a row: the other 30 SanMar
-- brands (Port Authority, Sport-Tek, OGIO, Nike, ...) have no S&S
-- counterpart, so they can never collide and are passed through untouched.
-- Match counts below are from the 2026-10-29 catalogs, as a regression check.
INSERT INTO supplier_brand_map (sanmar_brand, ss_brand, sanmar_prefix, ss_suffix, notes) VALUES
  ('Bella + Canvas',    'Bella + Canvas',    'BC', NULL, 'BC prefix; 98 of 100 match'),
  ('Next Level Apparel','Next Level',        'NL', NULL, 'name differs + NL prefix; 45 of 46 match'),
  ('Rabbit Skins',      'Rabbit Skins',      'RS', NULL, '11 of 11 match'),
  ('Flexfit',           'Flexfit',           'FF', NULL, '8 of 8 match'),
  ('Jerzees',           'Jerzees',           NULL, 'R',  'S&S appends R: 21MR = SanMar 21M; 40 of 59 match'),
  ('Gildan',            'Gildan',            NULL, NULL, 'identical numbering; 77 of 89 match'),
  ('Comfort Colors',    'Comfort Colors',    NULL, NULL, 'identical; 27 of 27 match'),
  ('Richardson',        'Richardson',        NULL, NULL, 'identical; 29 of 46 match'),
  ('Champion',          'Champion',          NULL, NULL, 'identical; 22 of 28 match'),
  ('Red Kap',           'Red Kap',           NULL, NULL, 'partial overlap; 10 of 17 match'),
  ('Bulwark',           'Bulwark',           NULL, NULL, '1 of 1 match'),
  ('Fruit of the Loom', 'Fruit of the Loom', NULL, NULL, 'no S&S style numbers; 0 match')
ON CONFLICT (sanmar_brand) DO NOTHING;

GRANT SELECT ON supplier_brand_map TO tsbadmin;
GRANT SELECT, INSERT, UPDATE, DELETE ON supplier_brand_map TO tsbadmin;
GRANT USAGE, SELECT ON SEQUENCE supplier_brand_map_id_seq TO tsbadmin;

-- Comparison key for a SanMar style. Strips the mapped prefix and all
-- non-alphanumerics so punctuation differences can't cause a miss.
CREATE OR REPLACE FUNCTION sanmar_match_key(p_brand TEXT, p_style TEXT)
RETURNS TEXT AS $$
  SELECT regexp_replace(
           CASE WHEN m.sanmar_prefix IS NOT NULL
                THEN regexp_replace(upper(btrim(p_style)), '^' || m.sanmar_prefix, '')
                ELSE upper(btrim(p_style)) END,
           '[^A-Z0-9]', '', 'g')
  FROM supplier_brand_map m
  WHERE upper(m.sanmar_brand) = upper(btrim(p_brand))
$$ LANGUAGE sql STABLE;

-- Comparison key for an S&S style, using the same brand map keyed from the
-- S&S side.
CREATE OR REPLACE FUNCTION ss_match_key(p_brand TEXT, p_style TEXT)
RETURNS TEXT AS $$
  SELECT regexp_replace(
           CASE WHEN m.ss_suffix IS NOT NULL
                THEN regexp_replace(upper(btrim(p_style)), m.ss_suffix || '$', '')
                ELSE upper(btrim(p_style)) END,
           '[^A-Z0-9]', '', 'g')
  FROM supplier_brand_map m
  WHERE upper(m.ss_brand) = upper(btrim(p_brand))
  LIMIT 1
$$ LANGUAGE sql STABLE;

-- Canonical garment-size ordering. SanMar's own size_index cannot be used:
-- it indexes sizes within one color's run, so every size of a style comes
-- back as 1. Without this, sizes sort alphabetically and "2XL" lands before
-- "S". Ranks are spaced by 10 so variants can slot between.
CREATE OR REPLACE FUNCTION apparel_size_rank(p_size TEXT)
RETURNS INT AS $$
DECLARE
  s TEXT := upper(regexp_replace(coalesce(p_size, ''), '\s', '', 'g'));
  n INT;
BEGIN
  IF s = '' THEN RETURN 99999; END IF;

  -- One-size-fits-all sorts first; it is never part of a run.
  IF s IN ('OSFA', 'OS', 'ONESIZE', 'ONESIZEFITSALL') THEN RETURN 0; END IF;

  -- Infant by month (06M, 12M, 24M), then toddler (2T, 5/6T).
  IF s ~ '^[0-9]{1,2}M$' THEN
    RETURN 100 + (regexp_replace(s, 'M$', ''))::INT;
  END IF;
  IF s ~ '^[0-9]+(/[0-9]+)?T$' THEN
    RETURN 200 + (regexp_replace(split_part(s, '/', 1), 'T$', ''))::INT;
  END IF;

  -- Waist/inseam pairs (3230 = 32x30) and plain numerics sort numerically,
  -- well clear of the letter ladder.
  IF s ~ '^[0-9]{3,6}$' THEN RETURN 10000 + s::INT; END IF;
  IF s ~ '^[0-9]{1,2}$' THEN RETURN 300 + s::INT; END IF;

  -- Tall and Regular suffixes reuse the base ladder: strip the suffix,
  -- rank the base, then push talls after every regular size.
  IF s ~ '^[0-9]*X*[SML]T$' OR s ~ '^[0-9]+XLT$' THEN
    RETURN 500 + apparel_size_rank(regexp_replace(s, 'T$', ''));
  END IF;
  IF s ~ '^[0-9]+XLR$' THEN
    RETURN apparel_size_rank(regexp_replace(s, 'R$', ''));
  END IF;

  -- Workwear and dress shirts carry a proportion suffix on the base size:
  -- S=Short, R=Regular, L=Long, P=Petite (LR = Large Regular, LS = Large
  -- Short). Rank by base size first, then proportion, so a run reads
  -- S,M,L,XL within each proportion group rather than alphabetically.
  IF s ~ '^([0-9]*X*[SML]|[0-9]+XL)[SRLP]$' AND length(s) > 1 THEN
    n := apparel_size_rank(left(s, length(s) - 1));
    IF n <> 99999 THEN
      RETURN 2000 + n * 4 + CASE right(s, 1)
        WHEN 'P' THEN 0 WHEN 'S' THEN 1 WHEN 'R' THEN 2 ELSE 3 END;
    END IF;
  END IF;

  -- Waist-only sizing (W30, W34).
  IF s ~ '^W[0-9]{2,3}$' THEN
    RETURN 10000 + (regexp_replace(s, '^W', ''))::INT;
  END IF;

  IF s = 'NB' THEN RETURN 99; END IF;     -- newborn, before infant months

  -- Combination sizes slot between the two they span (S/M -> 25).
  IF s = 'S/M'  THEN RETURN 25; END IF;
  IF s = 'M/L'  THEN RETURN 35; END IF;
  IF s = 'L/XL' THEN RETURN 45; END IF;
  IF s = 'XL/2XL' THEN RETURN 55; END IF;

  -- The standard adult ladder. nXL is 40 + n*10, so 2XL=60 ... 10XL=140.
  IF s ~ '^[0-9]+XL$' THEN
    n := (regexp_replace(s, 'XL$', ''))::INT;
    IF n >= 2 THEN RETURN 40 + n * 10; END IF;
  END IF;
  IF s ~ '^X+S$' THEN                     -- XS, XXS, XXXS
    RETURN 15 - 5 * length(regexp_replace(s, 'S$', ''));
  END IF;
  IF s ~ '^X+L$' THEN                     -- XL, XXL, XXXL
    RETURN 40 + 10 * length(regexp_replace(s, 'L$', ''));
  END IF;
  IF s ~ '^[0-9]+XS$' THEN                -- 2XS, 3XS
    RETURN 15 - 5 * (regexp_replace(s, 'XS$', ''))::INT;
  END IF;

  RETURN CASE s
    WHEN 'S'  THEN 20 WHEN 'SM' THEN 20
    WHEN 'M'  THEN 30 WHEN 'MD' THEN 30
    WHEN 'L'  THEN 40 WHEN 'LG' THEN 40
    ELSE 99999                            -- unknown: sorts last, stable
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- The two catalogs use different category vocabularies: S&S splits tees into
-- "T-Shirts - Core/Premium/Long Sleeve" and fleece into Hood/Crew tiers,
-- while SanMar has a flat "T-Shirts" plus a subcategory. The product search
-- turns garment words ("hoodie", "long sleeve") into an exact category
-- filter against the S&S names, so without this translation every SanMar row
-- would be filtered out of exactly the searches that should find it.
--
-- Takes the full subcategory array rather than one value because a SanMar
-- style can carry several, and the distinguishing one ("Long Sleeve",
-- "Hoodie") is not reliably first.
CREATE OR REPLACE FUNCTION sanmar_to_ss_category(p_category TEXT, p_subcats TEXT[])
RETURNS TEXT AS $$
  SELECT CASE
    WHEN p_category = 'T-Shirts' AND 'Long Sleeve' = ANY(p_subcats)
      THEN 'T-Shirts - Long Sleeve'
    -- S&S keeps tanks inside the tee categories, so follow that.
    WHEN p_category = 'T-Shirts'            THEN 'T-Shirts - Premium'
    WHEN p_category = 'Sweatshirts/Fleece' AND 'Hoodie' = ANY(p_subcats)
      THEN 'Fleece - Premium - Hood'
    -- Crews, quarter-zips and full-zips are all sweatshirts as far as a
    -- "sweatshirt" search is concerned.
    WHEN p_category = 'Sweatshirts/Fleece'  THEN 'Fleece - Premium - Crew'
    WHEN p_category = 'Polos/Knits'         THEN 'Polos'
    WHEN p_category = 'Caps'                THEN 'Headwear'
    WHEN p_category = 'Woven Shirts'        THEN 'Wovens'
    WHEN p_category = 'Activewear'          THEN 'Knits & Layering'
    -- Bags, Accessories, Bottoms, Outerwear already agree.
    ELSE p_category
  END
$$ LANGUAGE sql IMMUTABLE;

-- Dropped rather than replaced: CREATE OR REPLACE VIEW cannot add a column
-- anywhere but the end, and this migration is re-run as the shape evolves.
-- catalog_products goes first because it reads sanmar_style_catalog.
-- Dropped by relkind rather than with DROP ... IF EXISTS: that guards only
-- against the name being absent, not against it being the other kind, and
-- sanmar_style_catalog started life as a plain view before being
-- materialized for speed -- so re-running this migration hits "is not a
-- view" / "is not a materialized view" depending on which way it last ran.
DROP VIEW IF EXISTS catalog_products;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE c.relname = 'sanmar_style_catalog' AND n.nspname = 'public'
                AND c.relkind = 'm') THEN
    DROP MATERIALIZED VIEW sanmar_style_catalog CASCADE;
  ELSIF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE c.relname = 'sanmar_style_catalog' AND n.nspname = 'public'
                   AND c.relkind = 'v') THEN
    DROP VIEW sanmar_style_catalog CASCADE;
  END IF;
END $$;

-- SanMar collapsed from SKU level (one row per style+color+size) to style
-- level, matching how `products` is shaped so the two can be unioned.
--
-- MATERIALIZED deliberately. As a plain view this collapsed 158k SKU rows
-- and ran a correlated colors/sizes subquery per style on every request,
-- which made a /shop page load take 8-10 seconds. The feed only changes once
-- a day, so the aggregation is precomputed and refreshed by the loader
-- (scripts/load-sanmar-feed.js). Anything that writes sanmar_products must
-- REFRESH MATERIALIZED VIEW sanmar_style_catalog or the storefront will
-- serve stale prices.
CREATE MATERIALIZED VIEW sanmar_style_catalog AS
SELECT
  s.style,
  s.brand_name                                   AS brand,
  min(s.product_title)                           AS name,
  min(s.category)                                AS category,
  -- Zero-priced rows are bad feed data (18 of them) and would always win a
  -- cheapest-supplier comparison, so they never set the price.
  min(s.piece_price) FILTER (WHERE s.piece_price > 0) AS base_price,
  min(s.msrp)        FILTER (WHERE s.msrp > 0)        AS msrp,
  -- MAP floor: the lowest price we may legally advertise.
  min(s.map_price)   FILTER (WHERE s.map_price > 0)   AS map_price,
  min(s.inventory_key)                           AS inventory_key,
  bool_or(s.decorated_only)                      AS decorated_only,
  sum(coalesce(s.feed_qty, 0))                   AS feed_qty,
  max(s.case_size)                               AS case_size,
  max(s.piece_weight)                            AS piece_weight,
  min(s.product_description)                     AS product_description,
  (array_agg(DISTINCT s.categories))[1]          AS categories,
  array_agg(DISTINCT s.subcategory)
    FILTER (WHERE s.subcategory IS NOT NULL)     AS subcategories,
  -- SanMar's own category, kept alongside the translated one for admin use.
  min(s.category)                                AS sanmar_category,
  -- Colors as the storefront expects: name + swatch + product image.
  (SELECT jsonb_agg(DISTINCT jsonb_build_object(
            'name',  c.color,
            'image', c.images->>'frontModel',
            'swatch', c.images->>'colorSwatch'))
     FROM sanmar_products c
    WHERE c.style = s.style AND c.brand_name = s.brand_name
      AND c.source = 'epdd' AND c.color IS NOT NULL)      AS colors,
  -- Sizes in garment order (XS,S,M,L,XL,2XL...), not alphabetical.
  (SELECT jsonb_agg(z.size ORDER BY apparel_size_rank(z.size), z.size)
     FROM (SELECT DISTINCT d.size
             FROM sanmar_products d
            WHERE d.style = s.style AND d.brand_name = s.brand_name
              AND d.source = 'epdd' AND d.size IS NOT NULL) z)  AS sizes,
  min(s.images->>'frontModel')                   AS image_url,
  min(s.images->>'product')                      AS product_image,
  min(s.product_status)                          AS product_status,
  bool_and(s.visible)                            AS visible,
  sanmar_match_key(s.brand_name, s.style)        AS match_key,
  (SELECT m.ss_brand FROM supplier_brand_map m
    WHERE upper(m.sanmar_brand) = upper(s.brand_name))  AS mapped_ss_brand
FROM sanmar_products s
WHERE s.source = 'epdd'
GROUP BY s.style, s.brand_name;

-- Unique index is required for REFRESH ... CONCURRENTLY, which lets the
-- loader refresh without taking an exclusive lock on a live storefront.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sanmar_style_catalog_pk
  ON sanmar_style_catalog (style, brand);
CREATE INDEX IF NOT EXISTS idx_sanmar_style_catalog_match
  ON sanmar_style_catalog (mapped_ss_brand, match_key) WHERE match_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sanmar_style_catalog_sellable
  ON sanmar_style_catalog (category, brand) WHERE visible AND NOT decorated_only;
CREATE INDEX IF NOT EXISTS idx_sanmar_style_catalog_invkey
  ON sanmar_style_catalog (inventory_key);

-- REFRESH MATERIALIZED VIEW requires ownership, not just a grant, and the
-- loader connects as tsbadmin -- so hand it the matview or every feed load
-- ends with "must be owner of materialized view".
ALTER MATERIALIZED VIEW sanmar_style_catalog OWNER TO tsbadmin;
GRANT SELECT ON sanmar_style_catalog TO tsbadmin;

-- The unified blanks catalog. Column-compatible with `products` (same names
-- and order, plus supplier/map_price/sanmar_style at the end) so existing
-- queries can swap the table for this view without being rewritten.
--
-- Where both suppliers carry a style the cheaper one wins, which is the
-- whole point. A tie goes to S&S: ordering through S&S is already wired up,
-- whereas SanMar purchase orders still need SanMar's sign-off, so there is
-- no reason to move volume for $0.00.
--
-- decorated_only brands (Nike, OGIO, New Era, Eddie Bauer, Alternative
-- Apparel) are excluded: this view feeds the blanks shop, and SanMar's
-- reseller terms forbid selling those blank. They remain in
-- sanmar_products for decorated use.
CREATE VIEW catalog_products AS
WITH sm AS (
  SELECT * FROM sanmar_style_catalog
   WHERE visible AND NOT decorated_only AND base_price IS NOT NULL
),
-- Every S&S row paired with the SanMar style it duplicates, with both
-- prices so each side can decide whether it lost.
dupe AS (
  SELECT p.id          AS ss_pk,
         sm.style      AS sm_style,
         sm.brand      AS sm_brand,
         p.base_price  AS ss_price,
         sm.base_price AS sm_price
    FROM products p
    JOIN sm ON upper(sm.mapped_ss_brand) = upper(btrim(p.brand))
           AND sm.match_key = ss_match_key(p.brand, p.style_number)
   WHERE p.style_number IS NOT NULL
     AND sm.match_key IS NOT NULL
     AND p.base_price IS NOT NULL
)
SELECT
  p.id::BIGINT, p.ss_id, p.name, p.brand, p.category, p.base_price,
  p.colors, p.sizes, p.image_url, p.back_image_url, p.specifications,
  p.price_breaks, p.is_featured, p.last_synced, p.created_at,
  p.retail_price, p.custom_price, p.price_visible, p.case_qty,
  p.full_case_only, p.style_number, p.weight_oz,
  'ss'::TEXT          AS supplier,
  NULL::NUMERIC       AS map_price,
  NULL::TEXT          AS sanmar_style
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM dupe d WHERE d.ss_pk = p.id AND d.sm_price < d.ss_price
)

UNION ALL

SELECT
  -- Negative ids keep SanMar rows from colliding with products.id while
  -- staying stable across queries (inventory_key is from the feed).
  (-sm.inventory_key)::BIGINT          AS id,
  'sanmar:' || sm.style                AS ss_id,
  sm.name,
  sm.brand,
  -- Translated into the S&S vocabulary so the search's garment-word filter
  -- matches SanMar rows too.
  sanmar_to_ss_category(sm.category, sm.subcategories) AS category,
  sm.base_price,
  sm.colors,
  sm.sizes,
  sm.image_url,
  NULL::TEXT                           AS back_image_url,
  jsonb_build_object(
    'description', sm.product_description,
    'status',      sm.product_status,
    'msrp',        sm.msrp
  )                                    AS specifications,
  '[]'::JSONB                          AS price_breaks,
  FALSE                                AS is_featured,
  now()                                AS last_synced,
  now()                                AS created_at,
  sm.msrp                              AS retail_price,
  NULL::NUMERIC                        AS custom_price,
  FALSE                                AS price_visible,
  sm.case_size                         AS case_qty,
  FALSE                                AS full_case_only,
  sm.style                             AS style_number,
  sm.piece_weight                      AS weight_oz,
  'sanmar'::TEXT                       AS supplier,
  -- Lowest price we may legally advertise for this style.
  sm.map_price,
  sm.style                             AS sanmar_style
FROM sm
WHERE NOT EXISTS (
  SELECT 1 FROM dupe d
   WHERE d.sm_style = sm.style AND d.sm_brand = sm.brand
     AND d.ss_price <= d.sm_price
);

GRANT SELECT ON catalog_products TO tsbadmin;

COMMIT;
