-- The Post Office: one record per label TSB buys, whatever it is for.
--
-- Before this, shipping lived in two half-places — a tracking_number
-- column on quotes and another on store_orders — with no record of the
-- label itself, what it cost, or whether it was ever refunded. A shop
-- that mails things needs a ledger of its postage.
CREATE TABLE IF NOT EXISTS shipments (
  id                   SERIAL PRIMARY KEY,
  -- What is being mailed. 'manual' is a one-off label with no order
  -- behind it (a sample, a replacement, a vendor return).
  subject_type         TEXT NOT NULL CHECK (subject_type IN ('quote', 'store_order', 'invoice', 'manual')),
  subject_id           INTEGER,
  easypost_shipment_id TEXT UNIQUE,
  tracking_code        TEXT,
  carrier              TEXT,
  service              TEXT,
  rate_cents           INTEGER,
  insurance_cents      INTEGER NOT NULL DEFAULT 0,
  label_url            TEXT,
  tracker_id           TEXT,
  tracking_status      TEXT,
  tracking_detail      TEXT,
  est_delivery_date    TIMESTAMPTZ,
  delivered_at         TIMESTAMPTZ,
  scan_form_id         TEXT,
  scan_form_url        TEXT,
  to_name              TEXT,
  to_address           JSONB,
  weight_oz            NUMERIC(10,2),
  -- purchased → refund_requested → refunded. A refused refund stays
  -- 'purchased' so the label is still printable.
  status               TEXT NOT NULL DEFAULT 'purchased',
  refund_status        TEXT,
  created_by           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_subject  ON shipments(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking ON shipments(tracking_code);
CREATE INDEX IF NOT EXISTS idx_shipments_open     ON shipments(status, tracking_status);

-- Carrier pickups scheduled from the Post Office.
CREATE TABLE IF NOT EXISTS shipment_pickups (
  id                 SERIAL PRIMARY KEY,
  easypost_pickup_id TEXT UNIQUE,
  carrier            TEXT,
  service            TEXT,
  rate_cents         INTEGER,
  min_datetime       TIMESTAMPTZ,
  max_datetime       TIMESTAMPTZ,
  status             TEXT,
  confirmation       TEXT,
  shipment_ids       INTEGER[] NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
