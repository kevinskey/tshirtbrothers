// IndexedDB cache for user-specific data.
// Provides cacheFirst(key, fetcher) and persistent set/get/list.
// Used to make previously-loaded psalms, songs, journal entries
// available offline.

import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'songwriter';
const DB_VERSION = 1;

type StoreName = 'psalms' | 'bible' | 'songs' | 'song_list' | 'journal' | 'journal_list' | 'misc';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        for (const s of ['psalms', 'bible', 'songs', 'song_list', 'journal', 'journal_list', 'misc'] as StoreName[]) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
        }
      },
    });
  }
  return dbPromise;
}

export async function cacheGet<T>(store: StoreName, key: string | number): Promise<T | undefined> {
  try {
    const d = await db();
    return (await d.get(store, key as any)) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function cachePut<T>(store: StoreName, key: string | number, value: T): Promise<void> {
  try {
    const d = await db();
    await d.put(store, value as any, key as any);
  } catch { /* noop */ }
}

export async function cacheDelete(store: StoreName, key: string | number): Promise<void> {
  try {
    const d = await db();
    await d.delete(store, key as any);
  } catch { /* noop */ }
}

export async function cacheKeys(store: StoreName): Promise<IDBValidKey[]> {
  try {
    const d = await db();
    return await d.getAllKeys(store);
  } catch {
    return [];
  }
}

export async function cacheClear(store: StoreName): Promise<void> {
  try {
    const d = await db();
    await d.clear(store);
  } catch { /* noop */ }
}

/**
 * Network-first with cache fallback. Tries to fetch fresh, caches on success,
 * falls back to cached on network error. Great for read-only data where you
 * want fresh when online but survivable offline.
 */
export async function networkFirst<T>(
  store: StoreName,
  key: string | number,
  fetcher: () => Promise<T>
): Promise<T> {
  try {
    const fresh = await fetcher();
    await cachePut(store, key, fresh);
    return fresh;
  } catch (err) {
    const cached = await cacheGet<T>(store, key);
    if (cached !== undefined) return cached;
    throw err;
  }
}

/**
 * Cache-first: returns cached value immediately if present, otherwise fetches.
 * Useful for content that doesn't change (public-domain text).
 */
export async function cacheFirst<T>(
  store: StoreName,
  key: string | number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await cacheGet<T>(store, key);
  if (cached !== undefined) return cached;
  const fresh = await fetcher();
  await cachePut(store, key, fresh);
  return fresh;
}
