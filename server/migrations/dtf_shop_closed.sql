-- "Shop closed" switch for the DTF store, set from /admin/dtf-orders.
--
-- Kevin asked for a way to close the shop from the admin page (2026-11-26,
-- Thanksgiving, when Rush and Hot Rush were still on sale with same-day
-- promises). While shop_closed is on, /config marks every turnaround
-- unavailable and /checkout refuses new orders.
--
-- shop_reopens_on (optional) ends the closure by itself at midnight Atlanta
-- time on that date. shop_closed_note (optional) is shown to customers
-- under the closed notice, e.g. "Happy Thanksgiving!".
ALTER TABLE gang_sheet_store_settings
  ADD COLUMN IF NOT EXISTS shop_closed      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS shop_reopens_on  DATE,
  ADD COLUMN IF NOT EXISTS shop_closed_note TEXT;
