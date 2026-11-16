-- "I need help with my graphic" on the customer artwork-upload page.
--
-- The upload page's only no-file path used to be a gray footnote telling the
-- customer to reply or call. A reply lands in the mailbox with nothing on the
-- quote, so a stalled job looked identical to one nobody had gotten to yet.
-- These columns make the ask a first-class state the admin UI can surface.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS artwork_help_requested_at TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS artwork_help_note TEXT;

-- Partial index: the admin "needs design help" lane reads only the flagged
-- rows, which stay a tiny fraction of the table.
CREATE INDEX IF NOT EXISTS idx_quotes_artwork_help
  ON quotes (artwork_help_requested_at DESC)
  WHERE artwork_help_requested_at IS NOT NULL;
