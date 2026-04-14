-- Embroidery jobs: track raster artwork through the digitizing process
-- until a production-ready DST file is attached.
--
-- Apply on the droplet after pulling latest main:
--   psql -d tshirtbrothers -f /var/www/tshirtbrothers/server/migrations/add_embroidery_jobs.sql

CREATE TABLE IF NOT EXISTS embroidery_jobs (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  notes            TEXT,
  status           VARCHAR(50) NOT NULL DEFAULT 'artwork_received',
    -- artwork_received | sent_to_digitizer | dst_ready | in_production | completed | cancelled
  source_image_url TEXT,    -- original PNG/JPG upload
  vector_svg_url   TEXT,    -- vectorized preview (potrace SVG)
  dst_file_url     TEXT,    -- final digitized DST file
  colors           INTEGER, -- thread color count
  digitizer        VARCHAR(255), -- which vendor / person did the digitizing
  cost             DECIMAL(10,2),
  quote_id         INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  customer_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embroidery_jobs_status
  ON embroidery_jobs(status);
CREATE INDEX IF NOT EXISTS idx_embroidery_jobs_quote
  ON embroidery_jobs(quote_id)
  WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_embroidery_jobs_customer
  ON embroidery_jobs(customer_id)
  WHERE customer_id IS NOT NULL;
