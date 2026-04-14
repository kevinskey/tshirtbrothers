-- Migration: add balance_paid_at column
--
-- The balance-payment flow (admin clicks "Request Balance Payment",
-- customer pays via Stripe) writes UPDATE quotes SET balance_paid_at = NOW()
-- in both the webhook handler and the /payment/success route. Without this
-- column those UPDATEs fail with 'column does not exist', so the customer's
-- payment succeeds at Stripe but the quote is never marked paid.
--
-- Run once on the droplet:
--   psql -d tshirtbrothers -f /var/www/tshirtbrothers/server/migrations/add_balance_paid_at.sql

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS balance_paid_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_quotes_balance_paid_at
  ON quotes(balance_paid_at)
  WHERE balance_paid_at IS NOT NULL;
