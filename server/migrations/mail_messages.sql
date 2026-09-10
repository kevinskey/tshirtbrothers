-- Unified mailbox for *@tshirtbrothers.com (Purelymail catch-all synced via
-- IMAP by server/services/mailbox.js). One row per message, inbound and
-- outbound. `alias` is the @tshirtbrothers.com address the mail was
-- addressed to (orders@, kevin@, ...) so the admin inbox can filter by it.
-- `attachments` is [{filename, contentType, size, url}] with files stored
-- in DO Spaces under mail/.

CREATE TABLE IF NOT EXISTS mail_messages (
  id            SERIAL PRIMARY KEY,
  folder        VARCHAR(100) NOT NULL DEFAULT 'INBOX',
  uid           BIGINT,
  message_id    TEXT UNIQUE,
  in_reply_to   TEXT,
  from_name     TEXT,
  from_addr     TEXT,
  to_addrs      JSONB NOT NULL DEFAULT '[]'::jsonb,
  cc_addrs      JSONB NOT NULL DEFAULT '[]'::jsonb,
  alias         TEXT,
  subject       TEXT,
  snippet       TEXT,
  body_text     TEXT,
  body_html     TEXT,
  attachments   JSONB NOT NULL DEFAULT '[]'::jsonb,
  msg_date      TIMESTAMPTZ,
  seen          BOOLEAN NOT NULL DEFAULT FALSE,
  outgoing      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_messages_date ON mail_messages(msg_date DESC);
CREATE INDEX IF NOT EXISTS idx_mail_messages_alias ON mail_messages(alias);
CREATE INDEX IF NOT EXISTS idx_mail_messages_from ON mail_messages(from_addr);
CREATE INDEX IF NOT EXISTS idx_mail_messages_seen ON mail_messages(seen) WHERE NOT seen;
