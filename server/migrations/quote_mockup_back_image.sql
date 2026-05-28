-- Quotes carry both front and back mockup previews so the admin (and the
-- price modal / customer accept page later) can see the full design the
-- way the customer drew it in Studio. The mockup row already has both
-- URLs (preview_image_url + preview_image_url_back); we just mirror the
-- back side onto the quote so renderers don't need to join the mockups
-- table.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS mockup_image_url_back text;
