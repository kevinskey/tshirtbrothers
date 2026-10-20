-- Live Hard Truth (livehardtruth.com) — sister-brand storefront riding the
-- shared store-shop system. This migration:
--   1. creates lht_leads (guide downloads, newsletter signups, Truth
--      Session readings — the /api/lht surface writes here),
--   2. seeds four `lht:*` pseudo-blank rows in products so store-shop
--      checkout prices shipping from real weights (they are excluded from
--      the public blanks shop by routes/products.js),
--   3. seeds the `live-hard-truth` store (store_type 'business'),
--      its agreement, admin, and the four Fall 2026 store_products.
--
-- Catalog data (prices, sizes, the eleven colorways) was lifted verbatim
-- from the original livehardtruth.com bundle. Colorways ride in
-- variants_json rather than becoming separate products, matching how the
-- LHT client (client/src/lht/) and GroupStoreProductPage render pickers.
--
-- NOTE for Doc: the agreement is seeded percent_of_retail=100 (all revenue
-- to TSB, store_earnings 0) as a placeholder — set Leora's real split in
-- Admin → Web Stores before payouts matter.
--
-- Idempotent: safe to replay against a fresh database.

BEGIN;

-- 1 ── Leads ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS lht_leads (
  id           SERIAL PRIMARY KEY,
  first_name   VARCHAR(80),
  email        VARCHAR(255) NOT NULL,
  consent      BOOLEAN NOT NULL DEFAULT FALSE,
  source       VARCHAR(20) NOT NULL CHECK (source IN ('guide', 'newsletter', 'truth')),
  answers_json JSONB,              -- Truth Session answers (source 'truth')
  truth_color  VARCHAR(20),        -- Onyx | Ember | Merlot | Espresso | Olive
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lht_leads_email_idx ON lht_leads (lower(email));
CREATE INDEX IF NOT EXISTS lht_leads_source_idx ON lht_leads (source, created_at DESC);

-- 2 ── Pseudo-blanks with shipping weights ---------------------------------
-- base_price = rough production cost placeholders (tune in admin).

INSERT INTO products (ss_id, name, brand, category, style_number, base_price,
                      colors, sizes, image_url, specifications, price_breaks,
                      is_featured, weight_oz)
SELECT 'lht:joggers-set', 'LIVE HARD TRUTH Joggers Set (blank)', 'Live Hard Truth',
       'Live Hard Truth', 'LHT-SET', 55.00,
       '[]'::jsonb, '["XS","S","M","L","XL","2XL","3XL"]'::jsonb,
       'https://tshirtbrothers.com/lht/set-espresso.jpg',
       '{"description": "Internal pseudo-blank for the Live Hard Truth store — heavyweight hoodie + tapered joggers set.", "weight": "Heavyweight"}'::jsonb,
       '[]'::jsonb, FALSE, 42
WHERE NOT EXISTS (SELECT 1 FROM products WHERE ss_id = 'lht:joggers-set');

INSERT INTO products (ss_id, name, brand, category, style_number, base_price,
                      colors, sizes, image_url, specifications, price_breaks,
                      is_featured, weight_oz)
SELECT 'lht:journal', 'Hard Truth Journal (blank)', 'Live Hard Truth',
       'Live Hard Truth', 'LHT-JRNL', 9.00,
       '[]'::jsonb, '["A5"]'::jsonb,
       'https://tshirtbrothers.com/lht/journal.jpg',
       '{"description": "Internal pseudo-blank for the Live Hard Truth store — A5 hardcover journal."}'::jsonb,
       '[]'::jsonb, FALSE, 14
WHERE NOT EXISTS (SELECT 1 FROM products WHERE ss_id = 'lht:journal');

INSERT INTO products (ss_id, name, brand, category, style_number, base_price,
                      colors, sizes, image_url, specifications, price_breaks,
                      is_featured, weight_oz)
SELECT 'lht:mug', 'Hard Truth Mug (blank)', 'Live Hard Truth',
       'Live Hard Truth', 'LHT-MUG', 6.50,
       '[]'::jsonb, '["11 oz","15 oz"]'::jsonb,
       'https://tshirtbrothers.com/lht/mug.jpg',
       '{"description": "Internal pseudo-blank for the Live Hard Truth store — matte stoneware mug."}'::jsonb,
       '[]'::jsonb, FALSE, 18
WHERE NOT EXISTS (SELECT 1 FROM products WHERE ss_id = 'lht:mug');

INSERT INTO products (ss_id, name, brand, category, style_number, base_price,
                      colors, sizes, image_url, specifications, price_breaks,
                      is_featured, weight_oz)
SELECT 'lht:cap', 'Hard Truth Hat (blank)', 'Live Hard Truth',
       'Live Hard Truth', 'LHT-CAP', 8.00,
       '[]'::jsonb, '["One Size"]'::jsonb,
       'https://tshirtbrothers.com/lht/cap-onyx.jpg',
       '{"description": "Internal pseudo-blank for the Live Hard Truth store — structured embroidered cap."}'::jsonb,
       '[]'::jsonb, FALSE, 6
WHERE NOT EXISTS (SELECT 1 FROM products WHERE ss_id = 'lht:cap');

-- 3 ── The store -----------------------------------------------------------

INSERT INTO stores
  (slug, name, owner_email, store_type, status, brand_json,
   fulfillment_mode, is_fundraiser, subdomain)
SELECT 'live-hard-truth', 'Live Hard Truth', 'kevin@tshirtbrothers.com',
  'business', 'active',
  jsonb_build_object(
    'logo_url', 'https://tshirtbrothers.com/lht/logo.jpg',
    'primary_color', '#00d6e4',
    'tagline', 'Truth looks good on you.',
    'hero_url', 'https://tshirtbrothers.com/lht/campaign.jpg',
    'website_url', 'https://livehardtruth.com',
    'business_address', '6010 Renaissance Parkway, Fairburn, GA 30213',
    'footer_note', 'Live Hard Truth — wear the truth. Fulfilled by T-Shirt Brothers.'
  ),
  'both', FALSE, 'livehardtruth'
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE slug = 'live-hard-truth');

