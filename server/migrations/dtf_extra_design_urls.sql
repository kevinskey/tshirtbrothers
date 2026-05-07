-- Add extra_design_urls to quotes for DTF Print Transfers requests where the
-- customer uploads multiple graphics (one per print). The first upload still
-- goes into design_url for backwards compatibility with admin renderers; the
-- rest are appended here as a JSONB array of URLs.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS extra_design_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
