-- Link embroidery requests back to the quote they came from, so the Quotes
-- workflow can show the embroidery form inline (Kevin, 2026-10-05: "this
-- needs to get integrated into the workflow/quotes ui and not separate").
-- NOTE: tsbadmin doesn't own embroidery_requests — apply as postgres:
--   sudo -u postgres psql tshirtbrothers -f server/migrations/embroidery_request_quote_link.sql
ALTER TABLE embroidery_requests ADD COLUMN IF NOT EXISTS quote_id INTEGER;

-- Backfill the two requests converted from Quote #209 before the column
-- existed (the link lived only in free-text notes).
UPDATE embroidery_requests SET quote_id = 209 WHERE id IN (9, 10) AND quote_id IS NULL;
