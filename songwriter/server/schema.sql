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

-- Version history: snapshots of a song before each meaningful update so the
-- user can roll back if an AI rewrite (or a wrong typo) destroys good work.
CREATE TABLE IF NOT EXISTS song_versions (
  id              SERIAL PRIMARY KEY,
  song_id         INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  snapshot        JSONB NOT NULL,  -- { title, sections, notes, tempo_bpm, key_signature }
  reason          TEXT,            -- optional label: 'autosave', 'ai_rewrite', etc.
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_song_versions_song_id ON song_versions(song_id, created_at DESC);

-- AI usage log (for cost tracking + rate insight)
CREATE TABLE IF NOT EXISTS ai_logs (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  feature         TEXT NOT NULL,     -- 'rhymes' | 'next-line' | 'rewrite'
  input_preview   TEXT,
  output_preview  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Journal: free-form chronological musings. Archived entries available to
-- the AI assistant for inspiration and recall.
CREATE TABLE IF NOT EXISTS journal_entries (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  mood            TEXT,
  tags            TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_user_id ON journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_created_at ON journal_entries(user_id, created_at DESC);

-- Negro spirituals collection. Public-domain lyrics + title + optional notes.
-- Single shared collection populated by admin uploads (one user = admin for now).
CREATE TABLE IF NOT EXISTS spirituals (
  id              SERIAL PRIMARY KEY,
  number          INTEGER,                    -- optional order in the source collection
  title           TEXT NOT NULL,
  lyrics          TEXT NOT NULL,              -- full text with stanza breaks as \n\n
  notes           TEXT DEFAULT '',
  source          TEXT DEFAULT '',            -- book/compiler if known
  source_file     TEXT DEFAULT '',            -- path to original PDF on disk, if any
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spirituals_title ON spirituals(LOWER(title));
CREATE INDEX IF NOT EXISTS idx_spirituals_number ON spirituals(number);
