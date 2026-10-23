// Reads a store's editable storefront content.
//
// Any brand front-end can use this: pass the store slug, get back the
// content slots its owner has saved in the back office. Nothing here is
// specific to one store, which is the point — every storefront we build
// should become editable by adding this hook, not by writing a new one.
//
// The contract with the UI is a fallback, not a replacement. An owner who
// clears a field should get the page's own wording back, never an empty
// headline, so every read goes through a default.

import { useEffect, useState } from 'react';

export type StoreContentBlock = Record<string, unknown>;
export type StoreContent = Record<string, StoreContentBlock[]>;

export function useStoreContent(storeSlug: string) {
  const [content, setContent] = useState<StoreContent>({});
  // Starts true: the first paint would otherwise show the hardcoded default
  // and then snap to the saved copy a moment later.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/store-shop/${encodeURIComponent(storeSlug)}/content`);
        if (!res.ok) return;                      // fall back to defaults
        const data = await res.json();
        if (!cancelled && data?.content) setContent(data.content as StoreContent);
      } catch {
        // Offline or a bad response: the page still renders its defaults.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [storeSlug]);

  return { content, loading };
}

/**
 * Read one field out of a content slot, falling back to the page's own copy.
 *
 * Treats an empty string as absent: the back office strips blank fields on
 * save, but a block written by any other path might still carry one, and an
 * empty headline is worse than the default.
 */
export function slotField(
  content: StoreContent,
  key: string,
  field: string,
  fallback: string,
): string {
  const value = content[key]?.[0]?.[field];
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed === '' ? fallback : trimmed;
}
