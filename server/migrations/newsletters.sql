-- Modular newsletter builder. Blocks live as a jsonb array (house pattern,
-- same as quotes.inputs_json / stores.brand_json) — each entry is
-- { id, type, enabled, data }. Sending goes through the existing
-- email_campaigns pipeline; sent_campaign_id links the two.
CREATE TABLE IF NOT EXISTS newsletters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  subject VARCHAR(255) NOT NULL DEFAULT '',
  preheader VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent')),
  is_template BOOLEAN NOT NULL DEFAULT false,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  sent_campaign_id INTEGER REFERENCES email_campaigns(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_newsletters_updated ON newsletters(is_template, updated_at DESC);
