/**
 * IndexedDB-backed cache of font binaries for opentype.js path generation.
 *
 * Why this is non-trivial:
 *   - Google Fonts' CSS API (`https://fonts.googleapis.com/css2`) returns
 *     .woff2 to any modern browser. opentype.js can't parse .woff2 without
 *     a separate decompressor (wawoff2). We decode once, store the .ttf
 *     bytes here, and reuse them on every export.
 *   - For a font like "Inter", the CSS response is split into many
 *     `unicode-range` subsets. The .woff2 file you actually fetch depends
 *     on the codepoints you ask for. So the cache key must include the
 *     codepoint set — same family + weight but different glyphs is a
 *     different cache entry.
 *
 * Cache key:  `${family}::${weight}::${codepointHash}`
 *   - codepointHash: a 32-bit FNV-1a hash of the sorted, deduplicated
 *     codepoints in the text. Stable across page loads and platforms.
 *
 * IndexedDB schema:
 *   - DB:    `tsb-font-cache`  (version 1)
 *   - store: `fonts`           (keyPath = "id" string, value = ArrayBuffer)
 *   - TTL:   none (fonts don't change). Eviction is left to the browser
 *            (typically multi-MB origin limits before any pressure kicks in).
 */

const DB_NAME = 'tsb-font-cache';
const DB_VERSION = 1;
const STORE = 'fonts';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** FNV-1a 32-bit hash of the codepoints in a string. Hex string output. */
function codepointHash(text: string): string {
  const points = new Set<number>();
  for (const ch of text) points.add(ch.codePointAt(0) ?? 0);
  const sorted = [...points].sort((a, b) => a - b);
  let h = 0x811c9dc5;
  for (const p of sorted) {
    h ^= p & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (p >>> 8) & 0xff;
    h = Math.imul(h, 0x01000193);
    h ^= (p >>> 16) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  // >>> 0 to coerce to unsigned 32-bit
  return ((h >>> 0).toString(16)).padStart(8, '0');
}

export function fontCacheKey(family: string, weight: number | string, text: string): string {
  return `${family}::${String(weight)}::${codepointHash(text)}`;
}

export async function getCachedFont(key: string): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function putCachedFont(key: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(buffer, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
