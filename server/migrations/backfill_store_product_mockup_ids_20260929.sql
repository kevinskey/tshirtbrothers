-- Backfill variants_json.mockup_id on tsb-direct store products published
-- before the from-mockup endpoint started recording it (2026-09-29).
-- Match on cover_image, which publish always copied from the mockup's
-- preview/product image. Idempotent: skips rows that already carry the key.
UPDATE store_products sp
   SET variants_json = sp.variants_json || jsonb_build_object('mockup_id', m.id)
  FROM stores s, mockups m
 WHERE s.id = sp.store_id
   AND s.slug = 'tsb-direct'
   AND NOT (sp.variants_json ? 'mockup_id')
   AND sp.cover_image IS NOT NULL
   AND sp.cover_image IN (m.preview_image_url, m.preview_image_url_back, m.product_image_url);
