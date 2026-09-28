-- Sensory Seasons: add the youth tee (from mockup #135, Gildan 5000B
-- Youth Heavy Cotton, white, youth S–XL).
--
-- Priced at the same $25 as the adult tee so the agreement's flat
-- $13/shirt TSB take yields the same $12-per-shirt contribution on
-- every item in the store.
--
-- Idempotent: safe to replay against a fresh database.

BEGIN;

INSERT INTO store_products
  (store_id, tsb_blank_ss_id, title, slug, description, cover_image,
   retail_price_cents, variants_json, active_agreement_id,
   blank_cost_cents, decoration_cost_cents, min_qty, is_active)
SELECT
  s.id,
  '543',
  'Inclusion Is the Standard Tee — Youth',
  'inclusion-standard-tee-youth',
  'The Sensory Seasons autism-awareness tee in youth sizes. "Inclusion is the standard. Support is the culture." in navy with the rainbow infinity mark, printed on a white Gildan Youth Heavy Cotton — 5.3 oz, 100% cotton, tear-away label so there''s no scratchy tag. A share of every shirt goes directly to The Sensory Seasons Initiative.',
  'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/quote-designs/admin-studio-mockup/mockup-screenshot-1790613342872-front.png-1790613343060.png',
  2500,
  '{"sizes":["YS","YM","YL","YXL"],"colors":["White"]}'::jsonb,
  a.id,
  220, 450, 1, TRUE
FROM stores s
JOIN LATERAL (
  SELECT id FROM store_agreements
   WHERE store_id = s.id AND kind = 'store'
   ORDER BY accepted_at DESC LIMIT 1
) a ON TRUE
WHERE s.slug = 'sensory-seasons'
  AND NOT EXISTS (
    SELECT 1 FROM store_products p
     WHERE p.store_id = s.id AND p.slug = 'inclusion-standard-tee-youth'
  );

COMMIT;
