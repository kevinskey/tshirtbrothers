-- Add a deposit_percent column to invoices so the admin can split payment
-- into a 50% deposit + 50% balance (mirroring the quote flow). 0 = full pay,
-- 50 = send a 50% Stripe checkout first, then a balance checkout.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deposit_percent INTEGER NOT NULL DEFAULT 0;
