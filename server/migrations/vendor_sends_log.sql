-- History of every gang-sheet/graphic sent to a print vendor, shown on the
-- admin File Sender page. `files` is [{name, key, bytes, widthPx, heightPx}].
CREATE TABLE IF NOT EXISTS vendor_sends (
  id serial PRIMARY KEY,
  vendor_name text,
  vendor_email text NOT NULL,
  source text NOT NULL,
  reference text,
  note text,
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now()
);
