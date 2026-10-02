// Group-store shopping cart.
//
// Until now a store product page went straight to Stripe with one line
// item, so a parent buying a youth tee AND an adult tee had to check out
// twice and pay shipping twice — the #1 complaint from the Sensory
// Seasons store (Tangela, 2026-10-02). The header even rendered a "Cart 0"
// button that did nothing.
//
// The cart lives in localStorage, keyed per store so two storefronts open
// in the same browser never mix. It holds only what checkout needs; price
// and availability are re-validated server-side at checkout, so a stale
// cart can never sell at a stale price.
import { useCallback, useEffect, useState } from 'react';

export interface CartItem {
  product_slug: string;
  title: string;
  image: string | null;
  /** Base retail in cents, BEFORE size upcharge — display only. */
  unit_cents: number;
  size: string | null;
  color: string | null;
  /** 'ship' | 'pickup' — one cart is one fulfillment choice. */
  fulfillment: string;
  qty: number;
}

const KEY_PREFIX = 'tsb_store_cart:';
const MAX_LINES = 10;   // metadata.items must fit Stripe's 500-char cap
const MAX_QTY = 100;

const keyFor = (slug: string) => `${KEY_PREFIX}${slug}`;

/** Same identity rule the server uses when merging lines. */
export function sameLine(a: CartItem, b: Pick<CartItem, 'product_slug' | 'size' | 'color'>): boolean {
  return a.product_slug === b.product_slug
    && (a.size ?? null) === (b.size ?? null)
    && (a.color ?? null) === (b.color ?? null);
}

export function readCart(slug: string): CartItem[] {
  if (typeof window === 'undefined' || !slug) return [];
  try {
    const raw = window.localStorage.getItem(keyFor(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((i): i is CartItem => !!i && typeof i.product_slug === 'string');
  } catch {
    return [];
  }
}

function writeCart(slug: string, items: CartItem[]) {
  try {
    window.localStorage.setItem(keyFor(slug), JSON.stringify(items));
  } catch {
    /* private mode / quota — the cart is a convenience, never a blocker */
  }
  // Same-tab listeners: the storage event only fires in OTHER tabs.
  window.dispatchEvent(new CustomEvent('tsb-cart-changed', { detail: { slug } }));
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((n, i) => n + i.qty, 0);
}

/** Cart state for one store, synced across components and tabs. */
export function useStoreCart(slug: string) {
  const [items, setItems] = useState<CartItem[]>(() => readCart(slug));

  useEffect(() => { setItems(readCart(slug)); }, [slug]);

  useEffect(() => {
    const refresh = () => setItems(readCart(slug));
    window.addEventListener('storage', refresh);
    window.addEventListener('tsb-cart-changed', refresh as EventListener);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('tsb-cart-changed', refresh as EventListener);
    };
  }, [slug]);

  const commit = useCallback((next: CartItem[]) => {
    writeCart(slug, next);
    setItems(next);
  }, [slug]);

  /** Adds, or bumps the qty when the same product+size+color is already in.
   *  Returns false when the cart is full. */
  const add = useCallback((item: CartItem): boolean => {
    const current = readCart(slug);
    const idx = current.findIndex((i) => sameLine(i, item));
    const existing = idx >= 0 ? current[idx] : undefined;
    if (existing) {
      const next = [...current];
      next[idx] = { ...existing, qty: Math.min(MAX_QTY, existing.qty + item.qty) };
      commit(next);
      return true;
    }
    if (current.length >= MAX_LINES) return false;
    commit([...current, { ...item, qty: Math.min(MAX_QTY, Math.max(1, item.qty)) }]);
    return true;
  }, [slug, commit]);

  const setQty = useCallback((index: number, qty: number) => {
    const current = readCart(slug);
    const line = current[index];
    if (!line) return;
    const next = [...current];
    if (qty <= 0) next.splice(index, 1);
    else next[index] = { ...line, qty: Math.min(MAX_QTY, qty) };
    commit(next);
  }, [slug, commit]);

  const remove = useCallback((index: number) => setQty(index, 0), [setQty]);
  const clear = useCallback(() => commit([]), [commit]);

  return { items, add, setQty, remove, clear, count: cartCount(items), isFull: items.length >= MAX_LINES, maxLines: MAX_LINES };
}
