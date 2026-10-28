-- Stripe Connect: let a store be paid directly instead of by monthly ACH.
--
-- Today every sister brand charges on TSB's account and partners are paid
-- afterwards through store_ledger → store_payouts → storePayoutJob.js. With
-- a connected account, Stripe moves the partner's share at charge time and
-- TSB keeps the rest as an application fee.
--
-- DESTINATION charges, not direct ones. TSB stays merchant of record, which
-- matters because TSB prints and ships every order: if the partner were
-- merchant of record, the person who owes the customer a shirt would not be
-- the person who took the money. Chargebacks, refund liability and sales-tax
-- nexus stay where the fulfilment is.
--
-- Everything here is INERT until a store has both an account id and
-- charges/payouts enabled on it. No existing store has one, so this changes
-- nothing about current checkouts.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE stores
  -- acct_… on TSB's platform. NULL means "pay this store the old way".
  ADD COLUMN IF NOT EXISTS stripe_account_id      VARCHAR(64),
  -- Mirrored from the account.updated webhook so the UI can tell an owner
  -- whether they are actually payable without calling Stripe on every render.
  -- Stripe is the source of truth; these are a cache of its last word.
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_account_updated_at TIMESTAMPTZ;

-- One account per store, and one store per account. Two stores sharing an
-- account would send one partner's money to another.
CREATE UNIQUE INDEX IF NOT EXISTS stores_stripe_account_uniq
  ON stores (stripe_account_id) WHERE stripe_account_id IS NOT NULL;

-- The account.updated webhook arrives knowing only the account id.
CREATE INDEX IF NOT EXISTS stores_stripe_account_lookup
  ON stores (stripe_account_id);

-- Which orders were paid straight to the partner. Without this the capture
-- would credit store_ledger as usual AND Stripe would have already paid
-- them — the partner gets their share twice and the payout job hands over
-- money TSB never held.
ALTER TABLE store_orders
  ADD COLUMN IF NOT EXISTS stripe_transfer_cents INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_destination    VARCHAR(64);

COMMENT ON COLUMN store_orders.stripe_transfer_cents IS
  'Amount Stripe moved directly to the store''s connected account at charge '
  'time. NOT NULL means the partner has already been paid and store_ledger '
  'must NOT also credit them.';

COMMIT;
