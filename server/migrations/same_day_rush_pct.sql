-- Flat same-day rush premium (fraction, 0.75 = 75%). Applies when the
-- need-by date is today (rushDays >= standard_turnaround), replacing the
-- per-day rush ladder for that case.
ALTER TABLE instant_quote_settings ADD COLUMN IF NOT EXISTS same_day_rush_pct NUMERIC DEFAULT 0.75;
UPDATE instant_quote_settings SET same_day_rush_pct = 0.75 WHERE id = 1 AND same_day_rush_pct IS NULL;
