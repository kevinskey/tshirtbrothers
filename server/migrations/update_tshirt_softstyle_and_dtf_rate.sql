-- Anchor Standard T-shirt to Gildan Softstyle 64000 (\$2.95) instead of
-- Heavy Cotton 5000 (\$2.38) — Softstyle is the more popular base. DTF
-- per-piece bumps from \$4 to \$6 to better reflect the real labor +
-- materials per location.

UPDATE instant_quote_garments
   SET base_cost = 2.95
 WHERE name = 'T-shirt' AND quality_tier = 'Standard';

UPDATE instant_quote_print_methods
   SET base_per_piece_cost = 6.00
 WHERE name = 'DTF';
