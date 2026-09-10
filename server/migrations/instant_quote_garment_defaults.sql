-- Admin-configurable default catalog product per garment x tier (drives
-- the live blank-cost lookup and any future tier->product behavior).
ALTER TABLE instant_quote_garments ADD COLUMN IF NOT EXISTS default_ss_id VARCHAR(20);

UPDATE instant_quote_garments SET default_ss_id = v.ss FROM (VALUES
  ('T-shirt','Standard','16'), ('T-shirt','Premium','3227'), ('T-shirt','Ultra','1822'),
  ('Hoodie','Standard','395'), ('Hoodie','Premium','10163'), ('Hoodie','Ultra','3946'),
  ('Sweatshirt','Standard','372'), ('Sweatshirt','Premium','10142'), ('Sweatshirt','Ultra','1610'),
  ('Long-sleeve','Standard','135'), ('Long-sleeve','Premium','3215'), ('Long-sleeve','Ultra','2217'),
  ('Tank','Standard','2766'), ('Tank','Premium','3216'), ('Tank','Ultra','2437')
) AS v(n, t, ss)
WHERE instant_quote_garments.name = v.n AND instant_quote_garments.quality_tier = v.t
  AND instant_quote_garments.default_ss_id IS NULL;
