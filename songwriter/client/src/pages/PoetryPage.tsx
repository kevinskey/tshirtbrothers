import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type User, type Section } from '@/lib/api';
import TopBar from '@/components/TopBar';

type Poem = { title: string; author: string; year: string; excerpt: string; why_it_fits: string };

export default function PoetryPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [theme, setTheme] = useState(searchParams.get('q') || '');
  const [mood, setMood] = useState('');
  const [poems, setPoems] = useState<Poem[]>([]);
  const [loading, setLoading] = useState(false);

  async function search(q: string = theme) {
    if (!q.trim()) {
      toast.message('Enter a theme to search for');
      return;
    }
    setLoading(true);
    setPoems([]);
    setSearchParams({ q });
    try {
      const r = await api.findPoetry({ theme: q, mood, count: 4 });
      setPoems(r.poems || []);
      if ((r.poems || []).length === 0) toast.message('No matches — try a different theme');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  // Auto-search if landed with ?q=
  useEffect(() => {
    const q = searchParams.get('q');
    if (q && poems.length === 0 && !loading) search(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importAsSong(poem: Poem) {
    try {
      const lines = poem.excerpt.split('\n').filter(Boolean);
      const sections: Section[] = [
        {
          id: crypto.randomUUID(),
          type: 'verse',
          label: `From "${poem.title}"`,
          lines: lines.length > 0 ? lines : [''],
        },
        { id: crypto.randomUUID(), type: 'chorus', label: 'Chorus', lines: [''] },
      ];
      const song = await api.createSong({
        title: poem.title,
        sections,
        notes: `Inspired by "${poem.title}" — ${poem.author} (${poem.year})\n\n${poem.why_it_fits}`,
      });
      toast.success(`Created "${poem.title}"`);
      navigate(`/app/song/${song.id}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <main className="max-w-4xl mx-auto px-8 py-12">
        <div className="mb-2 text-sm">
          <Link to="/app" className="text-ink-400 hover:text-ink-800">← All songs</Link>
        </div>
        <h1 className="font-serif text-4xl font-bold mb-2">Poetry inspiration</h1>
        <p className="text-ink-600 mb-8">
          Search classic public-domain poetry by theme. Import any poem as the starting verse of a new song.
        </p>

        <div className="bg-white border border-ink-100 rounded-lg p-5 mb-8">
          <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">Theme or feeling</label>
          <input
            type="text"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder="e.g. losing a parent, summer love, the open road"
            className="w-full text-base bg-ink-50 border border-ink-100 rounded px-3 py-2 mb-3 focus:outline-none focus:border-accent"
          />

          <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">Mood (optional)</label>
          <input
            type="text"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder="hopeful, melancholy, defiant, tender…"
            className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 mb-4 focus:outline-none focus:border-accent"
          />

          <button
            onClick={() => search()}
            disabled={loading || !theme.trim()}
            className="px-6 py-2 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 text-sm font-medium disabled:opacity-40"
          >
            {loading ? 'Searching the canon…' : 'Find poems'}
          </button>
        </div>

        {poems.length > 0 && (
          <div className="space-y-4">
            {poems.map((p, i) => (
              <article key={i} className="bg-white border border-ink-100 rounded-lg p-6">
                <div className="flex items-start justify-between mb-3 gap-4">
                  <div>
                    <h2 className="font-serif text-2xl font-bold">{p.title}</h2>
                    <div className="text-sm text-ink-400 mt-0.5">
                      {p.author} {p.year && `· ${p.year}`}
                    </div>
                  </div>
                  <button
                    onClick={() => importAsSong(p)}
                    className="text-xs px-3 py-1.5 bg-accent text-ink-900 rounded-md hover:bg-accent-hover font-medium whitespace-nowrap"
                  >
                    Use as song →
                  </button>
                </div>
                <pre className="font-serif text-base text-ink-800 whitespace-pre-wrap leading-relaxed mb-3">
                  {p.excerpt}
                </pre>
                {p.why_it_fits && (
                  <p className="text-xs italic text-ink-400 border-l-2 border-ink-100 pl-3">
                    {p.why_it_fits}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}

        {!loading && poems.length === 0 && (
          <div className="text-center py-12 text-ink-400">
            <p className="text-sm">Try themes like "lost love", "the sea", "growing old", "freedom"…</p>
          </div>
        )}
      </main>
    </div>
  );
}
