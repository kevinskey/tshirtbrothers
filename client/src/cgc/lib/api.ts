// Custom Gift Club API client — thin typed wrappers over /api/cgc.

export interface CgcProduct {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  image_url: string | null;
  retail_price_cents: number;
  cgc_category: string | null;
  weight_oz: string | null;
}

export interface CgcListResponse {
  products: CgcProduct[];
  total: number;
  page: number;
  totalPages: number;
  categories: Record<string, number>;
}

export interface CgcConfig {
  categories: string[];
  recipients: { key: string; label: string }[];
  occasions: { key: string; label: string }[];
  budgets: { key: string; label: string }[];
  personalization_fee_cents: number;
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
