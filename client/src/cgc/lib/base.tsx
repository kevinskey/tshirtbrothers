// CGC mounts at "/" on its own hostname and at "/gift-club" on TSB's, so
// every internal link resolves through this base context.

import { createContext, useContext } from 'react';

export const CgcBaseContext = createContext('');

export function useCgcBase() {
  return useContext(CgcBaseContext);
}

export function useCgcPath() {
  const base = useCgcBase();
  return (path: string) => `${base}${path === '/' ? (base ? '' : '/') : path}`;
}
