-- Custom image override for CGC holiday products. Normally the card/PDP
-- photo comes from the first variant's jds_products.image_url; this lets
-- the admin upload their own shot (required for products with no JDS
-- SKU yet, e.g. apparel drafts, and useful for staged photography).
ALTER TABLE cgc_holiday_products ADD COLUMN IF NOT EXISTS image_url TEXT;
