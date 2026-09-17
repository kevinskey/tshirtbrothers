-- TSB Pro — Business Web Stores.
--
-- A "business" store is the B2B sibling of a group store: a permanent
-- private storefront holding a business customer's approved products so
-- they can reorder without rebuilding the order. It reuses the entire
-- group-store machinery (store_products, store_admins, checkout capture,
-- ledger); the only schema change needed is a third store_type value.
--
-- Business-specific profile fields live in stores.brand_json:
--   business_address  - street address shown on the storefront
--   website_url       - link to the business's own website
-- (brand_json is free-form JSONB, so no columns are added.)

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_store_type_check;
ALTER TABLE stores ADD CONSTRAINT stores_store_type_check
  CHECK (store_type IN ('franchise', 'group', 'business'));
