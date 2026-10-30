-- What's physically on the shelf in Fairburn.
--
-- NOT an inventory system. TSB orders blanks per job and doesn't stock to a
-- par level, so there are no reorder points and nothing deducts itself. This
-- answers exactly one question, asked while quoting: "can I pull these off
-- the shelf instead of ordering?" Leftovers, overruns, samples, odd sizes.
--
-- Why its own table rather than a column on products (Doc asked, 2026-10-30):
--   * products has 6,191 rows and one row per STYLE — `colors` and `sizes`
--     are columns listing what the style comes in. There is no row for
--     "Gildan 5000 / Black / L", which is the grain a shelf count needs.
--   * Stock exists in ~40 of those 6,191. A column would leave 6,151 nulls.
--   * Leftovers include discontinued and non-S&S goods with no catalogue row
--     at all, so product_id is nullable and style_name carries the label.
--   * products is overwritten nightly by the S&S/JDS syncs; a physical count
--     should not be pinned to a vendor feed that drops discontinued styles.
--
-- The UI still surfaces this inside the catalogue — where the bytes live and
-- where Doc types the number are different questions.

CREATE TABLE IF NOT EXISTS shelf_stock (
  id           SERIAL PRIMARY KEY,
  -- Links to the catalogue when the garment is still in it; null for
  -- discontinued styles, other vendors, and anything hand-entered.
  product_id   INTEGER REFERENCES products(id) ON DELETE SET NULL,
  -- Always populated, even when product_id is set: the catalogue row can
  -- disappear under us and the shelf label has to survive that.
  style_name   TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '',
  size         TEXT NOT NULL DEFAULT '',
  qty          INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  -- Where it came from: "overrun, Quote #214", "sample", "misprint backs ok".
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per physical pile. Counting the same style/color/size twice should
-- correct the existing row, not create a second one the UI would show twice.
-- COALESCE-free because color/size default to '' rather than NULL.
CREATE UNIQUE INDEX IF NOT EXISTS shelf_stock_unique_pile
  ON shelf_stock (LOWER(style_name), LOWER(color), LOWER(size));

-- The quote-side lookup: "what do I have in this style?"
CREATE INDEX IF NOT EXISTS shelf_stock_product_idx ON shelf_stock (product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON shelf_stock TO tsbadmin;
GRANT USAGE, SELECT ON SEQUENCE shelf_stock_id_seq TO tsbadmin;
