-- Persist the gang-sheet builder's placement layout so the admin queue can
-- show what's ON a sheet (how many graphics, what sizes) instead of only a
-- downloadable PNG. The builder composes to a private file_key before
-- checkout, so the layout is stashed by file_key at compose time and copied
-- onto the order at checkout. Uploaded ready-made sheets have no layout.

CREATE TABLE IF NOT EXISTS gang_sheet_layouts (
  file_key   TEXT PRIMARY KEY,
  layout     JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS layout JSONB;
