-- Draft S&S blanks orders (2026-09-15): save an in-progress purchasing
-- builder (lines, ship-to, options) to come back to later. payload is the
-- client-side builder state verbatim.

CREATE TABLE IF NOT EXISTS purchasing_drafts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The API connects as tsbadmin — grants required or the table is invisible.
GRANT SELECT, INSERT, UPDATE, DELETE ON purchasing_drafts TO tsbadmin;
GRANT USAGE, SELECT ON SEQUENCE purchasing_drafts_id_seq TO tsbadmin;
