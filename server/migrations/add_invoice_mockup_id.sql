-- Let an invoice point at the mockup the admin built while creating it.
-- The mockups table already carries the rendered preview_image_url and
-- placement, so we just need a back-reference from the invoice. ON DELETE
-- SET NULL: deleting the mockup keeps the invoice; the financial record
-- of truth stays put.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS mockup_id INTEGER REFERENCES mockups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_mockup_id ON invoices(mockup_id)
  WHERE mockup_id IS NOT NULL;
