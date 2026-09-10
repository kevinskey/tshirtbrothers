-- Multiple mockups per quote / invoice (2026-09-09, Kevin's request).
-- The original single mockup columns stay as the "primary"; extras are a
-- denormalized jsonb array [{mockup_id, front, back}] so invoice emails and
-- customer views don't need extra joins.
ALTER TABLE quotes   ADD COLUMN IF NOT EXISTS extra_mockups jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS extra_mockups jsonb NOT NULL DEFAULT '[]'::jsonb;
