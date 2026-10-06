-- More than one person is usually on the hook for a job: the buyer who
-- requested it, the AP contact who pays it, the manager who approves the
-- proof. customer_email stays the single primary (replies, Stripe receipts,
-- "who is this quote for"); cc_emails rides along on every customer-facing
-- send for that quote or invoice.
ALTER TABLE quotes   ADD COLUMN IF NOT EXISTS cc_emails JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cc_emails JSONB NOT NULL DEFAULT '[]'::jsonb;
