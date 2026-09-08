-- Theme tokens + originating library template for the newsletter builder.
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS theme JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE newsletters ADD COLUMN IF NOT EXISTS template_slug VARCHAR(60);
