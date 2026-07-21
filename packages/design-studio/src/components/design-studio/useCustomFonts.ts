/**
 * Fetches the admin-curated custom font list from /api/custom-fonts and
 * injects @font-face rules so the names work as `font-family: …` values
 * everywhere on the page.
 *
 * Singleton injection: we add ONE <style> element to <head> and rebuild
 * its rule list when the font list changes. This avoids stacking dozens
 * of <style> tags across renders, and lets a future "custom font deleted"
 * event remove the rule as a side effect of the rebuild.
 *
 * The hook is module-level cached: every consumer that calls it shares one
 * fetch and one <style> tag. The FontPicker, the canvas, and any other
 * code path that needs the names all see the same data.
 */

import { useEffect, useState } from 'react';
import type { CategorizedFont, FontCategory } from './fontCatalog';

interface CustomFontRow {
  family_name: string;
  display_name: string | null;
  file_url: string;
  category: string;
}

let cache: CustomFontRow[] | null = null;
let inFlight: Promise<CustomFontRow[]> | null = null;
const subscribers = new Set<(rows: CustomFontRow[]) => void>();

const STYLE_ELEMENT_ID = 'tsb-custom-fonts';

function buildStyleSheet(rows: CustomFontRow[]): string {
  return rows.map((r) => {
    const ext = r.file_url.split('.').pop()?.toLowerCase() ?? '';
    const format = ext === 'ttf' ? 'truetype'
      : ext === 'otf' ? 'opentype'
      : ext === 'woff' ? 'woff'
      : ext === 'woff2' ? 'woff2'
      : 'truetype';
    return `@font-face { font-family: "${r.family_name}"; src: url("${r.file_url}") format("${format}"); font-display: swap; }`;
  }).join('\n');
}

function applyStyleSheet(rows: CustomFontRow[]): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ELEMENT_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildStyleSheet(rows);
}

async function fetchOnce(): Promise<CustomFontRow[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = fetch('/api/custom-fonts')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [] as CustomFontRow[])
    .then((rows: CustomFontRow[]) => {
      cache = rows;
      applyStyleSheet(rows);
      for (const cb of subscribers) cb(rows);
      inFlight = null;
      return rows;
    });
  return inFlight;
}

/** Force a refetch — call after the admin uploads or deletes. */
export function refreshCustomFonts(): Promise<CustomFontRow[]> {
  cache = null;
  return fetchOnce();
}

/**
 * Hook returning the custom fonts as CategorizedFont rows ready to merge
 * into the FontPicker's list. Returns an empty array until the fetch
 * resolves; the picker re-renders when state updates.
 */
export function useCustomFonts(): CategorizedFont[] {
  const [rows, setRows] = useState<CustomFontRow[]>(cache ?? []);

  useEffect(() => {
    const onUpdate = (next: CustomFontRow[]) => setRows(next);
    subscribers.add(onUpdate);
    fetchOnce().then((r) => setRows(r));
    return () => {
      subscribers.delete(onUpdate);
    };
  }, []);

  return rows.map((r) => ({
    name: r.family_name,
    category: (r.category as FontCategory) ?? 'custom',
  }));
}
