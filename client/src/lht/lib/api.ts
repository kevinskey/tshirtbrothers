// Live Hard Truth API client. Commerce rides the shared store-shop system
// (store slug `live-hard-truth`, Stripe via create-store-checkout) so LHT
// orders land in store_orders / the ledger / the admin fulfillment
// pipeline like any other storefront. Leads and the Truth Session hit the
// small brand-specific /api/lht surface.

import { STORE_SLUG } from './catalog';

export interface LhtStore {
  slug: string;
  name: string;
  brand_json: Record<string, unknown>;
  store_type: string;
  fulfillment_mode: 'ship_only' | 'pickup_only' | 'both';
}

export interface LhtProduct {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  retail_price_cents: number;
  variants_json: { sizes?: string[]; colors?: string[]; images?: string[] };
  campaign_ref: string | null;
  opens_at: string | null;
  closes_at: string | null;
  published_at: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

export const fetchStore = () => getJson<LhtStore>(`/api/store-shop/${STORE_SLUG}`);

export const fetchProducts = () =>
  getJson<{ products: LhtProduct[] }>(`/api/store-shop/${STORE_SLUG}/products`);

export const fetchProduct = (slug: string) =>
  getJson<LhtProduct>(`/api/store-shop/${STORE_SLUG}/product/${encodeURIComponent(slug)}`);

export interface CheckoutVariant {
  size?: string;
  color?: string;
  fulfillment: 'ship' | 'pickup';
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || `Request failed (${res.status})`);
  return data as T;
}

export function startCheckout(body: {
  product_slug: string;
  qty: number;
  variant: CheckoutVariant;
  buyer_email?: string;
  success_url: string;
  cancel_url: string;
}): Promise<{ checkoutUrl: string }> {
  return postJson('/api/payments/create-store-checkout', { store_slug: STORE_SLUG, ...body });
}

export function startCartCheckout(body: {
  items: { product_slug: string; qty: number; variant: CheckoutVariant }[];
  buyer_email?: string;
  success_url: string;
  cancel_url: string;
}): Promise<{ checkoutUrl: string }> {
  return postJson('/api/payments/create-store-cart-checkout', { store_slug: STORE_SLUG, ...body });
}

// ── Leads / Truth Session ────────────────────────────────────────────────

export function postLead(body: {
  first_name?: string;
  email: string;
  consent: boolean;
  source: 'guide' | 'newsletter';
}): Promise<{ ok: boolean }> {
  return postJson('/api/lht/leads', body);
}

export interface TruthAnswers {
  season?: string;
  carrying?: string;
  duration?: string;
  need?: string;
  hiddenFrom?: string;
  freedom?: string;
  truth?: string;
}

export interface TruthResult {
  safety: boolean;
  color?: string;
  reading?: {
    reading: string;
    hardTruth: string;
    nextStep: string;
    affirmation: string;
  };
}

export function postTruthSession(body: {
  first_name: string;
  email: string;
  consent: boolean;
  answers: TruthAnswers;
}): Promise<TruthResult> {
  return postJson('/api/lht/truth-session', body);
}
