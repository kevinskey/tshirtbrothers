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
