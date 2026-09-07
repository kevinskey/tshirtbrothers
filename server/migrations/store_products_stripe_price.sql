-- Cached Stripe Price per store product, used for checkout upsells
-- (optional_items requires catalog Price objects, not ad-hoc price_data).
-- stripe_price_cents records the amount the Price was minted at so a
-- retail change invalidates the cache.
ALTER TABLE store_products
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_cents INTEGER;
