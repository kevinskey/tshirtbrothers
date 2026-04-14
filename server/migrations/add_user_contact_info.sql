-- Migration: add contact/address columns to users table
--
-- The customer UI (admin + account pages) already accepts phone and a
-- mailing address, and the bulk CSV import writes phone — but those
-- columns didn't exist on users, so the values were silently dropped.
--
-- Run once on the droplet:
--   psql -d tshirtbrothers -f /var/www/tshirtbrothers/server/migrations/add_user_contact_info.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS address_street VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_city   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_state  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS address_zip    VARCHAR(20);
