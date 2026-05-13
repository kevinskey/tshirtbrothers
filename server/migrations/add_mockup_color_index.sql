-- Persist the color the admin selected in Design Studio when saving the
-- mockup. Without this, re-opening the mockup loses the color choice
-- (selectedColorIdx defaults to 0 = first color in the product's swatches).

ALTER TABLE mockups
  ADD COLUMN IF NOT EXISTS design_color_index INTEGER;
