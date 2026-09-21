-- Products published via the Add-to-TSB-Direct dialog before 2026-09-21
-- stored their category only in variants_json; the subdomain storefront
-- groups collections by campaign_ref, so they showed uncategorized on
-- shop.tshirtbrothers.com. Backfill campaign_ref from the category.
-- Idempotent: only touches rows with a category and no campaign_ref.
UPDATE store_products
   SET campaign_ref = NULLIF(
         left(
           regexp_replace(
             regexp_replace(lower(variants_json->>'category'), '[^a-z0-9]+', '-', 'g'),
             '^-+|-+$', '', 'g'),
           120),
         '')
 WHERE campaign_ref IS NULL
   AND variants_json->>'category' IS NOT NULL
   AND variants_json->>'category' <> '';
