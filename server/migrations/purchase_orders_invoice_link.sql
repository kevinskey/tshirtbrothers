-- Purchase orders can be started from an invoice as well as a quote.
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_invoice ON purchase_orders(invoice_id);
