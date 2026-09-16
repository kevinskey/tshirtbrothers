// JDS Industries product API. Single endpoint: product details (pricing
// tiers, images, inventory) for a list of SKUs. There is no ordering API —
// this powers the read-only Blanks (JDS) admin lookup.
const JDS_ENDPOINT = 'https://api.jdsapp.com/get-product-details-by-skus';

// JDS asks that callers avoid "wasteful and excessive spamming", so cache
// per-SKU results briefly rather than re-fetching on every keystroke.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // sku (upper) -> { at, product }

function requireToken() {
  const token = process.env.JDS_API_KEY;
  if (!token) {
    const err = new Error('JDS_API_KEY is not configured');
    err.status = 503;
    throw err;
  }
  return token;
}

export async function fetchJdsProducts(skus) {
  const token = requireToken();
  const wanted = [...new Set(skus.map((s) => s.trim().toUpperCase()).filter(Boolean))];

  const now = Date.now();
  const fresh = [];
  const missing = [];
  for (const sku of wanted) {
    const hit = cache.get(sku);
    if (hit && now - hit.at < CACHE_TTL_MS) fresh.push(hit.product);
    else missing.push(sku);
  }

  if (missing.length) {
    const resp = await fetch(JDS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, skus: missing }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      const err = new Error(`JDS API ${resp.status}: ${body.slice(0, 300)}`);
      err.status = 502;
      throw err;
    }
    const products = await resp.json();
    const returned = new Set();
    for (const p of Array.isArray(products) ? products : []) {
      const sku = String(p.sku || p.SKU || '').toUpperCase();
      if (sku) {
        cache.set(sku, { at: now, product: p });
        returned.add(sku);
      }
      fresh.push(p);
    }
    // Report SKUs JDS didn't recognize so the UI can flag them.
    for (const sku of missing) {
      if (!returned.has(sku)) fresh.push({ sku, notFound: true });
    }
  }

  return fresh;
}
