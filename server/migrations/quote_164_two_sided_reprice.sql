-- Quote #164 (Gayle Young) uploaded a front+back design but the Easy Quote
-- wizard priced it at 1 print location (hardcoded numLocations before commit
-- a5f41d7). Reprice at 2 locations: base (4.03 + 2.75*2)*200 + 70 = 1976,
-- -22% qty discount = 1541.28, x2 markup = 3082.56 ($15.41/shirt).
-- Guarded on the old price + pending status so it applies exactly once and
-- never clobbers a quote the admin has since edited. No emails are sent by
-- this change.
UPDATE quotes SET
  estimated_price = 3082.56,
  calculated_price = 3082.56,
  notes = notes || ' · Print: front & back (2 locations) — repriced from $2,224.56 which assumed front-only',
  inputs_json = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(inputs_json, '{grand_total}', to_jsonb(3082.56)),
          '{items,0,calc,total}', to_jsonb(3082.56)),
        '{items,0,calc,per_shirt}', to_jsonb(15.41)),
      '{items,0,inputs,numLocations}', to_jsonb(2)),
    '{items,0,calc,breakdown}',
    (inputs_json->'items'->0->'calc'->'breakdown') || jsonb_build_object(
      'base', 1976,
      'subtotal', 1541.28,
      'quantity_discount', 434.72,
      'num_locations', 2))
WHERE id = 164
  AND status = 'pending'
  AND estimated_price = 2224.56;
