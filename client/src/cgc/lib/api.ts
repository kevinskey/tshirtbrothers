// Custom Gift Club API client — thin typed wrappers over /api/cgc.

export interface CgcPriceTier {
  min_qty: number;
  /** Null on the top tier, which is open-ended. */
  max_qty: number | null;
  unit_price_cents: number;
}

export interface CgcProduct {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  image_url: string | null;
  retail_price_cents: number;
  /** Quantity-break BLANK prices, pre-ranged for display. Empty = flat price. */
  tiers?: CgcPriceTier[] | null;
  price_tiers?: { min_qty: number; unit_price_cents: number }[] | null;
  cgc_category: string | null;
  cgc_sport: string[] | null;
  weight_oz: string | null;
  available_quantity: number | null; // null = unknown, 0 = out of stock at JDS
}

export interface CgcListResponse {
  products: CgcProduct[];
  total: number;
  page: number;
  totalPages: number;
  categories: Record<string, number>;
  sports: Record<string, number>;
}

export interface CgcConfig {
  categories: string[];
  sports: string[];
  recipients: { key: string; label: string }[];
  occasions: { key: string; label: string }[];
  budgets: { key: string; label: string }[];
  personalization_fee_min_cents: number;
  personalization_fee_pct: number;
}

// Personalization fee: max(floor, pct × item price) — mirrors the server
// rule in server/routes/cgc.js so the PDP shows what checkout charges.
/**
 * The blank unit price at this quantity.
 *
 * Mirrors server/lib/tierPricing.js deliberately — the page has to quote a
 * number before the server sees the cart. The SERVER remains the authority:
 * it recomputes this at checkout from the product row, so a tampered or
 * stale client cannot buy at a price the shop did not set. If these two ever
 * disagree the customer sees one number and is charged another, so they are
 * written to the same rule: the LAST tier whose min_qty <= qty wins, and a
 * missing or malformed ladder falls back to the flat price.
 */
export function tierUnitPriceCents(
  product: Pick<CgcProduct, 'retail_price_cents' | 'price_tiers'>,
  qty: number,
): number {
  const flat = product.retail_price_cents || 0;
  const n = Number.isFinite(qty) ? Math.max(1, Math.floor(qty)) : 1;
  const tiers = (Array.isArray(product.price_tiers) ? product.price_tiers : [])
    .filter((t) => Number.isInteger(t?.min_qty) && t.min_qty >= 1
      && Number.isFinite(t?.unit_price_cents) && t.unit_price_cents > 0)
    .sort((a, b) => a.min_qty - b.min_qty);
  if (!tiers.length) return flat;
  let price = flat;
  for (const t of tiers) {
    if (n >= t.min_qty) price = t.unit_price_cents;
    else break;
  }
  return Math.min(price, flat || price);
}

export function personalizationFeeCents(retailCents: number, config?: CgcConfig) {
  const min = config?.personalization_fee_min_cents ?? 500;
  const pct = config?.personalization_fee_pct ?? 0.25;
  return Math.max(min, Math.round((retailCents || 0) * pct));
}

export interface CgcPersonalization {
  lines: string[];
  font: string;
  notes: string;
  artUrl: string;
  // Holiday launch products: chosen engraving layout + an optional gift
  // message that ships with the package (not engraved).
  design?: string;
  gift_message?: string;
}

// ── Holiday Gifts launch collection ────────────────────────────────────
export interface CgcHolidayVariant {
  sku: string;
  label: string;
  name: string;
  image_url: string | null;
  // null for mockup-backed variants until the launch selling price is set.
  retail_price_cents: number | null;
  active: boolean;
}

export interface CgcHolidayDesign {
  key: string;
  label: string;
  desc: string;
}

export interface CgcHolidayField {
  key: string;
  label: string;
  max: number;
  required: boolean;
  help: string;
}

export interface CgcHolidayProduct {
  slug: string;
  title: string;
  intro: string;
  featured: boolean;
  designs: CgcHolidayDesign[];
  fields: CgcHolidayField[];
  limits: string;
  production_note: string | null;
  variants: CgcHolidayVariant[];
  image_url: string | null;
  from_cents: number | null;
  available: boolean;
}

export function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export const fetchConfig = () => getJson<CgcConfig>('/api/cgc/config');

export function fetchProducts(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return getJson<CgcListResponse>(`/api/cgc/products?${qs}`);
}

// Admin shape (CGC /admin/holiday page): adds worksheet numbers and, per
// variant, the JDS account cost + catalog retail.
export interface CgcHolidayAdminVariant extends CgcHolidayVariant {
  cost_cents?: number | null;
  catalog_retail_cents?: number;
  missing?: boolean;
}

export interface CgcHolidayAdminProduct extends CgcHolidayProduct {
  id: number;
  published: boolean;
  position: number;
  engraving_minutes: string | number | null;
  packaging_cost_cents: number | null;
  selling_price_cents: number | null;
  sample_approved: boolean;
  custom_image_url: string | null;
  variants: CgcHolidayAdminVariant[];
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function adminJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`);
  return data as T;
}

export const fetchHolidayAdmin = () =>
  adminJson<{ products: CgcHolidayAdminProduct[] }>('/api/cgc/admin/holiday');

export const lookupHolidaySku = (sku: string) =>
  adminJson<{ product: { sku: string; name: string; image_url: string | null; cost_cents: number | null; retail_price_cents: number; active: boolean } }>(
    `/api/cgc/admin/holiday/sku/${encodeURIComponent(sku)}`,
  );

export const createHolidayProduct = (body: Record<string, unknown>) =>
  adminJson<{ product: { id: number } }>('/api/cgc/admin/holiday', {
    method: 'POST', body: JSON.stringify(body),
  });

export const updateHolidayProduct = (id: number, body: Record<string, unknown>) =>
  adminJson<{ product: { id: number } }>(`/api/cgc/admin/holiday/${id}`, {
    method: 'PATCH', body: JSON.stringify(body),
  });

export const deleteHolidayProduct = (id: number) =>
  adminJson<{ ok: boolean }>(`/api/cgc/admin/holiday/${id}`, { method: 'DELETE' });

export const fetchHoliday = () =>
  getJson<{ products: CgcHolidayProduct[] }>('/api/cgc/holiday');

export const fetchHolidayProduct = (slug: string) =>
  getJson<{ product: CgcHolidayProduct }>(
    `/api/cgc/holiday/${encodeURIComponent(slug)}`,
  );

export const fetchProduct = (sku: string) =>
  getJson<{ product: CgcProduct; related: CgcProduct[] }>(
    `/api/cgc/products/${encodeURIComponent(sku)}`,
  );

export async function startCheckout(body: {
  items: { sku: string; qty: number; personalization?: CgcPersonalization | null }[];
  buyer_email?: string;
  success_url?: string;
  cancel_url?: string;
}): Promise<{ checkoutUrl: string }> {
  const res = await fetch('/api/cgc/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Checkout failed (${res.status})`);
  return data;
}
