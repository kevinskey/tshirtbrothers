// Mount-aware link helper: APC renders at "/" on allprintclub.com and at
// /print-club on TSB hosts, so every internal link resolves through the
// base provided by ApcRoutes.

import { createContext, useContext } from 'react';

export const ApcBaseContext = createContext('');

export function useApcBase(): string {
  return useContext(ApcBaseContext);
}

export function useApcPath(): (path: string) => string {
  const base = useApcBase();
  return (path: string) => `${base}${path === '/' ? (base ? '' : '/') : path}`;
}
