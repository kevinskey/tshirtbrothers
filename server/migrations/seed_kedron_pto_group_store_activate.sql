-- Kedron Elementary PTO group store: publish it.
--
-- seed_kedron_pto_group_store.sql created this store with status='paused'
-- so it would not be publicly reachable before the PTO agreed to anything.
-- Kevin has asked for it live so he can walk the storefront and show it to
-- the PTO, so this flips it to 'active'.
--
-- This migration is written to be self-sufficient rather than a bare
-- UPDATE. Boot migrations are tracked by filename, so the original seed
-- will never replay — and there was no way to confirm from outside that it
-- applied, because a paused store and a nonexistent store both 404. Every
-- INSERT below is therefore guarded, so this file repairs a partial or
-- failed seed and then activates, whatever state it finds.
--
-- Left deliberately alone: subdomain stays NULL. A <label>.tshirtbrothers.com
-- host needs the wildcard DNS + TLS setup in docs/group-stores-subdomains.md,
-- and claiming one here would hand out a link that may not resolve. The
-- store is reachable at /stores/kedron-pto.
--
-- NOTE: 'active' also lists this store publicly at tshirtbrothers.com/stores.
-- To pull it back without losing anything:
--   UPDATE stores SET status='paused' WHERE slug='kedron-pto';

BEGIN;

-- ── store (repair if the original seed never landed) ─────────────────────
INSERT INTO stores
  (slug, name, owner_email, store_type, status, brand_json,
   fulfillment_mode, pickup_location_json, is_fundraiser, fundraiser_json, subdomain)
SELECT
  'kedron-pto', 'Kedron Elementary PTO', 'info@tshirtbrothers.com', 'group', 'active',
  jsonb_build_object(
    'primary_color', '#135BAD',
    'tagline',       'Home of the Knights — spirit wear for every grade.',
    'hero_url',      '/stores/kedron/youth_royal.jpg',
    'footer_note',   'Printed and fulfilled by T-Shirt Brothers in Fairburn, GA. Every order is picked up at Kedron Elementary — no shipping fees for Kedron families.',
    'back_url',      'https://tshirtbrothers.com'
  ),
  'pickup_only',
  jsonb_build_object(
    'name','Kedron Elementary School','city','Peachtree City','state','GA','zip','30269',
    'hours_note','Pickup in the front office during school hours, or at the next scheduled PTO distribution.',
    'contact_email','info@tshirtbrothers.com','contact_phone','(470) 622-4845'
  ),
  TRUE,
  jsonb_build_object(
    'headline','Every shirt supports Kedron PTO',
    'description','A share of every spirit shirt sold here goes straight back to the PTO. No volunteer hours, no inventory to store, no money collected at the door.',
    'contribution_type','percent','contribution_value',25
  ),
  NULL
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE slug = 'kedron-pto');

-- ── default agreement (store_products.active_agreement_id is NOT NULL) ───
INSERT INTO store_agreements
  (store_id, kind, fee_config_json, payout_terms_json, accepted_by_email)
SELECT s.id, 'store',
       jsonb_build_object('contribution_type','percent','contribution_value',25),
       jsonb_build_object('cadence','per_campaign_close','method','ach'),
       'info@tshirtbrothers.com'
FROM stores s
WHERE s.slug = 'kedron-pto'
  AND NOT EXISTS (SELECT 1 FROM store_agreements a WHERE a.store_id = s.id AND a.kind = 'store');

-- ── group admin ──────────────────────────────────────────────────────────
INSERT INTO store_admins (store_id, email, name, role, invited_by_email)
SELECT s.id, 'kpj64110@gmail.com', 'Kevin Johnson', 'owner', 'info@tshirtbrothers.com'
FROM stores s WHERE s.slug = 'kedron-pto'
ON CONFLICT (store_id, email) DO NOTHING;

-- ── products ─────────────────────────────────────────────────────────────
INSERT INTO store_products
  (store_id, tsb_blank_ss_id, title, slug, description, cover_image,
   retail_price_cents, variants_json, active_agreement_id,
   blank_cost_cents, decoration_cost_cents, min_qty, is_active)
SELECT s.id, v.ss_id, v.title, v.slug, v.description, v.cover_image,
       v.retail_price_cents, v.variants::jsonb, a.id,
       v.blank_cost_cents, v.decoration_cost_cents, 1, TRUE
FROM stores s
JOIN LATERAL (
  SELECT id FROM store_agreements
   WHERE store_id = s.id AND kind = 'store'
   ORDER BY accepted_at DESC LIMIT 1
) a ON TRUE
CROSS JOIN (VALUES
  ('G500B','Kedron Knights Spirit Tee — Youth','knights-spirit-tee-youth',
   'The official Kedron spirit shirt in youth sizes. Gildan 5000B Heavy Cotton — 5.3 oz, 100% U.S. cotton, tear-away label so there''s no scratchy tag. One-color white front print. Youth sizes run S (fits 6–8) through XL (fits 18–20).',
   '/stores/kedron/youth_royal.jpg', 1800, 320, 450,
   '{"sizes":["YS","YM","YL","YXL"],"colors":["Royal","Red","Irish Green","Purple","Orange","Heliconia","Black"]}'),
  ('G500','Kedron Knights Spirit Tee — Adult','knights-spirit-tee-adult',
   'The official Kedron spirit shirt in adult sizes, for parents, staff, and the 5th graders who''ve outgrown youth XL. Gildan 5000 Heavy Cotton — 5.3 oz, 100% U.S. cotton, taped neck and shoulders. One-color white front print.',
   '/stores/kedron/adult_royal.jpg', 2000, 380, 450,
   '{"sizes":["S","M","L","XL"],"colors":["Royal","Red","Irish Green","Purple","Orange","Heliconia","Black"]}')
) AS v(ss_id, title, slug, description, cover_image,
       retail_price_cents, blank_cost_cents, decoration_cost_cents, variants)
WHERE s.slug = 'kedron-pto'
  AND NOT EXISTS (SELECT 1 FROM store_products p WHERE p.store_id = s.id AND p.slug = v.slug);

-- ── publish ──────────────────────────────────────────────────────────────
UPDATE stores SET status = 'active' WHERE slug = 'kedron-pto' AND status <> 'active';

COMMIT;
