-- Phase 1 post-launch hardening: record the transparent-background
-- attestation the customer checks at checkout (DtfStorePage.tsx's "My file
-- is a transparent-background PNG..." checkbox) so there's a durable record
-- to point to in a print-quality dispute.
ALTER TABLE gang_sheet_orders ADD COLUMN IF NOT EXISTS attested BOOLEAN NOT NULL DEFAULT FALSE;
