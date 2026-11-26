-- Offer 12"-wide gang sheets alongside the 22" and 34" rolls.
--
-- Sold by the linear foot like the others, 1 ft steps, same min/max length.
-- Kevin's call, 2026-11-26: $6.99/ft standard, with rush and hot rush
-- scaled by the same ratio the 22" roll's tiers sit above its standard
-- ($12.99 / $11.99 and $17.00 / $11.99), which lands at $7.57 and $9.91.
--
-- Own columns, not a multiplier on the 22" rate, for the same reason as
-- dtf_sheet_width_34.sql: each roll's price is edited independently in
-- /admin. width_12_active is the kill switch, also in /admin.
--
-- 12" = 3,600 px at 300 DPI. gang_sheet_orders.width_in and
-- gang_sheets.width_in already exist (added for 34") and take any INT.
ALTER TABLE gang_sheet_store_settings
  ADD COLUMN IF NOT EXISTS rate_12_standard_cents INT NOT NULL DEFAULT 699,
  ADD COLUMN IF NOT EXISTS rate_12_rush_cents     INT NOT NULL DEFAULT 757,
  ADD COLUMN IF NOT EXISTS rate_12_hot_rush_cents INT NOT NULL DEFAULT 991,
  ADD COLUMN IF NOT EXISTS width_12_active        BOOLEAN NOT NULL DEFAULT TRUE;
