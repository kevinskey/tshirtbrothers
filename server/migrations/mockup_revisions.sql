-- Re-approval support: a mockup that was already decided on and then
-- revised has to go back out as a NEW revision, not a silent re-send of
-- the same proof. revision is 0 for the original and increments on every
-- send that follows a customer decision.
ALTER TABLE mockups ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;

-- When the shop revises an already-approved mockup the quote's approval
-- stamp has to be cleared, so keep a record of how many times a quote has
-- been round-tripped for approval. Reporting reads this; the pipeline
-- reads mockup_sent_at / mockup_approved_at as before.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS mockup_revision INTEGER NOT NULL DEFAULT 0;
