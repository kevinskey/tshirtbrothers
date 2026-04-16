-- Songwriter schema
-- Run: psql $DATABASE_URL -f schema.sql

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  google_id       TEXT UNIQUE NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_login_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS songs (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT 'Untitled',
  -- sections is an array of { id, type: 'verse'|'chorus'|'bridge'|'pre-chorus'|'outro'|'intro', label, lines: string[] }
  sections        JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes           TEXT DEFAULT '',
  tempo_bpm       INTEGER,
  key_signature   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_songs_user_id ON songs(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_updated_at ON songs(updated_at DESC);

-- AI usage log (for cost tracking + rate insight)
CREATE TABLE IF NOT EXISTS ai_logs (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  feature         TEXT NOT NULL,     -- 'rhymes' | 'next-line' | 'rewrite'
  input_preview   TEXT,
  output_preview  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
