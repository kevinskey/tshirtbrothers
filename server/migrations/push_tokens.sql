-- Device tokens for the iOS app's push notifications. One row per device;
-- a token moving between accounts (shared iPad, re-login) re-points user_id.
CREATE TABLE IF NOT EXISTS push_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL DEFAULT 'ios',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

GRANT ALL ON push_tokens TO tsbadmin;
GRANT USAGE, SELECT ON SEQUENCE push_tokens_id_seq TO tsbadmin;