INSERT INTO store_agreements (store_id, kind, fee_config_json, payout_terms_json, accepted_by_email)
SELECT s.id, 'store',
  jsonb_build_object('percent_of_retail', 100,
                     'note', 'Placeholder — set the real LHT split before payouts.'),
  jsonb_build_object('cadence', 'monthly', 'method', 'ach'),
  'kevin@tshirtbrothers.com'
FROM stores s
WHERE s.slug = 'live-hard-truth'
  AND NOT EXISTS (SELECT 1 FROM store_agreements a WHERE a.store_id = s.id AND a.kind = 'store');

INSERT INTO store_admins (store_id, email, role)
SELECT s.id, 'kevin@tshirtbrothers.com', 'owner'
FROM stores s
WHERE s.slug = 'live-hard-truth'
ON CONFLICT (store_id, email) DO NOTHING;

-- 4 ── The Fall 2026 products ----------------------------------------------

INSERT INTO store_products
  (store_id, tsb_blank_ss_id, title, slug, description, cover_image,
   retail_price_cents, variants_json, active_agreement_id, min_qty, is_active)
SELECT s.id, v.ss_id, v.title, v.slug, v.description, v.cover_image,
       v.retail_price_cents, v.variants::jsonb, a.id, 1, TRUE
FROM stores s
JOIN LATERAL (
  SELECT id FROM store_agreements
   WHERE store_id = s.id AND kind = 'store'
   ORDER BY accepted_at DESC LIMIT 1
) a ON TRUE
CROSS JOIN (VALUES
  ('lht:joggers-set', 'LIVE HARD TRUTH Joggers Set', 'live-hard-truth-joggers-set',
   'Heavyweight hoodie with matching classic tapered joggers and side pockets. Embossed tone-on-tone LIVE HARD TRUTH mark, cut heavyweight, made to be worn hard.',
   'https://tshirtbrothers.com/lht/set-espresso.jpg', 12499,
   '{"sizes":["XS","S","M","L","XL","2XL","3XL"],"colors":["Espresso","Onyx","Ember","Merlot","Olive","Red","White","Pink","Blue","Green","Purple"]}'),
  ('lht:journal', 'Hard Truth Journal', 'hard-truth-journal',
   'Hardcover A5 journal with embossed crest and gilded edges. Merlot finish.',
   'https://tshirtbrothers.com/lht/journal.jpg', 2600,
   '{"sizes":["A5"]}'),
  ('lht:mug', 'Hard Truth Mug', 'hard-truth-mug',
   'Matte stoneware mug with debossed LIVE HARD TRUTH lettering. Espresso finish.',
   'https://tshirtbrothers.com/lht/mug.jpg', 2200,
   '{"sizes":["11 oz","15 oz"]}'),
  ('lht:cap', 'Hard Truth Hat', 'hard-truth-hat',
   'Structured hat with embroidered LIVE HARD TRUTH crest.',
   'https://tshirtbrothers.com/lht/cap-onyx.jpg', 2999,
   '{"sizes":["One Size"],"colors":["Onyx","Merlot","Olive"]}')
) AS v(ss_id, title, slug, description, cover_image, retail_price_cents, variants)
WHERE s.slug = 'live-hard-truth'
  AND NOT EXISTS (SELECT 1 FROM store_products p WHERE p.store_id = s.id AND p.slug = v.slug);

COMMIT;
