// Custom Gift Club shopping bag. TSB itself has no cart (orders go
// through quotes or single-product Stripe sessions), so CGC gets its own,
// scoped to the `cgc_cart` localStorage key so it can never mix with any
// TSB purchase flow.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import type { ReactNode } from 'react';
import type { CgcPersonalization } from './api';

export interface CartItem {
  key: string; // sku + personalization hash — separate lines for separate engravings
  sku: string;
  name: string;
  image: string | null;
  priceCents: number;
  qty: number;
  personalization: CgcPersonalization | null;
}

const STORAGE_KEY = 'cgc_cart';

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
  add: (item: Omit<CartItem, 'key'>) => void;
  setQty: (key: string, qty: number) => void;
  remove: (key: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartApi | null>(null);

export function CgcCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const add = useCallback((item: Omit<CartItem, 'key'>) => {
    const key = `${item.sku}:${JSON.stringify(item.personalization ?? null)}`;
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, qty: Math.min(i.qty + item.qty, 100) } : i));
      }
      return [...prev, { ...item, key }];
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setItems((prev) => prev
      .map((i) => (i.key === key ? { ...i, qty: Math.max(1, Math.min(qty, 100)) } : i)));
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => ({
    items,
    count: items.reduce((n, i) => n + i.qty, 0),
    add, setQty, remove, clear,
  }), [items, add, setQty, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCgcCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCgcCart outside CgcCartProvider');
  return ctx;
}
