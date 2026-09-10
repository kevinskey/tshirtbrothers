-- Free-form admin notes on an order (keyed by quote), shown as a timeline
-- on the admin Order Detail page alongside statuses, payments, and emails.
CREATE TABLE IF NOT EXISTS order_notes (
  id         SERIAL PRIMARY KEY,
  quote_id   INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  author     VARCHAR(255),
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_notes_quote ON order_notes(quote_id, created_at);

-- Manual production-stage checkoffs for the Order Detail timeline
-- ({stageKey: iso-timestamp}). Stages with data signals (payments, POs,
-- vendor sends) are derived; these cover the shop-floor ones: gang sheet
-- picked up, pressed, customer contacted for pickup.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS order_stages JSONB NOT NULL DEFAULT '{}'::jsonb;
