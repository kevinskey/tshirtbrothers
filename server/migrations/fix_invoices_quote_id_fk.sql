-- Allow deleting a quote without cascading into invoices.
-- The original FK rejected the delete (default NO ACTION), so admins couldn't
-- delete quotes that had ever been invoiced. Switch to ON DELETE SET NULL:
-- the invoice survives (it's the financial record of truth) but no longer
-- points at a deleted quote.

ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_quote_id_fkey;

ALTER TABLE invoices
  ADD CONSTRAINT invoices_quote_id_fkey
  FOREIGN KEY (quote_id)
  REFERENCES quotes(id)
  ON DELETE SET NULL;
