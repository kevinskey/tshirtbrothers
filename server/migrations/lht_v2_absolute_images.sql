-- Live Hard Truth fix: Stripe checkout rejects relative product image URLs
-- ("Not a valid URL"), so cover_image / brand imagery must be absolute.
-- lht_v1.sql seeded relative /lht/... paths on databases migrated before
-- this fix; rewrite them in place. (lht_v1 itself now seeds absolute URLs
-- for fresh databases — these UPDATEs are then no-ops.) Idempotent.

BEGIN;

UPDATE store_products sp
   SET cover_image = 'https://tshirtbrothers.com' || sp.cover_image
  FROM stores s
 WHERE s.id = sp.store_id
   AND s.slug = 'live-hard-truth'
   AND sp.cover_image LIKE '/lht/%';

UPDATE stores
   SET brand_json = brand_json
       || jsonb_build_object(
            'logo_url', 'https://tshirtbrothers.com' || (brand_json->>'logo_url'),
            'hero_url', 'https://tshirtbrothers.com' || (brand_json->>'hero_url'))
 WHERE slug = 'live-hard-truth'
   AND brand_json->>'logo_url' LIKE '/lht/%';

UPDATE products
   SET image_url = 'https://tshirtbrothers.com' || image_url
 WHERE ss_id LIKE 'lht:%'
   AND image_url LIKE '/lht/%';

COMMIT;
