// Mount-aware link helper: LHT renders at "/" on livehardtruth.com and at
// /live-hard-truth on TSB hosts, so every internal link resolves through
// the base provided by LhtRoutes.

import { createContext, useContext } from 'react';

export const LhtBaseContext = createContext('');

export function useLhtBase(): string {
  return useContext(LhtBaseContext);
}

export function useLhtPath(): (path: string) => string {
  const base = useLhtBase();
  return (path: string) => `${base}${path === '/' ? (base ? '' : '/') : path}`;
}
