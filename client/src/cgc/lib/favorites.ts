// CGC favorites — localStorage-backed so hearts work signed-out (TSB's
// user_favorites table FKs to the apparel products table, not
// jds_products, so a server list isn't available yet).

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'cgc_favorites';
const listeners = new Set<() => void>();
let snapshot: string[] = read();

function read(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function write(next: string[]) {
  snapshot = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCgcFavorites() {
  const favorites = useSyncExternalStore(subscribe, () => snapshot);
  const toggle = useCallback((sku: string) => {
    write(snapshot.includes(sku) ? snapshot.filter((s) => s !== sku) : [...snapshot, sku]);
  }, []);
  return { favorites, toggle, has: (sku: string) => favorites.includes(sku) };
}
