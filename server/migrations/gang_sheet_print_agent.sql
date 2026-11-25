-- In-house DTF printing. The shop PC next to the Prestige runs
-- integrations/digirip-print-agent, which polls for paid orders, drops each
-- sheet PNG into DigiRIP's hot folder, and reports back here. These columns
-- record that handoff so the admin queue shows "Pulled to printer" the same
-- way it shows "Sent to <vendor>", and so the agent never pulls a sheet
-- twice. Idempotent -- applied on API boot.
ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS printer_pulled_at timestamptz;
ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS printer_name text;
