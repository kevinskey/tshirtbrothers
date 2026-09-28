-- Sensory Seasons deal terms: $25 retail, $13 to TSB, $12 to the
-- fundraiser — a flat per-shirt split, not a percent.
--
-- Also fixes a real money bug in the original seed: captureStoreOrder's
-- computeLineSplit reads fee_config_json.percent_of_retail and
-- .min_per_item_cents (TSB's take). The seeded config only had the
-- display-shape contribution_* keys, which the capture code ignores —
-- TSB's take would have computed to $0 and the store would have been
-- credited the full retail. min_per_item_cents = 1300 encodes the flat
-- $13/shirt take exactly; the store ledger gets retail minus that.
--
-- No orders exist yet for this store, so updating the agreement in
-- place is safe (splits are frozen per-order at capture time).

BEGIN;

UPDATE store_agreements
   SET fee_config_json = jsonb_build_object(
         'percent_of_retail',  0,
         'min_per_item_cents', 1300,
         -- display/bookkeeping only — capture code ignores these
         'contribution_type',  'fixed_per_item',
         'contribution_value_cents', 1200
       )
 WHERE kind = 'store'
   AND store_id = (SELECT id FROM stores WHERE slug = 'sensory-seasons');

UPDATE stores
   SET fundraiser_json = jsonb_build_object(
         'headline',    'Every shirt gives $12 to Sensory Seasons',
         'description', '$12 from every $25 shirt sold in this store goes directly to The Sensory Seasons Initiative and its autism awareness and inclusion work.',
         'contribution_type',  'fixed_per_item',
         'contribution_value_cents', 1200
       )
 WHERE slug = 'sensory-seasons';

COMMIT;
