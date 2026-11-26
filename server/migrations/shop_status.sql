-- Whole-shop "closed" switch, set from the main admin dashboard.
--
-- The first version (dtf_shop_closed.sql) put the switch on the DTF store
-- settings row, so it only paused DTF gang sheet checkout. Kevin wants it
-- for the whole shop (2026-11-26), so the state moves to its own single-row
-- table that every ordering route reads through server/lib/shopStatus.js.
--
-- closed      the switch itself
-- reopens_on  optional; the closure ends by itself at midnight Atlanta time
--             on this date
-- note        optional line shown to customers, e.g. "Happy Thanksgiving!"
--
-- The old gang_sheet_store_settings.shop_* columns are left in place but no
-- longer read. Whatever they held is copied across once, so a closure that
-- was already on stays on through the deploy.
CREATE TABLE IF NOT EXISTS shop_status (
  id          INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  closed      BOOLEAN NOT NULL DEFAULT FALSE,
  reopens_on  DATE,
  note        TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO shop_status (id, closed, reopens_on, note)
SELECT 1, COALESCE(shop_closed, FALSE), shop_reopens_on, shop_closed_note
  FROM gang_sheet_store_settings
 WHERE id = 1
ON CONFLICT (id) DO NOTHING;

-- No DTF settings row (fresh database): still make sure the row exists.
INSERT INTO shop_status (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
