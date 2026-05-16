-- T-shirt instant-quote tiers map to canonical S&S brands at their
-- wholesale price. The calculator already multiplies by markup (2.0)
-- so retail garment portion = wholesale × 2, which is the rule the
-- shop owner picked:
--   Standard  → Gildan Heavy Cotton 5000        ($2.38 wholesale)
--   Premium   → Next Level Cotton 3600          ($4.03 wholesale)
--   Ultra     → Comfort Colors Heavyweight 1717 ($6.29 wholesale)

UPDATE instant_quote_garments SET base_cost = 2.38 WHERE name = 'T-shirt' AND quality_tier = 'Standard';
UPDATE instant_quote_garments SET base_cost = 4.03 WHERE name = 'T-shirt' AND quality_tier = 'Premium';
UPDATE instant_quote_garments SET base_cost = 6.29 WHERE name = 'T-shirt' AND quality_tier = 'Ultra';
