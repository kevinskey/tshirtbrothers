// Live Hard Truth cart. Scoped to the `lht_cart` localStorage key so it can
// never mix with CGC's bag, APC's cart, or the per-store tsb_store_cart
// keys. A line = product + colorway + size; checkout posts every line to
// create-store-cart-checkout which re-prices server-side.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import type { ReactNode } from 'react';

export interface CartItem {
  key: string; // slug + color + size
  productSlug: string;
  title: string;
  image: string | null;
  unitCents: number; // base retail, display only — server re-prices
  size: string | null;
  color: string | null;
  qty: number;
}

const STORAGE_KEY = 'lht_cart';
// create-store-cart-checkout caps metadata.items at ~500 chars — 10 lines max.
export const MAX_LINES = 10;
const MAX_QTY = 100;

function load(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface CartApi {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  isFull: boolean;
  add: (item: Omit<CartItem, 'key'>) => boolean;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartApi | null>(null);

export function LhtCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const add = useCallback((item: Omit<CartItem, 'key'>): boolean => {
    const key = `${item.productSlug}:${item.color ?? ''}:${item.size ?? ''}`;
    let added = true;
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key
          ? { ...i, qty: Math.min(i.qty + item.qty, MAX_QTY) }
          : i));
      }
      if (prev.length >= MAX_LINES) {
        added = false;
        return prev;
      }
      return [...prev, { ...item, key }];
    });
    return added;
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setItems((prev) => (qty <= 0
      ? prev.filter((i) => i.key !== key)
      : prev.map((i) => (i.key === key ? { ...i, qty: Math.min(qty, MAX_QTY) } : i))));
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({
    items,
    count: items.reduce((n, i) => n + i.qty, 0),
    subtotalCents: items.reduce((n, i) => n + i.qty * i.unitCents, 0),
    isFull: items.length >= MAX_LINES,
    add, setQty, remove, clear,
  }), [items, add, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useLhtCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useLhtCart outside LhtCartProvider');
  return ctx;
}
