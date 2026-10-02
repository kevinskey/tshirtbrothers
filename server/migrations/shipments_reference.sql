-- A note on a label: what the parcel is, for the postage ledger. Matters
-- most for one-off labels that have no order behind them ("sample to
-- Kedron PTO", "replacement hoodie — Cheryl").
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS reference TEXT;
