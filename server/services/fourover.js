// 4over trade-printer API client (All Print Club supplier).
//
// Auth is a public/private key pair issued by 4over after signing their API
// agreement. Requests carry `apikey` (the public key) and `signature` as
// query parameters, where signature = HMAC-SHA256 of the UPPERCASE HTTP
// method, keyed with SHA1(private key) — the scheme used by every published
// 4over integration. The official reference (api-users.4over.com) is gated
// behind the API license login, so VERIFY with server/scripts/fourover-smoke.mjs
// as soon as keys land in .env; if 4over's new portal changed the scheme,
// signatureFor() below is the only thing to touch.

import crypto from 'crypto';

const BASE_URL = process.env.FOUROVER_BASE_URL || 'https://api.4over.com';

export function isFourOverConfigured() {
  return Boolean(process.env.FOUROVER_PUBLIC_KEY && process.env.FOUROVER_PRIVATE_KEY);
}

function requireKeys() {
  const publicKey = process.env.FOUROVER_PUBLIC_KEY;
  const privateKey = process.env.FOUROVER_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    const err = new Error('4over API keys are not configured (FOUROVER_PUBLIC_KEY / FOUROVER_PRIVATE_KEY)');
    err.status = 503;
    throw err;
  }
  return { publicKey, privateKey };
}

function signatureFor(method, privateKey) {
  const hashedPrivate = crypto.createHash('sha1').update(privateKey).digest('hex');
  return crypto.createHmac('sha256', hashedPrivate).update(method.toUpperCase()).digest('hex');
}

async function request(method, path, { params = {}, body } = {}) {
  const { publicKey, privateKey } = requireKeys();
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  url.searchParams.set('apikey', publicKey);
  url.searchParams.set('signature', signatureFor(method, privateKey));

  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`4over API ${resp.status} ${method} ${path}: ${text.slice(0, 300)}`);
    err.status = 502;
    throw err;
  }
  return resp.json();
}

// ── Catalog ──────────────────────────────────────────────────────────────

export function getCategories() {
  return request('GET', '/printproducts/categories');
}

// Paginated product feed. 4over caps page size; callers loop on offset.
export function getProducts({ max = 200, offset = 0 } = {}) {
  return request('GET', '/printproducts/products', { params: { max, offset } });
}

export function getProduct(productUuid) {
  return request('GET', `/printproducts/products/${encodeURIComponent(productUuid)}`);
}

// Base prices: every runsize/colorspec/option combination with its trade price.
export function getProductBasePrices(productUuid) {
  return request('GET', `/printproducts/productsbaseprices/${encodeURIComponent(productUuid)}`);
}

// ── Orders ───────────────────────────────────────────────────────────────

// Shape intentionally thin: routes/apcCatalog build the payload. The exact
// field names must be confirmed against the gated docs on first live use —
// submit failures land in apc_orders.submit_error for the admin to see, and
// never block the customer (they already paid; worst case Doc places the
// order manually on trade.4over.com, like JDS fulfillment).
export function submitOrder(payload) {
  return request('POST', '/orders', { body: payload });
}

export function getOrder(fourOverOrderId) {
  return request('GET', `/orders/${encodeURIComponent(fourOverOrderId)}`);
}
