-- Second and third touches on a quote that went quiet.
--
-- The leak this closes: runAbandonedQuoteFollowUps chased only
-- `status = 'pending'`, but archiveNonResponsiveQuotes archives
-- `status IN ('pending','quoted')`. So a quote that was priced and SENT --
-- the highest-intent lead in the pipeline, someone who asked and got a real
-- number -- was never nudged once, then disappeared into
-- non_buying_customers on day 7 without a word.
--
-- One stamp per touch rather than a counter, so a send that half-failed
-- can't silently re-fire, and so the ladder is legible in the admin UI.
--
-- The window stays at QUOTE_EXPIRY_DAYS = 7 on purpose: that was lowered
-- from 14 deliberately (scheduler.js, Doc 2026-10-30), so the ladder fits
-- inside it rather than reopening that decision.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_2_sent_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_3_sent_at TIMESTAMPTZ;

-- Sent when a quote is archived, so the last thing the customer hears is
-- "your art is on file" rather than silence.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS closing_note_sent_at TIMESTAMPTZ;

-- Customer-facing acknowledgement of a new quote request. Previously
-- POST /api/quotes notified only the shop, so the person who just filled in
-- the form heard nothing until a human priced it.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS request_ack_sent_at TIMESTAMPTZ;

-- Carrier says it landed. refreshTracking already detects delivery every 20
-- minutes and did nothing with it -- the highest-open moment in the journey,
-- free.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS delivered_notified_at TIMESTAMPTZ;

-- Every follow-up query filters on these, and the cron runs hourly.
CREATE INDEX IF NOT EXISTS idx_quotes_followup_due
  ON quotes (status, created_at)
  WHERE archived_at IS NULL AND accepted_at IS NULL;
