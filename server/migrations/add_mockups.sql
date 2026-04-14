-- Admin mockups: staff creates a preview of a customer graphic placed on a
-- product, sends it to the customer for approval, optionally converts it to
-- a quote. Auto-applied on server boot.

CREATE TABLE IF NOT EXISTS mockups (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(255),
  customer_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_email    VARCHAR(255),
  customer_name     VARCHAR(255),
  quote_id          INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  product_id        INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name      VARCHAR(500),
  product_image_url TEXT,
  graphic_url       TEXT,
  -- placement on the product image, in percent of product-image dims
  placement         JSONB DEFAULT '{"x": 35, "y": 30, "width": 30, "rotation": 0}',
  preview_image_url TEXT,             -- optional rendered composite
  notes             TEXT,
  status            VARCHAR(50) NOT NULL DEFAULT 'draft',
    -- draft | sent | approved | rejected | converted_to_quote
  approve_token     VARCHAR(64) UNIQUE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mockups_status ON mockups(status);
CREATE INDEX IF NOT EXISTS idx_mockups_customer_id ON mockups(customer_id)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mockups_approve_token ON mockups(approve_token)
  WHERE approve_token IS NOT NULL;
