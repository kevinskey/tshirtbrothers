-- Offer 34"-wide gang sheets alongside the 22" roll.
--
-- Both widths are still sold by the linear foot. KolorMatrix (our print
-- vendor) runs both: $6.00/ft at 22", $9.00/ft at 34". Retail mirrors how
-- 22" is already priced -- 50% margin on standard, then the same flat tier
-- uplifts (+$1.00 rush, +$5.01 hot rush) -- so 34" lands at
-- $17.99 / $18.99 / $23.00. Kevin's call, 2026-11-05.
--
-- Width-specific rates are their own columns rather than a multiplier on
-- the 22" rate: the two rolls are separate vendor SKUs whose prices move
-- independently, and a multiplier would silently re-price 34" every time
-- someone edited the 22" rate in /admin.
ALTER TABLE gang_sheet_store_settings
  ADD COLUMN IF NOT EXISTS rate_34_standard_cents INT NOT NULL DEFAULT 1799,
  ADD COLUMN IF NOT EXISTS rate_34_rush_cents     INT NOT NULL DEFAULT 1899,
  ADD COLUMN IF NOT EXISTS rate_34_hot_rush_cents INT NOT NULL DEFAULT 2300,
  ADD COLUMN IF NOT EXISTS width_34_active        BOOLEAN NOT NULL DEFAULT TRUE;

-- Every existing order was 22" -- that was the only width the store sold --
-- so the default backfills history correctly.
ALTER TABLE gang_sheet_orders
  ADD COLUMN IF NOT EXISTS width_in INT NOT NULL DEFAULT 22;

-- Saved builder sheets carry their width too, or reopening a 34" sheet
-- would silently reflow it onto a 22" canvas.
ALTER TABLE gang_sheets
  ADD COLUMN IF NOT EXISTS width_in INT NOT NULL DEFAULT 22;

-- Undo dtf_max_ft_34.sql. That migration read Kevin's "34 gangsheet
-- option" as 34 FEET OF LENGTH; he meant 34 INCHES OF WIDTH, which is
-- what this file adds. 20 ft is both the original schema default and the
-- longest sheet KolorMatrix will print in one piece, so accepting more
-- would mean splitting those orders by hand. Guarded on = 34 so it only
-- touches the value that migration set, never a deliberate admin choice.
UPDATE gang_sheet_store_settings
   SET max_ft = 20,
       updated_at = now()
 WHERE id = 1
   AND max_ft = 34;
