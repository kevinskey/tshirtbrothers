-- Customer "favorites" — saved catalog products. Heart icon on the shop
-- card toggles a row in here; the heart icon in the header takes the
-- customer to a /favorites page listing them.

CREATE TABLE IF NOT EXISTS user_favorites (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites (user_id);
