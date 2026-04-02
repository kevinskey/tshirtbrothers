-- Migration: Add columns for quote email notification system
-- Run this on the production database (droplet)

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS accept_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS price_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS admin_message TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2);

-- Add product_name column if it doesn't exist (used in email templates)
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);

-- Add user_id column if it doesn't exist (links logged-in customer to quote)
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index on accept_token for fast lookups when customer clicks accept link
CREATE INDEX IF NOT EXISTS idx_quotes_accept_token ON quotes(accept_token) WHERE accept_token IS NOT NULL;
