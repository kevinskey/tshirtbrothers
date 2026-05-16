-- Size upcharges for the Instant Quote calculator. Stored as a JSON object
-- on the existing settings row so we don't need a separate table for a
-- handful of values. Sizes not listed default to $0 upcharge.

ALTER TABLE instant_quote_settings
  ADD COLUMN IF NOT EXISTS size_upcharges JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE instant_quote_settings
   SET size_upcharges = '{"2XL": 2, "3XL": 4, "4XL": 6, "5XL": 8, "6XL": 10, "7XL": 10}'::jsonb
 WHERE id = 1;
