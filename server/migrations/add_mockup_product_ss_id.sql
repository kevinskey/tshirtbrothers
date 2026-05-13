-- Studio-created mockups don't always have a products.id FK (the studio
-- works with S&S style IDs). Store the ss_id so Edit-in-Studio can look
-- the product back up regardless of whether product_id was set.

ALTER TABLE mockups
  ADD COLUMN IF NOT EXISTS product_ss_id TEXT;
