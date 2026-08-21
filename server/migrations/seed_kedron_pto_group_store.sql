-- Seed: Kedron Elementary PTO group store (sales mockup).
--
-- Stood up alongside quote Q26-0821-KED (900 spirit shirts, 7 colorways).
-- The PTO has NOT signed anything yet, so this is deliberately created
-- with status = 'paused':
--
--   • /api/store-shop routes filter on status = 'active', so a paused
--     store 404s publicly and does not appear in the stores directory.
--   • subdomain is intentionally NULL — we don't claim a DNS label for a
--     prospect who hasn't agreed to anything.
--
-- To take it live after the PTO signs:
--   UPDATE stores SET status = 'active', subdomain = 'kedronpto'
--    WHERE slug = 'kedron-pto';
--
-- Product imagery lives in client/public/stores/kedron/. Those are the
-- Gildan 5000 / 5000B catalog photos recolored into the seven quoted
-- colorways using the true PMS-referenced hex values from Gildan's own
-- spec sheets. They are colorway mockups, NOT photographs of printed
-- Kedron shirts — replace them with real press samples before this store
-- ever takes money.
--
-- Idempotent: safe to replay against a fresh database.

BEGIN;

-- ── store ────────────────────────────────────────────────────────────────
INSERT INTO stores
  (slug, name, owner_email, store_type, status, brand_json,
   fulfillment_mode, pickup_location_json, is_fundraiser, fundraiser_json,
   subdomain)
SELECT
  'kedron-pto',
  'Kedron Elementary PTO',
  'info@tshirtbrothers.com',
  'group',
  'paused',
  jsonb_build_object(
    'primary_color', '#135BAD',
    'tagline',       'Home of the Knights — spirit wear for every grade.',
    'hero_url',      '/stores/kedron/youth_royal.jpg',
    'footer_note',   'Printed and fulfilled by T-Shirt Brothers in Fairburn, GA. Every order is picked up at Kedron Elementary — no shipping fees for Kedron families.',
    'back_url',      'https://tshirtbrothers.com'
  ),
  'pickup_only',
  jsonb_build_object(
    'name',           'Kedron Elementary School',
    'address_line1',  'centrally located in Peachtree City',
    'city',           'Peachtree City',
    'state',          'GA',
    'zip',            '30269',
    'hours_note',     'Pickup in the front office during school hours, or at the next scheduled PTO distribution.',
    'contact_email',  'info@tshirtbrothers.com',
    'contact_phone',  '(470) 622-4845'
  ),
  TRUE,
  jsonb_build_object(
    'headline',           'Every shirt supports Kedron PTO',
    'description',        'A share of every spirit shirt sold here goes straight back to the PTO. No volunteer hours, no inventory to store, no money collected at the door.',
    'contribution_type',  'percent',
    'contribution_value', 25
  ),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE slug = 'kedron-pto');

-- ── default agreement ────────────────────────────────────────────────────
-- store_products.active_agreement_id is NOT NULL, so the store needs one
-- before any product can be published.
INSERT INTO store_agreements
  (store_id, kind, fee_config_json, payout_terms_json, accepted_by_email)
SELECT
  s.id, 'store',
  jsonb_build_object('contribution_type', 'percent', 'contribution_value', 25),
  jsonb_build_object('cadence', 'per_campaign_close', 'method', 'ach'),
  'info@tshirtbrothers.com'
FROM stores s
WHERE s.slug = 'kedron-pto'
  AND NOT EXISTS (
    SELECT 1 FROM store_agreements a WHERE a.store_id = s.id AND a.kind = 'store'
  );

-- ── group admin ──────────────────────────────────────────────────────────
-- Kevin as 'owner': full read access to orders + fundraiser totals, can
-- place bulk orders, and can invite/remove the PTO's own admins once
-- Rachel and the board are ready to be added.
INSERT INTO store_admins (store_id, email, name, role, invited_by_email)
SELECT s.id, 'kpj64110@gmail.com', 'Kevin Johnson', 'owner', 'info@tshirtbrothers.com'
FROM stores s
WHERE s.slug = 'kedron-pto'
ON CONFLICT (store_id, email) DO NOTHING;

-- ── products ─────────────────────────────────────────────────────────────
-- Two SKUs, one per style. Colorways ride in variants_json rather than
-- becoming separate products, matching how GroupStoreProductPage renders
-- a size picker + a color picker off variants_json.
INSERT INTO store_products
  (store_id, tsb_blank_ss_id, title, slug, description, cover_image,
   retail_price_cents, variants_json, active_agreement_id,
   blank_cost_cents, decoration_cost_cents, min_qty, is_active)
SELECT
  s.id, v.ss_id, v.title, v.slug, v.description, v.cover_image,
  v.retail_price_cents, v.variants::jsonb, a.id,
  v.blank_cost_cents, v.decoration_cost_cents, 1, TRUE
FROM stores s
JOIN LATERAL (
  SELECT id FROM store_agreements
   WHERE store_id = s.id AND kind = 'store'
   ORDER BY accepted_at DESC LIMIT 1
) a ON TRUE
CROSS JOIN (VALUES
  (
    'G500B',
    'Kedron Knights Spirit Tee — Youth',
    'knights-spirit-tee-youth',
    'The official Kedron spirit shirt in youth sizes. Gildan 5000B Heavy Cotton — 5.3 oz, 100% U.S. cotton, tear-away label so there''s no scratchy tag. One-color white front print. Youth sizes run S (fits 6–8) through XL (fits 18–20).',
    '/stores/kedron/youth_royal.jpg',
    1800, 320, 450,
    '{"sizes":["YS","YM","YL","YXL"],"colors":["Royal","Red","Irish Green","Purple","Orange","Heliconia","Black"]}'
  ),
  (
    'G500',
    'Kedron Knights Spirit Tee — Adult',
    'knights-spirit-tee-adult',
    'The official Kedron spirit shirt in adult sizes, for parents, staff, and the 5th graders who''ve outgrown youth XL. Gildan 5000 Heavy Cotton — 5.3 oz, 100% U.S. cotton, taped neck and shoulders. One-color white front print.',
    '/stores/kedron/adult_royal.jpg',
    2000, 380, 450,
    '{"sizes":["S","M","L","XL"],"colors":["Royal","Red","Irish Green","Purple","Orange","Heliconia","Black"]}'
  )
) AS v(ss_id, title, slug, description, cover_image,
       retail_price_cents, blank_cost_cents, decoration_cost_cents, variants)
WHERE s.slug = 'kedron-pto'
  AND NOT EXISTS (
    SELECT 1 FROM store_products p WHERE p.store_id = s.id AND p.slug = v.slug
  );

COMMIT;
