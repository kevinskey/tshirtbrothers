-- Sensory Seasons youth tee deal change (Doc, 2026-09-28): children's
-- shirt sells at $18 and the initiative gets $6 per shirt (TSB keeps
-- $12). Uses the new per-product fee override
-- (fee_config_json.per_product."<store_product_id>") read by
-- computeLineSplit; the adult tee stays $25 with the store-wide
-- $13 TSB min ($12 to the initiative). Idempotent.

UPDATE store_products
   SET retail_price_cents = 1800
 WHERE store_id = 35
   AND slug = 'inclusion-standard-tee-youth'
   AND retail_price_cents = 2500;

UPDATE store_agreements sa
   SET fee_config_json = sa.fee_config_json
       || jsonb_build_object(
            'per_product',
            COALESCE(sa.fee_config_json->'per_product', '{}'::jsonb)
            || jsonb_build_object(sp.id::text, jsonb_build_object('min_per_item_cents', 1200))
          )
  FROM store_products sp
 WHERE sp.store_id = 35
   AND sp.slug = 'inclusion-standard-tee-youth'
   AND sa.id = sp.active_agreement_id
   AND NOT (COALESCE(sa.fee_config_json->'per_product', '{}'::jsonb) ? sp.id::text);
