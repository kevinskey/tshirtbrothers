-- Rush option = 1-2 day turnaround at 2x regular price. Surcharge =
-- 100% of base, so (base + base) × markup = 2 × (base × markup) =
-- exactly double the standard total. Turnaround days set to 2 so the
-- UI/confirmation email surface "2 day turnaround" for rush orders.

UPDATE instant_quote_settings
   SET rush_surcharge_pct = 1.00,
       rush_turnaround    = 2
 WHERE id = 1;
