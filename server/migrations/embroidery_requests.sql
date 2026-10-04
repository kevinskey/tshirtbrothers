-- Customer-facing embroidery quote requests.
--
-- Apply on the droplet:
--   psql -d tshirtbrothers -f /var/www/tshirtbrothers/server/migrations/embroidery_requests.sql
--
-- Distinct from embroidery_jobs on purpose: embroidery_jobs is the ADMIN
-- digitizing tracker (DST files, vectorizing, digitizer notes). This table is
-- the CUSTOMER's request and its money/quote lifecycle. A paid request spawns
-- a linked embroidery_jobs row so the shop keeps working in the tool it has.
--
-- The flow this encodes (Kevin, 2026-10-03):
--   1. Customer uploads artwork, gives desired size + placement, and either
--      picks a garment from us or says they'll supply their own.
--   2. We cannot quote until the design is digitized, and digitization is a
--      $25 fee — so the request sits awaiting_payment until Stripe confirms.
--   3. After payment we digitize, learn the stitch count, and reply with the
--      quote: stitch_count x rate + garment price.

CREATE TABLE IF NOT EXISTS embroidery_requests (
  id              SERIAL PRIMARY KEY,
  -- Contact. No account required — embroidery walk-ins are mostly new names.
  customer_name   TEXT NOT NULL,
  customer_email  TEXT NOT NULL,
  customer_phone  TEXT,

  -- What they want stitched.
  artwork_url     TEXT NOT NULL,
  desired_size    TEXT NOT NULL,          -- freeform: '4 inches wide', 'left chest ~3.5"'
  placement       TEXT NOT NULL,          -- left_chest | right_chest | full_back | hat_front | sleeve | other
  placement_note  TEXT,                   -- required context when placement = other

  -- Garment: ours or theirs. garment_choice is freeform text of what they
  -- want from us ('Gildan 18500 hoodie, navy, L') — embroidery garments are
  -- too varied to force through the screen-print pricing table.
  garment_mode    TEXT NOT NULL CHECK (garment_mode IN ('tsb', 'own')),
  garment_choice  TEXT,

  notes           TEXT,

  -- Lifecycle. awaiting_payment -> paid -> quoted (-> closed/declined).
  status          TEXT NOT NULL DEFAULT 'awaiting_payment',
  stripe_session_id       TEXT,
  digitization_paid_at    TIMESTAMPTZ,

  -- How many pieces. Asked on the form; embroidery pricing is quantity-
  -- tiered (Lighthouse sheet), so a quote without a quantity is meaningless.
  quantity        INTEGER NOT NULL DEFAULT 1,

  -- The quote, filled by the admin after digitizing. price_breakdown is the
  -- engine's line array verbatim (label/cost/retail per line) so the email,
  -- the admin view and any later dispute all read the same arithmetic.
  stitch_count    INTEGER,
  garment_cents   INTEGER,                -- retail garment total; 0 when garment_mode = 'own'
  rush            TEXT NOT NULL DEFAULT 'standard',
  cost_cents      INTEGER,                -- our vendor cost, for margin visibility
  price_breakdown JSONB,
  quote_cents     INTEGER,
  quoted_at       TIMESTAMPTZ,

  -- Link into the admin digitizing tracker, created on payment.
  embroidery_job_id INTEGER REFERENCES embroidery_jobs(id) ON DELETE SET NULL,

  -- Capability token for the customer's status link (no login).
  access_token    TEXT NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embroidery_requests_status
  ON embroidery_requests (status);
CREATE INDEX IF NOT EXISTS idx_embroidery_requests_email
  ON embroidery_requests (customer_email);
