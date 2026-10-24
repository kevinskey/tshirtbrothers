// Fetch helpers for the store back office.
//
// These talk to /api/group-store-admin/:slug/*, which is gated on the
// 'owner' role server-side. The UI hides the tabs from non-owners, but the
// server is the thing actually enforcing it — a hidden tab is a courtesy,
// not a permission.

export interface BoProduct {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  retail_price_cents: number;
  compare_at_cents: number | null;
  sort_order: number;
  is_active: boolean;
  gallery_json: string[];
  category_slugs?: string[];
}

export interface BoCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  active: boolean;
  product_count?: number;
}

export interface BoPromotion {
  id: number;
  code: string;
  headline: string | null;
  subtext: string | null;
  discount_type: 'percent' | 'amount' | 'free_shipping';
  // NUMERIC comes back from pg as a string ("10.00"), so read it through
  // Number() rather than trusting the type.
  discount_value: string | number;
  min_order_cents: number;
  max_uses: number | null;
  max_uses_per_email: number | null;
  times_used: number;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  total_discount_cents?: number;
}

export interface BoShippingRule {
  id: number;
  label: string;
  rule_type: 'flat' | 'per_item' | 'free_over' | 'pickup';
  amount_cents: number;
  threshold_cents: number | null;
  sort_order: number;
  active: boolean;
}

export interface BoContentBlock {
  id: number;
  key: string;
  body: Record<string, unknown>;
  sort_order: number;
  active: boolean;
  updated_by: string | null;
  updated_at: string;
}

function base(slug: string) {
  return `/api/group-store-admin/${encodeURIComponent(slug)}`;
}

async function call<T>(
  url: string,
  authHeaders: Record<string, string>,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    // The back office returns {error} for its own validation failures;
    // anything else (a proxy error page, a 502) won't parse, so fall back
    // to the status rather than throwing a JSON error over an HTTP one.
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch { /* keep the status message */ }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ── Products ─────────────────────────────────────────────────────────────
// Deliberately NOT the public storefront endpoint: that one filters to live
// products, so a hidden product would vanish from the editor with no way to
// bring it back.
export function fetchStoreProducts(slug: string, authHeaders: Record<string, string>) {
  return call<{ products: BoProduct[] }>(`${base(slug)}/products`, authHeaders);
}

export function updateProduct(
  slug: string, productId: number, patch: Partial<BoProduct>, authHeaders: Record<string, string>,
) {
  return call<{ product: BoProduct }>(`${base(slug)}/products/${productId}`, authHeaders, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function reorderProducts(slug: string, productIds: number[], authHeaders: Record<string, string>) {
  return call<{ reordered: number }>(`${base(slug)}/products/reorder`, authHeaders, {
    method: 'POST',
    body: JSON.stringify({ product_ids: productIds }),
  });
}

export function setProductCategories(
  slug: string, productId: number, categoryIds: number[], authHeaders: Record<string, string>,
) {
  return call<{ category_ids: number[] }>(`${base(slug)}/products/${productId}/categories`, authHeaders, {
    method: 'PUT',
    body: JSON.stringify({ category_ids: categoryIds }),
  });
}

// ── Categories ───────────────────────────────────────────────────────────
export function fetchCategories(slug: string, authHeaders: Record<string, string>) {
  return call<{ categories: BoCategory[] }>(`${base(slug)}/categories`, authHeaders);
}

export function saveCategory(
  slug: string, category: Partial<BoCategory>, authHeaders: Record<string, string>,
) {
  return call<{ category: BoCategory }>(`${base(slug)}/categories`, authHeaders, {
    method: 'PUT',
    body: JSON.stringify(category),
  });
}

export function deleteCategory(slug: string, categoryId: number, authHeaders: Record<string, string>) {
  return call<{ deleted: boolean }>(`${base(slug)}/categories/${categoryId}`, authHeaders, {
    method: 'DELETE',
  });
}

// ── Storefront content ───────────────────────────────────────────────────
export function fetchContent(slug: string, authHeaders: Record<string, string>) {
  return call<{ content: BoContentBlock[] }>(`${base(slug)}/content`, authHeaders);
}

export function saveContent(
  slug: string,
  block: { key: string; body: Record<string, unknown>; sort_order?: number; active?: boolean },
  authHeaders: Record<string, string>,
) {
  return call<{ block: BoContentBlock }>(`${base(slug)}/content`, authHeaders, {
    method: 'PUT',
    body: JSON.stringify(block),
  });
}

export function deleteContent(slug: string, contentId: number, authHeaders: Record<string, string>) {
  return call<{ deleted: boolean }>(`${base(slug)}/content/${contentId}`, authHeaders, {
    method: 'DELETE',
  });
}

// ── Promotions ───────────────────────────────────────────────────────────
// A store's own promo codes. These are NOT Stripe promotion codes:
// Stripe's `allow_promotion_codes` is an account-wide switch, so a code
// made for one store used to work at every other store's checkout. These
// are validated against this one store before the session is created.
export function fetchPromotions(slug: string, authHeaders: Record<string, string>) {
  return call<{ promotions: BoPromotion[] }>(`${base(slug)}/promotions`, authHeaders);
}

export function savePromotion(
  slug: string, promotion: Partial<BoPromotion>, authHeaders: Record<string, string>,
) {
  return call<{ promotion: BoPromotion }>(`${base(slug)}/promotions`, authHeaders, {
    method: 'PUT',
    body: JSON.stringify(promotion),
  });
}

// A code that has been redeemed is deactivated rather than deleted, so the
// response says which happened.
export function deletePromotion(slug: string, promotionId: number, authHeaders: Record<string, string>) {
  return call<{ deleted: boolean; deactivated?: boolean }>(
    `${base(slug)}/promotions/${promotionId}`, authHeaders, { method: 'DELETE' },
  );
}

// ── Shipping ─────────────────────────────────────────────────────────────
// What the shopper is charged. TSB is merchant of record and buys the real
// label later, so these are the store's pricing policy, not carrier rates.
// A store with no rules keeps TSB's weight-based defaults.
export function fetchShippingRules(slug: string, authHeaders: Record<string, string>) {
  return call<{ rules: BoShippingRule[] }>(`${base(slug)}/shipping-rules`, authHeaders);
}

export function saveShippingRule(
  slug: string, rule: Partial<BoShippingRule>, authHeaders: Record<string, string>,
) {
  return call<{ rule: BoShippingRule }>(`${base(slug)}/shipping-rules`, authHeaders, {
    method: 'PUT',
    body: JSON.stringify(rule),
  });
}

export function deleteShippingRule(slug: string, ruleId: number, authHeaders: Record<string, string>) {
  return call<{ deleted: boolean }>(`${base(slug)}/shipping-rules/${ruleId}`, authHeaders, {
    method: 'DELETE',
  });
}

// Prices are entered in dollars and stored in cents. Round-tripping through
// a float loses a cent on values like 124.99, so the parse is done on the
// string.
export function dollarsToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.]/g, '');
  if (!cleaned) return NaN;
  const [whole, frac = ''] = cleaned.split('.');
  const cents = `${frac}00`.slice(0, 2);
  return Number(whole || '0') * 100 + Number(cents);
}

export function centsToDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}
