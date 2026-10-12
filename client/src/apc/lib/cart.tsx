// All Print Club cart. Scoped to the `apc_cart` localStorage key so it can
// never mix with CGC's bag or any TSB purchase flow. A line = one product
// option combination (print pricing is per-run; "qty" means identical runs)
// plus its uploaded artwork.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import type { ReactNode } from 'react';
import type { ApcArtworkFile } from './api';

export interface CartItem {
  key: string; // code + option_key + artwork hash — separate lines for separate files
  code: string;
  name: string;
  optionKey: string;
  options: Record<string, string>;
  image: string | null;
  priceCents: number; // retail per run
  qty: number;        // identical runs
  artwork: ApcArtworkFile[];
  note: string;
}

const STORAGE_KEY = 'apc_cart';

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

export function ApcCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(load);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const add = useCallback((item: Omit<CartItem, 'key'>) => {
    const key = `${item.code}:${item.optionKey}:${JSON.stringify(item.artwork)}`;
    setItems((prev) => {
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) => (i.key === key ? { ...i, qty: Math.min(i.qty + item.qty, 50) } : i));
      }
      return [...prev, { ...item, key }];
    });
  }, []);

  const setQty = useCallback((key: string, qty: number) => {
    setItems((prev) => prev
      .map((i) => (i.key === key ? { ...i, qty: Math.max(1, Math.min(qty, 50)) } : i)));
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

export function useApcCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useApcCart outside ApcCartProvider');
  return ctx;
}
