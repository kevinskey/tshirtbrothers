-- Quotes: store a flattened mockup image alongside the raw graphic.
-- design_url stays the production-facing artwork (what we print);
-- mockup_image_url is the rendered preview shown in the admin grid,
-- the customer email, and any quote/order UI. Splitting them stops
-- the "graphics look different on different pages" drift caused by
-- per-page CSS recomposites.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS mockup_image_url TEXT;
