-- Make quotes.accept_token always present.
--
-- It was minted lazily -- routes/quotes.js:785 when a quote is priced and
-- sent, and :955 when artwork is requested -- so quotes that were never
-- priced have none. Two link builders paper over that with
-- `token=${quote.accept_token || ''}` (services/email.js payBalanceUrl and
-- client AccountPage.tsx), which emits an EMPTY token in the URL.
--
-- That matters because the three Stripe session routes in routes/payments.js
-- guarded with `if (token && quote.accept_token && !tokenMatches(...))` --
-- so omitting the token skipped the check entirely, and any quoteId returned
-- a checkout session prefilled with another customer's email and line items.
-- Making the token mandatory is only safe once every quote has one.
--
-- Backfill touches NULLs only, so no token already sitting in a customer's
-- inbox changes. Two md5s give 64 hex chars (the column width) without
-- pgcrypto, which is not installed here.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS accept_token VARCHAR(64);

ALTER TABLE quotes
  ALTER COLUMN accept_token
  SET DEFAULT md5(random()::text || clock_timestamp()::text)
           || md5(random()::text || clock_timestamp()::text);

UPDATE quotes
   SET accept_token = md5(random()::text || clock_timestamp()::text || id::text)
                   || md5(random()::text || clock_timestamp()::text || id::text)
 WHERE accept_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_accept_token_present
  ON quotes(accept_token) WHERE accept_token IS NOT NULL;
