-- Per-design canvas HEIGHT in inches.
--
-- Companion to canvas_inches (which is the width). Together they let a
-- design carry a rectangular print area — a 12×16 chest, 8×4 sleeve, 14×18
-- back, etc. Existing rows default to 12 (square at the same value as
-- canvas_inches's default), so visible behavior is unchanged for them.

BEGIN;

ALTER TABLE saved_designs
  ADD COLUMN IF NOT EXISTS canvas_inches_h NUMERIC(5,2) NOT NULL DEFAULT 12;

COMMENT ON COLUMN saved_designs.canvas_inches_h IS
  'Print-area HEIGHT in inches. Pairs with canvas_inches (width). Defaults to 12 (matches the studio''s previous square-canvas behavior).';

COMMIT;
