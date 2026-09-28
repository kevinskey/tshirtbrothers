-- Seed: Sensory Seasons fundraiser store.
--
-- Stood up from Quote #199 (Tangela Youn, sensoryseasons.org) — the
-- "Inclusion is the Standard. Support is the Culture." autism-awareness
-- tee, mockup #134 (white Gildan 64000 Softstyle, navy DTF front print).
--
-- Created active with no subdomain claimed: the store is reachable at
-- /stores/sensory-seasons and listed in the directory. Claim a DNS label
-- later with: UPDATE stores SET subdomain = 'sensoryseasons'
--             WHERE slug = 'sensory-seasons';
--
-- Fundraiser split: 25% of retail to Sensory Seasons, matching the house
-- default used for other fundraiser stores. Adjust in admin if the
-- agreement with Tangela lands elsewhere.
--
-- Idempotent: safe to replay against a fresh database.

BEGIN;

-- ── store ────────────────────────────────────────────────────────────────
INSERT INTO stores
  (slug, name, owner_email, store_type, status, brand_json,
   fulfillment_mode, pickup_location_json, is_fundraiser, fundraiser_json,
   subdomain)
SELECT
  'sensory-seasons',
  'Sensory Seasons',
  'tangela.youn@sensoryseasons.org',
  'group',
  'active',
  jsonb_build_object(
    'primary_color', '#14274E',
    'tagline',       'Inclusion is the standard. Support is the culture.',
    'hero_url',      'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/quote-designs/admin-studio-mockup/mockup-screenshot-1790607523007-front.png-1790607523228.png',
    'footer_note',   'Printed and fulfilled by T-Shirt Brothers in Fairburn, GA. Every purchase supports The Sensory Seasons Initiative.',
    'back_url',      'https://tshirtbrothers.com'
  ),
  'ship_only',
  '{}'::jsonb,
  TRUE,
  jsonb_build_object(
    'headline',           'Every shirt supports Sensory Seasons',
    'description',        'A share of every item sold in this store goes directly to The Sensory Seasons Initiative and its autism awareness and inclusion work.',
    'contribution_type',  'percent',
    'contribution_value', 25
  ),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE slug = 'sensory-seasons');

-- ── default agreement ────────────────────────────────────────────────────
-- store_products.active_agreement_id is NOT NULL, so the store needs one
-- before any product can be published.
INSERT INTO store_agreements
  (store_id, kind, fee_config_json, payout_terms_json, accepted_by_email)
SELECT
  s.id, 'store',
  jsonb_build_object('contribution_type', 'percent', 'contribution_value', 25),
  jsonb_build_object('cadence', 'per_campaign_close', 'method', 'ach'),
  'tangela.youn@sensoryseasons.org'
FROM stores s
WHERE s.slug = 'sensory-seasons'
  AND NOT EXISTS (
    SELECT 1 FROM store_agreements a WHERE a.store_id = s.id AND a.kind = 'store'
  );

-- ── group admins ─────────────────────────────────────────────────────────
INSERT INTO store_admins (store_id, email, name, role, invited_by_email)
SELECT s.id, v.email, v.name, v.role, 'info@tshirtbrothers.com'
FROM stores s
CROSS JOIN (VALUES
  ('tangela.youn@sensoryseasons.org', 'Tangela Youn',  'owner'),
  ('kpj64110@gmail.com',              'Kevin Johnson', 'owner')
) AS v(email, name, role)
WHERE s.slug = 'sensory-seasons'
ON CONFLICT (store_id, email) DO NOTHING;

-- ── product ──────────────────────────────────────────────────────────────
-- One SKU from mockup #134. tsb_blank_ss_id '32' is the S&S style id the
-- products table carries for the Gildan 64000 Softstyle (matching what
-- POST /:id/products/from-mockup would have written).
INSERT INTO store_products
  (store_id, tsb_blank_ss_id, title, slug, description, cover_image,
   retail_price_cents, variants_json, active_agreement_id,
   blank_cost_cents, decoration_cost_cents, min_qty, is_active)
SELECT
  s.id,
  '32',
  'Inclusion Is the Standard Tee',
  'inclusion-standard-tee',
  'The official Sensory Seasons autism-awareness tee. "Inclusion is the standard. Support is the culture." in navy with the rainbow infinity mark, printed on a white Gildan 64000 Softstyle — 4.5 oz ring-spun cotton, a softer, lighter fit than a standard heavy tee. A share of every shirt goes directly to The Sensory Seasons Initiative.',
  'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/quote-designs/admin-studio-mockup/mockup-screenshot-1790607523007-front.png-1790607523228.png',
  2500,
  '{"sizes":["S","M","L","XL","2XL","3XL"],"colors":["White"]}'::jsonb,
  a.id,
  250, 450, 1, TRUE
FROM stores s
JOIN LATERAL (
  SELECT id FROM store_agreements
   WHERE store_id = s.id AND kind = 'store'
   ORDER BY accepted_at DESC LIMIT 1
) a ON TRUE
WHERE s.slug = 'sensory-seasons'
  AND NOT EXISTS (
    SELECT 1 FROM store_products p
     WHERE p.store_id = s.id AND p.slug = 'inclusion-standard-tee'
  );

COMMIT;
