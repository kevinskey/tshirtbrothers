-- Per-design digitizer deliverables on a quote request: the DST stitch file
-- and the digitizer's PDF profile (stitch-out preview / color sequence).
-- Array indexed by design: [{ label, pdf_url, pdf_name, dst_url, dst_name,
-- stitch_count }]. Lives on the REQUEST (not embroidery_jobs) because the
-- quote email sends the PDF profiles to the customer with the price.
ALTER TABLE embroidery_requests
  ADD COLUMN IF NOT EXISTS design_files jsonb NOT NULL DEFAULT '[]'::jsonb;
