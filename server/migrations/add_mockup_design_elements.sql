-- Persist the Design Studio elements behind a mockup so it can be re-opened
-- and edited (instead of being rebuilt from scratch). For legacy mockups
-- that were created via the upload+placement flow, this column stays null
-- and the studio falls back to seeding a single image element from
-- graphic_url at the saved placement.

ALTER TABLE mockups
  ADD COLUMN IF NOT EXISTS design_elements JSONB,
  ADD COLUMN IF NOT EXISTS design_canvas_inches NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS design_canvas_inches_h NUMERIC(5,2);
