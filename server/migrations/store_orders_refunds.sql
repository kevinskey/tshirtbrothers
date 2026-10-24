-- Refund tracking on store orders.
--
-- store_orders.status already allowed 'refunded' and store_ledger.entry_type
-- already allowed 'refund' — the schema anticipated this from the start and
-- nothing ever implemented it. Until now a refund in the Stripe dashboard
-- left the order reading 'paid' and left the partner credited their full
-- share of money the buyer got back.
--
-- refunded_cents is CUMULATIVE, matching Stripe's charge.amount_refunded.
-- Stripe fires charge.refunded again on every additional partial refund,
-- each time carrying the running total rather than the delta, so storing the
-- cumulative figure is what lets the handler work out what is genuinely new
-- and stay idempotent across webhook retries.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE store_orders
  ADD COLUMN IF NOT EXISTS refunded_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_at    TIMESTAMPTZ;

-- The handler finds an order from a Stripe charge by way of its payment
-- intent, so this is looked up on every refund event.
CREATE INDEX IF NOT EXISTS store_orders_tsb_order_ref_idx
  ON store_orders (tsb_order_ref);

COMMIT;
