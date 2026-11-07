-- SMS consent and opt-out.
--
-- server/routes/sms.js had NO STOP/HELP handling and there was no consent
-- column anywhere. Transactional texts (mockup ready, shipped, balance due)
-- ride the business relationship and are defensible. The review request, the
-- day-3 quote follow-up, and anything like a reorder nudge are MARKETING --
-- that is live 10DLC/TCPA exposure, and "reply STOP" printed in a message
-- body means nothing if nothing on the server honours it.
--
-- Keyed on the phone number rather than on a customer row: the same number
-- can appear on a dozen quotes with no account behind any of them, and an
-- opt-out has to hold across all of them. Last 10 digits, matching the
-- attribution query in the inbound webhook.

CREATE TABLE IF NOT EXISTS sms_consent (
  phone_digits   VARCHAR(10) PRIMARY KEY,
  phone          TEXT NOT NULL,
  consent_at     TIMESTAMPTZ,
  -- Where the consent came from: 'quote_form', 'checkout', 'verbal', ...
  consent_source TEXT,
  -- Verbatim text of the checkbox they agreed to. "We had a checkbox" is not
  -- a defense without the wording and the timestamp.
  consent_text   TEXT,
  opt_out_at     TIMESTAMPTZ,
  -- The message that triggered the opt-out, for the audit trail.
  opt_out_source TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_consent_opted_out
  ON sms_consent (phone_digits) WHERE opt_out_at IS NOT NULL;

-- Email already has a suppression list (email_unsubscribes, honoured by the
-- campaign builder). This mirrors it for the lifecycle sends that do not go
-- through that path.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sms_consent_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS sms_consent_source TEXT;
