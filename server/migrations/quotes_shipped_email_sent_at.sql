-- Dedupe column for the "your order shipped" email on quotes.
--
-- store_orders already has shipped_email_sent_at; quotes never did, so the
-- only thing stopping a customer getting the tracking email twice was that
-- exactly one code path sent it. Now that buying a label notifies
-- automatically (EasyPost /buy, the Post Office queue, and the fulfill
-- endpoint all land on the same service), quotes need the same guard.
--
-- Backfill: any quote already marked shipped is treated as already
-- notified. Without this, the first label bought for an old order would
-- email a customer about a package that left weeks ago.
--
-- Safe to re-run.

BEGIN;

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS shipped_email_sent_at TIMESTAMPTZ;

UPDATE quotes
   SET shipped_email_sent_at = COALESCE(shipped_at, NOW())
 WHERE shipped_email_sent_at IS NULL
   AND shipped_at IS NOT NULL;

-- Same guard for store orders that already finished their journey.
--
-- As of this migration 8 of 9 store orders carry a tracking number and only
-- 2 were ever emailed about it — the gap this whole change closes. All 8 are
-- already DELIVERED, so the fix is not to email them: a tracking notice for
-- a parcel that arrived weeks ago reads like a system glitch, or worse like
-- a second shipment. Stamping them suppresses a stale notice if one of those
-- orders ever has its status touched again.
--
-- Deliberately NOT applied to orders still in flight: if something is out
-- for delivery and the buyer was never told, they SHOULD hear from us the
-- next time anything moves.
UPDATE store_orders
   SET shipped_email_sent_at = COALESCE(shipped_at, updated_at, NOW())
 WHERE shipped_email_sent_at IS NULL
   AND tracking_number IS NOT NULL
   AND status = 'delivered';

COMMIT;
