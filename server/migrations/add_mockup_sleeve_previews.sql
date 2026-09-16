-- Sleeve previews on mockups (2026-09-16): the studio captures R/L
-- sleeve views so the mockup card scroller can show them.
ALTER TABLE mockups
  ADD COLUMN IF NOT EXISTS preview_image_url_sleeve TEXT,
  ADD COLUMN IF NOT EXISTS preview_image_url_sleeve_left TEXT;
