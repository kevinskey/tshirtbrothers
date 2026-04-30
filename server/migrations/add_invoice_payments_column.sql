-- Defensive: make sure invoices.payments exists. The manual
-- record-payment endpoint and the Stripe webhook both append to this
-- column. Older deployments already have it; this is here so a fresh
-- DB still works.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payments JSONB DEFAULT '[]'::jsonb;
