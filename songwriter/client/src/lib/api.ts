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
};
