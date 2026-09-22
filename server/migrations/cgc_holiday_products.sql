-- CGC Holiday Gifts launch collection, moved from the static config
-- (server/lib/cgcHoliday.js) into a table so Doc can add products, set
-- featured items, fill launch numbers, and publish from the CGC admin
-- page (customgiftclub.com/admin/holiday) without a deploy.
--
-- variants/designs/fields keep the same JSON shapes the public API and
-- PDP already consume. `published` gates buyability (launching-soon
-- state until true); `featured` floats a product to the front of the
-- collection with a Featured badge. Launch-worksheet numbers
-- (engraving_minutes, packaging_cost_cents, selling_price_cents,
-- sample_approved) live here too so the admin page IS the worksheet —
-- they stay NULL until measured, never invented.

CREATE TABLE IF NOT EXISTS cgc_holiday_products (
  id                   SERIAL PRIMARY KEY,
  slug                 VARCHAR(80) NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  intro                TEXT NOT NULL DEFAULT '',
  published            BOOLEAN NOT NULL DEFAULT FALSE,
  featured             BOOLEAN NOT NULL DEFAULT FALSE,
  position             INTEGER NOT NULL DEFAULT 0,
  production_note      TEXT,
  variants             JSONB NOT NULL DEFAULT '[]',  -- [{sku,label}]
  designs              JSONB NOT NULL DEFAULT '[]',  -- [{key,label,desc}]
  fields               JSONB NOT NULL DEFAULT '[]',  -- [{key,label,max,required,help}]
  limits_note          TEXT NOT NULL DEFAULT '',
  engraving_minutes    NUMERIC(6,1),
  packaging_cost_cents INTEGER,
  selling_price_cents  INTEGER,
  sample_approved      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO cgc_holiday_products
  (slug, title, intro, position, variants, designs, fields, limits_note)
VALUES
  (
    'personalized-tumbler',
    'Personalized Tumbler',
    'Polar Camel 20 oz. ringneck tumbler with standard lid, laser engraved with your name.',
    1,
    '[{"sku":"LTM7216","label":"Black"},{"sku":"LTM7201","label":"Stainless"},{"sku":"LTM7211","label":"Navy Blue"},{"sku":"LTM7214","label":"White"},{"sku":"LTM7203","label":"Red"}]',
    '[{"key":"name-script","label":"Name in Script","desc":"First name in a flowing script, centered on the front."},{"key":"monogram","label":"Classic Monogram","desc":"One large initial with the full name beneath it."},{"key":"name-year","label":"Name + Est. Year","desc":"Name in block lettering over an established year."}]',
    '[{"key":"name","label":"Name","max":20,"required":true,"help":"Exactly as it should be engraved — up to 20 characters."},{"key":"year","label":"Year","max":4,"required":false,"help":"Used by the Name + Est. Year layout."}]',
    'One engraving location (front). Up to 20 characters — longer names engrave at a smaller letter size.'
  ),
  (
    'family-cutting-board',
    'Family Cutting Board',
    'Acacia paddle-shaped cutting board, 13 1/2" x 7", laser engraved with your family name.',
    2,
    '[{"sku":"GFT2323","label":"Acacia"}]',
    '[{"key":"family-est","label":"Family Name & Est.","desc":"Family name across the center with your established year beneath."},{"key":"kitchen-of","label":"Kitchen Of","desc":"\"The ___ Kitchen\" in mixed lettering, centered."},{"key":"monogram-wreath","label":"Monogram Wreath","desc":"Single initial inside an engraved laurel wreath, family name below."}]',
    '[{"key":"name","label":"Family name","max":24,"required":true,"help":"Up to 24 characters — usually the last name."},{"key":"year","label":"Est. year","max":4,"required":false,"help":"Used by the Family Name & Est. layout."}]',
    'One engraved side. Family name up to 24 characters; the board is food-safe after engraving.'
  ),
  (
    'christmas-ornament',
    'Christmas Ornament',
    'Laserable leatherette tree ornament with hanging string, engraved both meaningful and light.',
    3,
    '[{"sku":"GFT1113","label":"Rustic/Gold"},{"sku":"GFT1108","label":"Black/Gold"},{"sku":"GFT1112","label":"Black/Silver"},{"sku":"GFT1106","label":"Light Brown"}]',
    '[{"key":"family","label":"Family","desc":"Family name with the year — a keepsake for the whole household."},{"key":"first-home","label":"First Home","desc":"\"Our First Home\" with your street line and the year."},{"key":"pet","label":"Pet","desc":"Your pet''s name with a paw motif and the year."}]',
    '[{"key":"name","label":"Name(s)","max":30,"required":true,"help":"Family name, street line, or pet name — up to 30 characters."},{"key":"year","label":"Year","max":4,"required":false,"help":"Shown beneath the name on every layout."}]',
    'Front engraving only. Up to 30 characters on the name line — shorter reads better at ornament size.'
  ),
  (
    'personalized-journal',
    'Personalized Journal',
    'Laserable leatherette portfolio with lined notepad, 9 1/2" x 12", engraved with a name or initials.',
    4,
    '[{"sku":"GFT246A","label":"Black/Gold"},{"sku":"GFT612","label":"Black/Silver"},{"sku":"GFT186","label":"Dark Brown"},{"sku":"GFT346","label":"Gray"}]',
    '[{"key":"name-corner","label":"Name, Lower Corner","desc":"Full name engraved small in the lower right corner."},{"key":"initials-center","label":"Initials, Centered","desc":"Two or three initials engraved large in the center."},{"key":"name-title","label":"Name + Title Line","desc":"Name with a short second line — a role, verse, or date."}]',
    '[{"key":"name","label":"Name or initials","max":24,"required":true,"help":"A full name (up to 24 characters) or 2–3 initials."},{"key":"line2","label":"Second line","max":30,"required":false,"help":"Used by the Name + Title Line layout."}]',
    'One engraving location. Name up to 24 characters or 2–3 initials; second line up to 30 characters.'
  )
ON CONFLICT (slug) DO NOTHING;
