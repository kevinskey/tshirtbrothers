-- Quick Bill: a walk-in paying by text link may give a phone number and no
-- email. The create route now requires name + (email OR phone); the column
-- must allow NULL for that path. Every send-by-email path already checks
-- customer_email before using it.
ALTER TABLE invoices ALTER COLUMN customer_email DROP NOT NULL;
