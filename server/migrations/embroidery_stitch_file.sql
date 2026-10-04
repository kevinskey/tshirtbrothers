-- Customers who arrive with an ALREADY-digitized stitch file (Kevin,
-- 2026-10-03: "address the customer that already has a digitized file and
-- wants to upload it to get it embroidered"). No digitization fee — the $25
-- exists to pay for digitizing, and there is nothing to digitize.
--
-- Apply on the droplet:
--   psql -d tshirtbrothers -f /var/www/tshirtbrothers/server/migrations/embroidery_stitch_file.sql
ALTER TABLE embroidery_requests ADD COLUMN IF NOT EXISTS stitch_file_url TEXT;
ALTER TABLE embroidery_requests ADD COLUMN IF NOT EXISTS stitch_file_name TEXT;
ALTER TABLE embroidery_requests ADD COLUMN IF NOT EXISTS needs_digitizing BOOLEAN NOT NULL DEFAULT TRUE;

-- A stitch-file-only request has no artwork image; the stitch file IS the
-- artwork. (The API enforces at-least-one-of artwork/stitch file.)
ALTER TABLE embroidery_requests ALTER COLUMN artwork_url DROP NOT NULL;

-- Multiple designs per request (Kevin, 2026-10-04): each design is its own
-- $25 digitization charge at checkout and its own stitch count at quote time.
ALTER TABLE embroidery_requests ADD COLUMN IF NOT EXISTS artwork_urls JSONB;
ALTER TABLE embroidery_requests ADD COLUMN IF NOT EXISTS design_count INTEGER NOT NULL DEFAULT 1;
