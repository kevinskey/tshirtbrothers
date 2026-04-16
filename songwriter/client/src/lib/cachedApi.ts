// Thin wrapper around api.* that also writes/reads from IndexedDB so
// previously-loaded data is available when offline.

import { api, type Psalm, type Song, type SongSummary, type JournalEntry, type JournalSummary, type BiblePassage } from '@/lib/api';
import { networkFirst, cacheFirst } from '@/lib/offlineCache';

// Psalms — static text, cache forever (they don't change)
export function getPsalmCached(n: number, translation: string = 'kjv') {
  return cacheFirst<Psalm>('psalms', `${translation}:${n}`, () => api.getPsalm(n, translation));
}

// Bible passage — same
export function getBiblePassageCached(ref: string, translation: string = 'kjv') {
  return cacheFirst<BiblePassage>('bible', `${translation}:${ref}`, () => api.getBiblePassage(ref, translation));
}

// Songs — network first so user always sees latest on the server,
// cache for offline fallback.
export function getSongCached(id: number) {
  return networkFirst<Song>('songs', id, () => api.getSong(id));
}

export function listSongsCached() {
  return networkFirst<SongSummary[]>('song_list', 'all', () => api.listSongs());
}

// Journal — same strategy
export function getJournalCached(id: number) {
  return networkFirst<JournalEntry>('journal', id, () => api.getJournal(id));
}

export function listJournalCached(q?: string) {
  const cacheKey = q ? `q:${q}` : 'all';
  return networkFirst<JournalSummary[]>('journal_list', cacheKey, () => api.listJournal(q));
}
