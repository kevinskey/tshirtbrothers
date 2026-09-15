-- Running notes log on customers (2026-09-15) — shown on the admin
-- customer page (/admin/customers/:id) alongside purchase history.

CREATE TABLE IF NOT EXISTS customer_notes (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_customer
  ON customer_notes (customer_id, created_at DESC);

-- The API connects as tsbadmin — grants required or the table is invisible.
GRANT SELECT, INSERT, UPDATE, DELETE ON customer_notes TO tsbadmin;
GRANT USAGE, SELECT ON SEQUENCE customer_notes_id_seq TO tsbadmin;
