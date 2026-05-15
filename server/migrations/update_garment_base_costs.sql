-- New base-cost grid for instant_quote_garments. T-shirts anchor to
-- Standard $5 / Premium $9 / Ultra $15; the other garments keep their
-- previous ratios to T-shirts, rounded to clean numbers.

BEGIN;

UPDATE instant_quote_garments SET base_cost = CASE quality_tier
  WHEN 'Standard' THEN 5.00
  WHEN 'Premium'  THEN 9.00
  WHEN 'Ultra'    THEN 15.00
END WHERE name = 'T-shirt';

UPDATE instant_quote_garments SET base_cost = CASE quality_tier
  WHEN 'Standard' THEN 5.75
  WHEN 'Premium'  THEN 10.00
  WHEN 'Ultra'    THEN 14.00
END WHERE name = 'Tank';

UPDATE instant_quote_garments SET base_cost = CASE quality_tier
  WHEN 'Standard' THEN 8.50
  WHEN 'Premium'  THEN 13.50
  WHEN 'Ultra'    THEN 20.00
END WHERE name = 'Long-sleeve';

UPDATE instant_quote_garments SET base_cost = CASE quality_tier
  WHEN 'Standard' THEN 13.00
  WHEN 'Premium'  THEN 21.00
  WHEN 'Ultra'    THEN 30.00
END WHERE name = 'Polo';

UPDATE instant_quote_garments SET base_cost = CASE quality_tier
  WHEN 'Standard' THEN 13.50
  WHEN 'Premium'  THEN 22.00
  WHEN 'Ultra'    THEN 31.00
END WHERE name = 'Sweatshirt';

UPDATE instant_quote_garments SET base_cost = CASE quality_tier
  WHEN 'Standard' THEN 16.50
  WHEN 'Premium'  THEN 27.00
  WHEN 'Ultra'    THEN 38.00
END WHERE name = 'Hoodie';

UPDATE instant_quote_garments SET base_cost = CASE quality_tier
  WHEN 'Standard' THEN 8.00
  WHEN 'Premium'  THEN 15.00
  WHEN 'Ultra'    THEN 28.00
END WHERE name = 'Hat';

COMMIT;
