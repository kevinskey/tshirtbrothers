import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type User, type Section, type Poem } from '@/lib/api';
import TopBar from '@/components/TopBar';

const BACKGROUND_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'Black/African-American', label: 'Black / African-American' },
  { value: 'Latin American/Hispanic', label: 'Latin American / Hispanic' },
  { value: 'Asian/Asian-American', label: 'Asian / Asian-American' },
  { value: 'Middle Eastern/Arab/Persian', label: 'Middle Eastern / Arab / Persian' },
  { value: 'Indigenous/Native', label: 'Indigenous / Native' },
  { value: 'Women only', label: 'Women only' },
  { value: 'Irish', label: 'Irish' },
  { value: 'British', label: 'British' },
  { value: 'American', label: 'American' },
];

const ERA_OPTIONS = [
  { value: '', label: 'Any era' },
  { value: 'Harlem Renaissance', label: 'Harlem Renaissance' },
  { value: 'Romantic (late 1700s–mid 1800s)', label: 'Romantic' },
  { value: 'Victorian (mid–late 1800s)', label: 'Victorian' },
  { value: 'Modernist (early 1900s)', label: 'Modernist' },
  { value: 'Renaissance', label: 'Renaissance' },
  { value: 'Medieval', label: 'Medieval' },
  { value: 'Ancient/Classical', label: 'Ancient / Classical' },
];

export default function PoetryPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [theme, setTheme] = useState(searchParams.get('q') || '');
  const [mood, setMood] = useState('');
  const [authorBackground, setAuthorBackground] = useState('');
  const [customBackground, setCustomBackground] = useState('');
  const [era, setEra] = useState('');
  const [count, setCount] = useState(4);
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
      const r = await api.findPoetry({
        theme: q,
        mood,
        count,
        author_background: authorBackground === 'custom' ? customBackground : authorBackground,
        era,
      });
      setPoems(r.poems || []);
      if ((r.poems || []).length === 0) toast.message('No matches — try different filters');
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
      const lines = poem.full_text.split('\n').map((l) => l.trim()).filter(Boolean);
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
          Search classic public-domain poetry by theme and author background. Import any poem as the starting verse of a new song.
        </p>

        <div className="bg-white border border-ink-100 rounded-lg p-5 mb-8">
          <div className="mb-3">
            <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
              Theme or feeling *
            </label>
            <input
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
              placeholder="e.g. losing a parent, summer love, the open road"
              className="w-full text-base bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                Mood
              </label>
              <input
                type="text"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
                placeholder="hopeful, defiant, tender…"
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                Number of results
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 4)))}
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                Author background
              </label>
              <select
                value={authorBackground}
                onChange={(e) => setAuthorBackground(e.target.value)}
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              >
                {BACKGROUND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
                <option value="custom">Custom…</option>
              </select>
              {authorBackground === 'custom' && (
                <input
                  type="text"
                  value={customBackground}
                  onChange={(e) => setCustomBackground(e.target.value)}
                  placeholder="e.g. Caribbean, Jewish, Russian"
                  className="mt-2 w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
                />
              )}
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                Era
              </label>
              <select
                value={era}
                onChange={(e) => setEra(e.target.value)}
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              >
                {ERA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => search()}
            disabled={loading || !theme.trim()}
            className="px-6 py-2 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 text-sm font-medium disabled:opacity-40"
          >
            {loading ? 'Searching the canon…' : `Find ${count} poem${count !== 1 ? 's' : ''}`}
          </button>
        </div>

        {poems.length > 0 && (
          <div className="space-y-4">
            {poems.map((p, i) => (
              <PoemCard key={i} poem={p} onImport={() => importAsSong(p)} />
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

const COLLAPSE_THRESHOLD = 32; // lines before we collapse by default

function PoemCard({ poem, onImport }: { poem: Poem; onImport: () => void }) {
  const lines = (poem.full_text || '').split('\n');
  const isLong = lines.length > COLLAPSE_THRESHOLD;
  const [expanded, setExpanded] = useState(!isLong);
  const displayText = expanded ? poem.full_text : lines.slice(0, COLLAPSE_THRESHOLD).join('\n');

  async function copyText() {
    try {
      await navigator.clipboard.writeText(poem.full_text);
      toast.success('Poem copied');
    } catch {
      toast.error('Copy failed');
    }
  }

  return (
    <article className="bg-white border border-ink-100 rounded-lg p-6">
      <div className="flex items-start justify-between mb-3 gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold">{poem.title}</h2>
          <div className="text-sm text-ink-400 mt-0.5">
            {poem.author} {poem.year && `· ${poem.year}`}
            {poem.is_excerpt && <span className="ml-2 text-amber-700">· excerpt from longer work</span>}
            {poem.line_count && <span className="ml-2 text-ink-300">· {poem.line_count} lines</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={copyText}
            className="text-xs px-3 py-1.5 border border-ink-200 rounded-md hover:bg-ink-100 whitespace-nowrap"
          >
            Copy
          </button>
          <button
            onClick={onImport}
            className="text-xs px-3 py-1.5 bg-accent text-ink-900 rounded-md hover:bg-accent-hover font-medium whitespace-nowrap"
          >
            Use as song →
          </button>
        </div>
      </div>

      <pre className="font-serif text-base text-ink-800 whitespace-pre-wrap leading-relaxed mb-3">
        {displayText}
      </pre>

      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-accent hover:text-accent-hover font-medium mb-3"
        >
          {expanded ? '↑ Collapse' : `↓ Show all ${lines.length} lines`}
        </button>
      )}

      {poem.why_it_fits && (
        <p className="text-xs italic text-ink-400 border-l-2 border-ink-100 pl-3">
          {poem.why_it_fits}
        </p>
      )}
    </article>
  );
}
