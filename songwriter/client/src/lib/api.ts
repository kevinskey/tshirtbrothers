const BASE = import.meta.env.VITE_API_URL || '';

async function req<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!r.ok) {
    let msg = `Request failed (${r.status})`;
    try { const body = await r.json(); msg = body.error || msg; } catch { /* noop */ }
    throw new Error(msg);
  }
  if (r.status === 204) return undefined as T;
  return r.json();
}

export type Section = {
  id: string;
  type: 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'outro';
  label?: string;
  lines: string[];
};

export type Song = {
  id: number;
  user_id: number;
  title: string;
  sections: Section[];
  notes: string;
  tempo_bpm: number | null;
  key_signature: string | null;
  created_at: string;
  updated_at: string;
};

export type SongSummary = Omit<Song, 'sections' | 'notes'> & { section_count: number };

export type User = { id: number; email: string; name: string; avatar_url: string | null };

export const api = {
  me: () => req<User>('/auth/me'),
  logout: () => req<{ ok: true }>('/auth/logout', { method: 'POST' }),

  listSongs: () => req<SongSummary[]>('/songs'),
  getSong: (id: number) => req<Song>(`/songs/${id}`),
  createSong: (data: Partial<Song>) => req<Song>('/songs', { method: 'POST', body: JSON.stringify(data) }),
  updateSong: (id: number, data: Partial<Song>) =>
    req<Song>(`/songs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSong: (id: number) => req<{ deleted: true }>(`/songs/${id}`, { method: 'DELETE' }),

  rhymes: (body: { word: string; context?: string; style?: string }) =>
    req<{ perfect: string[]; near: string[]; multi: string[] }>('/ai/rhymes', {
      method: 'POST', body: JSON.stringify(body),
    }),
  nextLine: (body: { previous_lines: string[]; section_type?: string; style?: string; count?: number }) =>
    req<{ suggestions: string[] }>('/ai/next-line', { method: 'POST', body: JSON.stringify(body) }),
  rewrite: (body: { line: string; instruction?: string; context?: string; count?: number }) =>
    req<{ rewrites: string[] }>('/ai/rewrite', { method: 'POST', body: JSON.stringify(body) }),

  generateSection: (body: {
    section_type: string;
    topic?: string;
    style?: string;
    existing_sections?: { type: string; lines: string[] }[];
    line_count?: number;
  }) =>
    req<{ lines: string[] }>('/ai/generate-section', { method: 'POST', body: JSON.stringify(body) }),

  generateSong: (body: {
    topic: string;
    style?: string;
    structure?: string[];
    title_suggestion?: boolean;
  }) =>
    req<{ title?: string; sections: { type: Section['type']; label: string; lines: string[] }[] }>(
      '/ai/generate-song',
      { method: 'POST', body: JSON.stringify(body) }
    ),

  findPoetry: (body: {
    theme: string;
    mood?: string;
    count?: number;
    author_background?: string;
    era?: string;
    language_origin?: string;
  }) =>
    req<{ poems: Poem[] }>('/ai/find-poetry', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  analyzeSong: (body: { lyrics?: string; title?: string; artist?: string }) =>
    req<SongAnalysis>('/ai/analyze-song', { method: 'POST', body: JSON.stringify(body) }),

  generateFromModel: (body: {
    analysis: SongAnalysis;
    new_topic: string;
    new_style?: string;
    keep_tone?: boolean;
  }) =>
    req<{
      title: string;
      sections: { type: Section['type']; label: string; lines: string[] }[];
      notes?: string;
    }>('/ai/generate-from-model', { method: 'POST', body: JSON.stringify(body) }),

  getPsalmTranslations: () =>
    req<{ translations: BibleTranslation[]; default: string }>('/psalms/translations'),

  getPsalm: (number: number, translation?: string) =>
    req<Psalm>(`/psalms/${number}${translation ? `?translation=${translation}` : ''}`),

  searchPsalms: (body: { theme: string; count?: number; translation?: string }) =>
    req<{ psalms: (Psalm & { why_it_fits: string })[] }>('/psalms/search', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  adaptPsalm: (body: {
    psalm_number?: number;
    psalm_text?: string;
    style?: string;
    preserve_imagery?: boolean;
    translation?: string;
  }) =>
    req<{
      title: string;
      sections: { type: Section['type']; label: string; lines: string[] }[];
    }>('/psalms/adapt', { method: 'POST', body: JSON.stringify(body) }),

  lookupWord: (word: string) => req<DictionaryEntry>(`/dictionary/${encodeURIComponent(word)}`),

  wordInsights: (word: string) =>
    req<WordInsights>(`/dictionary/${encodeURIComponent(word)}/insights`, { method: 'POST' }),

  searchBible: (body: { query: string; count?: number; translation?: string; testament?: 'any' | 'ot' | 'nt' }) =>
    req<{ passages: BiblePassage[] }>('/psalms/bible/search', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getBiblePassage: (ref: string, translation?: string) =>
    req<BiblePassage>(
      `/psalms/bible/passage?ref=${encodeURIComponent(ref)}${translation ? `&translation=${translation}` : ''}`
    ),
};

export type BiblePassage = {
  reference: string;
  translation_code: string;
  translation: string;
  translation_note: string;
  verses: { book: string; chapter: number; verse: number; text: string }[];
  text: string;
  why_it_fits?: string;
};

export type DictionaryEntry = {
  word: string;
  phonetics: { text: string; audio: string | null }[];
  meanings: {
    partOfSpeech: string;
    definitions: { definition: string; example: string | null }[];
    synonyms: string[];
    antonyms: string[];
  }[];
  origin: string;
  synonyms: string[];
  antonyms: string[];
  associations: string[];
  rhymes: string[];
  near_rhymes: string[];
  collocations: {
    adjectives_for_noun: string[];
    nouns_for_adjective: string[];
  };
  similar_sound: string[];
};

export type WordInsights = {
  connotation?: string;
  register?: string;
  emotional_weight?: string;
  sensory_feel?: string;
  metaphor_ideas?: string[];
  contrast_pairs?: string[];
  song_line_examples?: string[];
  pitfalls?: string;
};

export type BibleTranslation = { code: string; label: string; lang: string };

export type Poem = {
  title: string;
  author: string;
  year: string;
  full_text: string;
  is_excerpt?: boolean;
  line_count?: number;
  why_it_fits: string;
};

export type Psalm = {
  number: number;
  reference: string;
  translation_code: string;
  verses: { verse: number; text: string }[];
  text: string;
  translation: string;
  translation_note: string;
};

export type SongAnalysis = {
  song_title?: string;
  artist?: string;
  confidence_note?: string;
  structure: string[];
  section_patterns?: {
    verse_line_count?: number;
    chorus_line_count?: number;
    bridge_line_count?: number;
  };
  rhyme_scheme?: {
    verse?: string;
    chorus?: string;
    bridge?: string;
  };
  meter_description?: string;
  pov?: string;
  tense?: string;
  tone?: string;
  themes?: string[];
  key_imagery?: string[];
  devices?: string[];
  hook?: string;
  why_it_works?: string;
  template_summary?: string;
};
