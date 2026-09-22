-- Varsity jackets: two blank catalog products (non-S&S) + jacket decoration
-- methods for the instant-quote engine. Idempotent; safe to re-run.
-- base_price = supplier cost; custom_price = cost x 1.70 (Doc's 70% markup).

ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_visible BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price DECIMAL(10,2);

INSERT INTO products (ss_id, name, brand, category, style_number, base_price, custom_price, retail_price, colors, sizes, image_url, back_image_url, specifications, price_breaks, is_featured)
SELECT 'tt:varsity-premium', 'Premium Varsity Jacket - Polyester Body / PU Sleeves', 'T-Shirt Brothers', 'Outerwear', 'TSB-VJ100',
  68.00, 115.60, 115.60,
  '[{"name": "Black Yellow Body + Red Green Sleeves", "hex": "#1a1a1a", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Multicolor-Jacket-Red-Yellow-Black.jpg"}, {"name": "Black Body / Grey Sleeve", "hex": "#1a1a1a", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Black-Grey-Winter-Jacket.jpg"}, {"name": "Navy Blue Body / Yellow Sleeve", "hex": "#1f2a44", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Navy-Blue-Yellow-Winter-Jacket1.jpg"}, {"name": "Pink Body / White Sleeve", "hex": "#ef7ba8", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Pink-White-Winter-Jacket.jpg"}, {"name": "Purple Body / Yellow Sleeve", "hex": "#5b2a86", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Purple-Front_23dadadb-2249-4084-8880-5d34afcb68b4.png"}, {"name": "Brown Body / Tan Sleeve", "hex": "#5c4033", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Brown-Front.png"}, {"name": "Green Body / Black Sleeve", "hex": "#1f6b3a", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Jacket-Black-Sleeves-Green-Body-Front.png"}, {"name": "Red Body / Black Sleeve", "hex": "#c8102e", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/61XktQAmtYL._AC_SX569.jpg"}, {"name": "Black Body / Orange Sleeve", "hex": "#1a1a1a", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Jacket-Orange-Sleeves-Black-Body-Front.png"}, {"name": "Black Body / Yellow Sleeve", "hex": "#1a1a1a", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Yellow-Black-Winter-Jacket.jpg"}, {"name": "Black Body / Black Sleeve", "hex": "#1a1a1a", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Black-Black-Winter-Jacket_ff3ff5c6-0976-4656-8df6-4f07affa0dea.jpg"}, {"name": "Black Body / Red Sleeve", "hex": "#1a1a1a", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Red-Black-Winter-Jacket.jpg"}, {"name": "Red Body / White Sleeve", "hex": "#c8102e", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Red-White-Winter-Jacket_01d57b81-0d3a-4045-8b8a-fbf6e4dfb612.jpg"}, {"name": "Green Body / White Sleeve", "hex": "#1f6b3a", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Green-White-Winter-Jacket_8f79f817-703f-4688-9ba6-554dfe67fe65.jpg"}, {"name": "Black Body / White Sleeve", "hex": "#1a1a1a", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Black-White-Winter-Jacket_75f36f30-14dd-44d8-a97c-09a7d4ad2103.jpg"}, {"name": "Navy Blue Body / White Sleeve", "hex": "#1f2a44", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Navy-Blaue-White-Winter-Jacket_9da8639a-4755-40c3-b84d-6b1cf7a03b4d.jpg"}, {"name": "Royal Blue Body / White Sleeve", "hex": "#1e4fbd", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Royal-Blaue-White-Winter-Jacket_06805784-be54-4b23-9104-846d3fd77be2.jpg"}]'::jsonb,
  '["XS","S","M","L","XL","2XL","3XL"]'::jsonb,
  'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Black-White-Winter-Jacket_75f36f30-14dd-44d8-a97c-09a7d4ad2103.jpg', 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/Varsity-Premium-Quality-Black-White-Winter-Jacket2.jpg',
  '{"description": "<p>Classic heavyweight varsity jacket: premium polyester body with premium-quality PU sleeves, silicone buttons, striped rib-knit collar, cuffs and hem. Two outside pockets plus one inside pocket. True to size, XS&ndash;3XL (some colorways S&ndash;XL).</p><p><strong>Decoration options:</strong> embroidery, tackle twill lettering, and sew-on chenille or embroidered patches. Use the quote tool to price your decoration.</p>", "material": "Polyester body, PU sleeves, silicone buttons", "weight": "Heavyweight"}'::jsonb,
  '[]'::jsonb, TRUE
WHERE NOT EXISTS (SELECT 1 FROM products WHERE ss_id = 'tt:varsity-premium');

INSERT INTO products (ss_id, name, brand, category, style_number, base_price, custom_price, retail_price, colors, sizes, image_url, back_image_url, specifications, price_breaks, is_featured)
SELECT 'tt:varsity-bomber', 'Lightweight Varsity Bomber Jacket', 'T-Shirt Brothers', 'Outerwear', 'TSB-VJ200',
  39.99, 67.98, 67.98,
  '[{"name": "Black", "hex": "#1a1a1a", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/TackleTwill-Baseball-Varsity-Light-Jacket-Black-01.jpg"}, {"name": "Royal Blue", "hex": "#1e4fbd", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/TackleTwill-Baseball-Varsity-Light-Jacket-Royal-Blue-01.jpg"}, {"name": "Red", "hex": "#c8102e", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/TackleTwill-Baseball-Varsity-Light-Jacket-Red-01.jpg"}, {"name": "Navy Blue", "hex": "#1f2a44", "image": "https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/TackleTwill-Baseball-Varsity-Light-Jacket-Navy-Blue-01.jpg"}]'::jsonb,
  '["S","M","L","XL","2XL"]'::jsonb,
  'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/TackleTwill-Baseball-Varsity-Light-Jacket-Black-01.jpg', 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/products/varsity/TackleTwill-Baseball-Varsity-Light-Jacket-Black-06.jpg',
  '{"description": "<p>Lightweight varsity-inspired bomber: premium polyester shell with striped rib-knit collar, cuffs and hem. An everyday layer for teams, clubs and staff. Unisex, S&ndash;2XL.</p><p><strong>Decoration options:</strong> embroidery, tackle twill lettering, and sew-on patches. Use the quote tool to price your decoration.</p>", "material": "100% lightweight polyester shell", "weight": "Lightweight"}'::jsonb,
  '[]'::jsonb, TRUE
WHERE NOT EXISTS (SELECT 1 FROM products WHERE ss_id = 'tt:varsity-bomber');

-- Jacket decoration methods (visible in /instant-quote and admin pricing).
-- Costs are shop wholesale; markup_multiplier handles retail. Tune in admin.
INSERT INTO instant_quote_print_methods (name, setup_fee_per_color, base_per_piece_cost, charges_per_color, sort_order) VALUES
  ('Tackle Twill', 50.00, 15.00, false, 50),
  ('Sew-On Patch', 25.00,  8.00, false, 60)
ON CONFLICT (name) DO NOTHING;

-- Make jackets quotable in the instant-quote garment picker.
INSERT INTO instant_quote_garments (name, quality_tier, base_cost, sort_order) VALUES
  ('Varsity Jacket', 'Standard', 39.99, 80),
  ('Varsity Jacket', 'Premium',  68.00, 81)
ON CONFLICT (name, quality_tier) DO NOTHING;
