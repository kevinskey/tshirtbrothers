CREATE TABLE IF NOT EXISTS embroidery_estimates (
  id SERIAL PRIMARY KEY,
  estimate_key UUID NOT NULL UNIQUE,
  name TEXT NOT NULL,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  data JSONB NOT NULL,
  source_key TEXT NOT NULL,
  preview_key TEXT NOT NULL,
  preview_url TEXT NOT NULL,
  mockup_id INTEGER REFERENCES mockups(id) ON DELETE SET NULL,
  actual_stitches INTEGER CHECK (actual_stitches > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS embroidery_estimates_quote_idx ON embroidery_estimates(quote_id);
