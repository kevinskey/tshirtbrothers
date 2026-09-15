-- Non-responsive quote archive (2026-09-15).
-- Quotes expire two weeks after the customer goes quiet: unaccepted quotes
-- (pending/quoted) 14 days after creation, accepted-but-never-paid quotes
-- 14 days after acceptance. The scheduler stamps them archived and records
-- the customer in non_buying_customers for marketing / geo analysis.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_quotes_archived_at
  ON quotes (archived_at) WHERE archived_at IS NOT NULL;

-- One row per email address that quoted but never bought. Geo columns come
-- from the quote's shipping_address jsonb when present; most quotes have no
-- address, so they're nullable and the analytics endpoints skip nulls.
CREATE TABLE IF NOT EXISTS non_buying_customers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  phone VARCHAR(50),
  city TEXT,
  state TEXT,
  zip TEXT,
  quote_count INTEGER NOT NULL DEFAULT 1,
  total_quoted_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  first_quote_at TIMESTAMPTZ,
  last_quote_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'quote-nonresponsive',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The API connects as tsbadmin — a table without these grants is invisible
-- to the app (see the 2026-09-15 newsletter_subscribers incident).
GRANT SELECT, INSERT, UPDATE, DELETE ON non_buying_customers TO tsbadmin;
GRANT USAGE, SELECT ON SEQUENCE non_buying_customers_id_seq TO tsbadmin;

-- 2026-09-15 (later same day): invoices are archivable from the pipeline too.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;
