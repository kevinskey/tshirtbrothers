-- Sleeve previews for a quote's PRIMARY mockup.
--
-- quotes carried mockup_image_url and mockup_image_url_back only, so a sleeve
-- print was dropped the moment a mockup became the primary — including when
-- deleting the primary promoted an extra into its place. extra_mockups now
-- carries sleeve/sleeve_left per entry; these two columns give the primary the
-- same reach, so no attach path loses a print location.
--
-- The mockups table remains the lossless record (read via mockups.quote_id);
-- these are the denormalized copy the quote/invoice previews render from.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS mockup_image_url_sleeve TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS mockup_image_url_sleeve_left TEXT;
