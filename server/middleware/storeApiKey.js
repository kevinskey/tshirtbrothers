// Store API key middleware — authenticates cross-service calls from
// franchise store frontends (e.g., a GleeWorld tenant reading its orders
// from TSB).
//
// Env config (production): STORE_API_KEYS is a JSON blob mapping store
// slug → shared secret, one row per store:
//   STORE_API_KEYS={"morehouse-glee":"sk_live_...","spelman-glee":"sk_live_..."}
//
// Callers send `x-store-api-key: <secret>`. On success, req.store_slug is
// set from the matched entry so the route can scope queries by it.
//
// This is intentionally simple for Week 1. Store-owner-issued rotating
// tokens land in Week 2 alongside self-serve store signup.

let _cachedKeys = null;

function loadKeys() {
  if (_cachedKeys) return _cachedKeys;
  const raw = process.env.STORE_API_KEYS;
  if (!raw) {
    _cachedKeys = {};
    return _cachedKeys;
  }
  try {
    const obj = JSON.parse(raw);
    // Invert to secret → slug so lookup is a single hash hit.
    const inverted = {};
    for (const [slug, secret] of Object.entries(obj)) {
      if (typeof secret === 'string' && secret.length > 0) inverted[secret] = slug;
    }
    _cachedKeys = inverted;
  } catch (err) {
    console.error('[storeApiKey] STORE_API_KEYS env is not valid JSON:', err.message);
    _cachedKeys = {};
  }
  return _cachedKeys;
}

export function storeApiKey(req, res, next) {
  const key = req.headers['x-store-api-key'];
  if (!key || typeof key !== 'string') {
    return res.status(401).json({ error: 'Missing x-store-api-key header' });
  }
  const keys = loadKeys();
  const slug = keys[key];
  if (!slug) {
    return res.status(403).json({ error: 'Unknown store API key' });
  }
  const requestedSlug = req.params.slug;
  if (requestedSlug && requestedSlug !== slug) {
    return res.status(403).json({ error: 'API key does not authorize this store' });
  }
  req.store_slug = slug;
  next();
}
