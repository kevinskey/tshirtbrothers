-- Mockups generated from Design Studio for invoices can include a back side
-- composite as well. Keep the existing preview_image_url as the front view;
-- preview_image_url_back is optional and only populated for studio-generated
-- mockups that have back-side elements.

ALTER TABLE mockups
  ADD COLUMN IF NOT EXISTS preview_image_url_back TEXT;
