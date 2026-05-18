-- Admin-managed hero slides for the homepage rotator. The HeroSection
-- pulls active rows ordered by sort_order; admin UI under /admin lets
-- the shop owner toggle, reorder, upload, and delete.

CREATE TABLE IF NOT EXISTS hero_slides (
  id          SERIAL PRIMARY KEY,
  image_url   TEXT NOT NULL,
  label       VARCHAR(255),
  link_url    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hero_slides_active_sort
  ON hero_slides (active, sort_order) WHERE active;

-- Seed with the 9 slides we already uploaded so the rotator keeps
-- working out of the box. Safe to re-run (ON CONFLICT NOTHING via
-- existence check on the URL).
INSERT INTO hero_slides (image_url, label, sort_order)
SELECT v.image_url, v.label, v.sort_order
  FROM (VALUES
    ('https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/tshirt-ad.png',       'T-shirts',         10),
    ('https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/team-wear.png',       'Team Wear',        20),
    ('https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/spirit-wear.png',     'Spirit Wear',      30),
    ('https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/family-reunion.png',  'Family Reunion',   40),
    ('https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/embroidery.png',      'Embroidery',       50),
    ('https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/small-business.png',  'Small Business',   60),
    ('https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/summer-camp.png',     'Summer Camp',      70),
    ('https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/summer-essentials.png','Summer Essentials',80),
    ('https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/cruise-ad.png',       'Cruise Ad',        90)
  ) AS v(image_url, label, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM hero_slides WHERE hero_slides.image_url = v.image_url);
