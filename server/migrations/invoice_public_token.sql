-- Capability token for the customer-facing invoice view.
--
-- GET /api/invoices/public/:id, GET /api/invoices/:id/pdf and
-- POST /api/invoices/public/:id/create-checkout were all reachable with
-- nothing but a sequential integer id, and the first two return the
-- customer's name, email, phone, street address, line items and balance.
-- Incrementing the id walked the whole invoice book.
--
-- Mirrors quotes.accept_token (add_quote_email_columns.sql): bare hex,
-- compared with lib/acceptToken.js tokenMatches().

-- The DEFAULT matters: invoices are INSERTed from five places
-- (routes/invoices.js, routes/payments.js x2, routes/orderDetail.js,
-- services/mailToInvoice.js). Generating the token in the column default
-- means no current or future path can create an untokened invoice, which a
-- helper called at each site would eventually fail to do.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS public_token VARCHAR(64)
  DEFAULT md5(random()::text || clock_timestamp()::text)
       || md5(random()::text || clock_timestamp()::text);

-- Backfill every existing invoice. Two md5s give 64 hex chars without
-- requiring pgcrypto, which is not installed on this database. clock_timestamp()
-- (not now()) so rows in the same transaction don't share a seed.
UPDATE invoices
   SET public_token = md5(random()::text || clock_timestamp()::text || id::text)
                   || md5(random()::text || clock_timestamp()::text || id::text)
 WHERE public_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_public_token
  ON invoices(public_token) WHERE public_token IS NOT NULL;
