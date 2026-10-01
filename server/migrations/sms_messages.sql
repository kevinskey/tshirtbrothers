-- Two-way SMS log. Outbound rows are written when an admin texts a
-- customer from the Quotes screen; inbound rows are written by the Twilio
-- webhook when the customer texts back. Threads are keyed by phone number
-- (E.164) because a reply carries no quote id — quote_id is best-effort
-- attribution so the thread can surface inside the right job.
CREATE TABLE IF NOT EXISTS sms_messages (
  id            SERIAL PRIMARY KEY,
  direction     TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  phone         TEXT NOT NULL,              -- the CUSTOMER's number, E.164
  body          TEXT NOT NULL DEFAULT '',
  quote_id      INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  customer_name TEXT,
  twilio_sid    TEXT,
  num_media     INTEGER NOT NULL DEFAULT 0,
  media         JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Inbound only: NULL until an admin opens the thread.
  read_at       TIMESTAMPTZ,
  sent_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_phone   ON sms_messages(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_quote   ON sms_messages(quote_id);
CREATE INDEX IF NOT EXISTS idx_sms_messages_unread  ON sms_messages(read_at) WHERE direction = 'in' AND read_at IS NULL;
