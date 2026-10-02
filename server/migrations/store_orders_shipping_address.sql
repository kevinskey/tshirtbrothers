-- Keep the ship-to address on a storefront order.
--
-- Stripe Checkout collects a shipping address for every store sale
-- (shipping_address_collection is set on the session), but
-- captureStoreOrder only ever stored the email — so the shop had orders it
-- was expected to MAIL and no address to mail them to. The only copy was
-- in the Stripe dashboard, one session at a time (Kevin, 2026-10-02:
-- "ARE THESE ORDERS TO BE MAILED I CANT SEE THE ORDERS FROM ADMIN").
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS buyer_name       TEXT;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS buyer_phone      TEXT;
-- { name, phone, line1, line2, city, state, postal_code, country }
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS shipping_address JSONB;
-- The delivery option the buyer paid for, e.g. "Standard — USPS Ground".
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS shipping_label   TEXT;
