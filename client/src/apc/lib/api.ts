// All Print Club API client — thin typed wrappers over /api/apc.

export interface ApcOptionValue {
  id: string;
  name: string;
}

export interface ApcOptionGroup {
  group: string;
  values: ApcOptionValue[];
}

export interface ApcProduct {
  id: number;
  code: string;
  name: string;
  category: string;
  description: string;
  image_url: string | null;
  option_groups: ApcOptionGroup[];
  from_cents: number | null;
}

export interface ApcVariant {
  option_key: string;
  options: Record<string, string>;
  retail_cents: number;
}

export interface ApcConfig {
  categories: { name: string; count: number }[];
  flat_shipping_cents: number;
}

export interface ApcArtworkFile {
  side: 'front' | 'back';
  url: string;
}

export interface ApcOrder {
  id: number;
  status: string;
  total_cents: number;
  shipping_cents: number;
  created_at: string;
  items: {
    product_name: string;
    options: Record<string, string>;
    qty: number;
    unit_price_cents: number;
  }[];
}

export function money(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export const fetchConfig = () => getJson<ApcConfig>('/api/apc/config');

export function fetchProducts(params: Record<string, string | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  return getJson<{ products: ApcProduct[] }>(`/api/apc/products?${qs}`);
}

export const fetchProduct = (code: string) =>
  getJson<{ product: ApcProduct; variants: ApcVariant[] }>(
    `/api/apc/products/${encodeURIComponent(code)}`,
  );

export async function startCheckout(body: {
  items: {
    code: string;
    option_key: string;
    qty: number;
    artwork: ApcArtworkFile[];
    note?: string;
  }[];
  buyer_email?: string;
}): Promise<{ checkoutUrl: string }> {
  const res = await fetch('/api/apc/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Checkout failed (${res.status})`);
  return data;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token') || '';
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export async function fetchMyOrders(): Promise<{ orders: ApcOrder[] }> {
  const res = await fetch('/api/apc/my-orders', { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`);
  return data as { orders: ApcOrder[] };
}
