-- Blank-garment purchase orders placed with S&S Activewear from the admin
-- Purchasing section. One row per PO we submit; S&S may split a PO into
-- multiple warehouse orders, so ss_orders is an array of
-- {orderNumber, warehouseAbbr, guid, expectedDeliveryDate, subtotal, shipping, tax, total}.
-- tracking is [{orderNumber, carrier, method, trackingNumbers: []}] filled in
-- by the refresh endpoint. Test orders (S&S validates then auto-cancels) are
-- recorded with is_test = true so the list can show them greyed out.

CREATE TABLE IF NOT EXISTS purchase_orders (
  id           SERIAL PRIMARY KEY,
  quote_id     INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  po_number    VARCHAR(100) NOT NULL,
  is_test      BOOLEAN NOT NULL DEFAULT FALSE,
  status       VARCHAR(50) NOT NULL DEFAULT 'submitted',
  ship_to      JSONB NOT NULL DEFAULT '{}'::jsonb,
  shipping_method VARCHAR(20) NOT NULL DEFAULT '1',
  lines        JSONB NOT NULL DEFAULT '[]'::jsonb,
  ss_orders    JSONB NOT NULL DEFAULT '[]'::jsonb,
  tracking     JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal     NUMERIC(10,2),
  shipping     NUMERIC(10,2),
  tax          NUMERIC(10,2),
  total        NUMERIC(10,2),
  expected_delivery DATE,
  notes        TEXT,
  placed_by    VARCHAR(255),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_quote ON purchase_orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
