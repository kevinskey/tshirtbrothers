-- Phase 1 of the customer-facing DTF gang sheet store.
-- Spec: docs/superpowers/specs/2026-08-15-dtf-gang-sheet-store-design.md

CREATE TABLE IF NOT EXISTS gang_sheet_store_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rate_standard_cents INT NOT NULL DEFAULT 900,
  rate_rush_cents INT NOT NULL DEFAULT 1100,
  rate_hot_rush_cents INT NOT NULL DEFAULT 1500,
  cutoff_rush TIME NOT NULL DEFAULT '11:00',
  cutoff_hot_rush TIME NOT NULL DEFAULT '13:30',
  min_ft INT NOT NULL DEFAULT 1,
  max_ft INT NOT NULL DEFAULT 20,
  shipping_flat_cents INT NOT NULL DEFAULT 699,
  standard_active BOOLEAN NOT NULL DEFAULT TRUE,
  rush_active BOOLEAN NOT NULL DEFAULT TRUE,
  hot_rush_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO gang_sheet_store_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS gang_sheet_orders (
  id SERIAL PRIMARY KEY,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  length_ft INT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('standard','rush','hot_rush')),
  price_cents INT NOT NULL,
  shipping_cents INT NOT NULL DEFAULT 0,
  delivery TEXT NOT NULL DEFAULT 'pickup' CHECK (delivery IN ('pickup','ship')),
  ship_address JSONB,
  file_key TEXT NOT NULL,
  file_width_px INT,
  file_height_px INT,
  source TEXT NOT NULL DEFAULT 'upload',
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status IN ('pending_payment','paid','in_production','ready','completed','canceled')),
  stripe_session_id TEXT,
  paid_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gang_sheet_orders_status_idx ON gang_sheet_orders (status, created_at);
