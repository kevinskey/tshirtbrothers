-- Estimate-first embroidery flow (Kevin, 2026-10-06): the quote goes out
-- BEFORE digitizing, built on size-based stitch estimates; the customer's
-- 50% deposit is what starts the work. These columns track that deposit.
ALTER TABLE embroidery_requests ADD COLUMN IF NOT EXISTS deposit_cents integer;
ALTER TABLE embroidery_requests ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
