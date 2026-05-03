-- Per-design canvas size in inches.
--
-- The design studio defaulted to a hardcoded 12" t-shirt chest print width.
-- This column lets each design carry its own print width — pocket prints
-- (~4"), sleeve prints (~3"), youth tees (~10"), plus-size (~14"), and
-- back prints (~12-15") all need different sizes. Existing designs default
-- to 12" so nothing visibly changes for them.
--
-- The studio reads this on load, displays it in the header, and uses it
-- when computing inches readouts and text-size-in-inches conversions.

BEGIN;

ALTER TABLE saved_designs
  ADD COLUMN IF NOT EXISTS canvas_inches NUMERIC(5,2) NOT NULL DEFAULT 12;

COMMENT ON COLUMN saved_designs.canvas_inches IS
  'Print-area width in inches the design was authored against. Drives in-studio inches readouts (DimensionReadout) and text-size-in-inches conversions. Defaults to 12 (standard adult-tee chest).';

COMMIT;
