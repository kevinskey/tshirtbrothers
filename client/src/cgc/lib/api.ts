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
