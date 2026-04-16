import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type User, type Section, type Spiritual, type SpiritualSummary } from '@/lib/api';
import TopBar from '@/components/TopBar';
import PageBanner from '@/components/PageBanner';
import { useRegisterPage } from '@/lib/assistantContext';

export default function SpiritualsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();

  const [all, setAll] = useState<SpiritualSummary[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const [theme, setTheme] = useState('');
  const [aiResults, setAiResults] = useState<(Spiritual & { why_it_fits: string })[] | null>(null);
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState<Spiritual | null>(null);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [showScore, setShowScore] = useState(false);

  useRegisterPage({
    page: 'Spirituals',
    route: '/app/spirituals',
    summary: `${all.length} spirituals${selected ? ` · viewing "${selected.title}"` : ''}`,
    data: {
      current: selected ? { id: selected.id, title: selected.title, lyrics_preview: selected.lyrics.slice(0, 300) } : null,
    },
  });

  useEffect(() => {
    api.listSpirituals()
      .then(setAll)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter((s) =>
      s.title.toLowerCase().includes(q) || s.preview.toLowerCase().includes(q)
    );
  }, [all, query]);

  async function openOne(id: number, why_it_fits?: string) {
    setLoadingSelected(true);
    setShowScore(false);
    try {
      const full = await api.getSpiritual(id);
      setSelected({ ...full, why_it_fits: why_it_fits || '' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingSelected(false);
    }
  }

  function scoreUrl(s: Spiritual): string | null {
    if (!s.source_file) return null;
    const page = s.page_start || 1;
    // The #page= fragment is the standard Adobe-defined open parameter
    // supported by Chrome, Safari, Firefox, Edge.
    return `${s.source_file}#page=${page}`;
  }

  async function searchByTheme() {
    if (!theme.trim()) { toast.message('Enter a theme'); return; }
    setSearching(true);
    setAiResults(null);
    try {
      const r = await api.searchSpirituals({ theme, count: 5 });
      setAiResults(r.results);
      if (r.results.length === 0) toast.message(r.message || 'No matches');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function useAsSong() {
    if (!selected) return;
    try {
      const lines = selected.lyrics.split('\n').map((l) => l.trim()).filter(Boolean);
      const sections: Section[] = [
        {
          id: crypto.randomUUID(),
          type: 'verse',
          label: selected.title,
          lines: lines.length > 0 ? lines : [''],
        },
        { id: crypto.randomUUID(), type: 'chorus', label: 'Chorus', lines: [''] },
      ];
      const song = await api.createSong({
        title: selected.title,
        sections,
        notes: `From "${selected.title}" (traditional spiritual${selected.source ? `, ${selected.source}` : ''})${selected.why_it_fits ? `\n\n${selected.why_it_fits}` : ''}`,
      });
      toast.success('Song created');
      navigate(`/app/song/${song.id}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function copyText() {
    if (!selected) return;
    try {
      await navigator.clipboard.writeText(`${selected.title}\n\n${selected.lyrics}`);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  }

  const displayList = aiResults
    ? aiResults.map((r) => ({ id: r.id, number: r.number, title: r.title, preview: r.lyrics.slice(0, 180), source: r.source, why_it_fits: r.why_it_fits }))
    : filtered.map((s) => ({ ...s, why_it_fits: '' }));

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <PageBanner
        theme="branches"
        eyebrow="✊🏾 Negro spirituals"
        title="The spirituals"
        subtitle="A reference library of traditional African American spirituals. Browse the collection, search by theme, or use any spiritual as the starting verse of a new song."
      >
        <Link
          to="/app/spirituals/admin"
          className="inline-block text-xs px-3 py-1.5 bg-white/80 backdrop-blur border border-meadow-200 rounded-full hover:bg-meadow-100 text-meadow-700 font-medium"
        >
          Manage collection →
        </Link>
      </PageBanner>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="mb-4 text-sm">
          <Link to="/app" className="text-meadow-500 hover:text-meadow-800">← All songs</Link>
        </div>

        {/* Search controls */}
        <section className="bg-white border border-meadow-200 rounded-xl p-4 sm:p-5 mb-6 space-y-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-meadow-500 font-semibold mb-1">Filter by keyword (title or lyrics)</label>
            <input
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setAiResults(null); }}
              placeholder="river, morning, gospel train, chariot…"
              className="w-full text-sm bg-meadow-50 border border-meadow-200 rounded-full px-4 py-2 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="border-t border-meadow-100 pt-3">
            <label className="block text-[10px] uppercase tracking-wider text-meadow-500 font-semibold mb-1">Or ask AI to find by theme</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') searchByTheme(); }}
                placeholder="e.g. freedom, grief, hope in darkness"
                className="flex-1 text-sm bg-meadow-50 border border-meadow-200 rounded-full px-4 py-2 focus:outline-none focus:border-accent"
              />
              <button
                onClick={searchByTheme}
                disabled={searching || !theme.trim()}
                className="px-5 py-2 bg-meadow-700 text-meadow-50 text-sm rounded-full hover:bg-meadow-800 font-medium disabled:opacity-40 whitespace-nowrap"
              >
                {searching ? 'Searching…' : 'Find'}
              </button>
              {aiResults && (
                <button
                  onClick={() => setAiResults(null)}
                  className="px-3 py-2 text-xs text-meadow-600 hover:text-meadow-900"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Selected spiritual (shown above list on mobile) */}
        {loadingSelected && <div className="text-meadow-400 py-4 text-sm">Loading…</div>}
        {selected && !loadingSelected && (
          <section className="bg-white border border-meadow-200 rounded-xl p-5 sm:p-6 mb-8">
            <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-meadow-500 font-semibold">
                  {selected.number ? `#${selected.number} · ` : ''}Traditional spiritual
                  {selected.page_start ? (
                    <> · score {selected.page_end && selected.page_end !== selected.page_start
                      ? `pp. ${selected.page_start}–${selected.page_end}`
                      : `p. ${selected.page_start}`}</>
                  ) : null}
                </div>
                <h2 className="font-serif text-2xl sm:text-3xl font-bold text-meadow-900 mt-0.5">{selected.title}</h2>
                {selected.source && <div className="text-xs text-meadow-500 mt-0.5">Source: {selected.source}</div>}
              </div>
              <div className="flex gap-2 flex-shrink-0 flex-wrap">
                {scoreUrl(selected) && (
                  <button
                    onClick={() => setShowScore((v) => !v)}
                    className="text-xs px-3 py-1.5 border border-meadow-200 rounded-full hover:bg-meadow-100"
                  >
                    {showScore ? 'Hide score' : '♪ View score'}
                  </button>
                )}
                <button
                  onClick={copyText}
                  className="text-xs px-3 py-1.5 border border-meadow-200 rounded-full hover:bg-meadow-100"
                >
                  Copy lyrics
                </button>
                <button
                  onClick={useAsSong}
                  className="text-xs px-3 py-1.5 bg-accent text-meadow-900 rounded-full hover:bg-accent-hover font-medium whitespace-nowrap"
                >
                  Use as song →
                </button>
              </div>
            </div>

            {selected.why_it_fits && (
              <p className="text-sm italic text-meadow-600 border-l-2 border-meadow-100 pl-3 mb-3">{selected.why_it_fits}</p>
            )}

            {/* Inline PDF score viewer */}
            {showScore && scoreUrl(selected) && (
              <div className="mb-4 -mx-5 sm:-mx-6 border-y border-meadow-200 bg-meadow-50">
                <div className="px-4 py-2 flex items-center justify-between text-xs text-meadow-600">
                  <span>
                    Score from original PDF{selected.page_start ? ` · page ${selected.page_start}${selected.page_end && selected.page_end !== selected.page_start ? `–${selected.page_end}` : ''}` : ''}
                  </span>
                  <a
                    href={scoreUrl(selected)!}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-meadow-900"
                  >
                    Open in new tab ↗
                  </a>
                </div>
                <iframe
                  key={selected.id}
                  src={scoreUrl(selected)!}
                  title={`Score for ${selected.title}`}
                  className="w-full h-[70vh] sm:h-[80vh] bg-white"
                />
              </div>
            )}

            <pre className="font-serif text-base sm:text-lg leading-relaxed text-meadow-800 whitespace-pre-wrap">
              {selected.lyrics}
            </pre>

            {selected.source_file && (
              <div className="mt-4 pt-4 border-t border-meadow-100 flex items-center gap-4 text-xs text-meadow-600 flex-wrap">
                {scoreUrl(selected) && (
                  <a
                    href={scoreUrl(selected)!}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-meadow-900 underline"
                  >
                    View this score in a new tab →
                  </a>
                )}
                <a
                  href={selected.source_file}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-meadow-900 underline"
                >
                  View original PDF →
                </a>
              </div>
            )}
          </section>
        )}

        {/* List */}
        <section>
          <div className="text-[10px] uppercase tracking-wider text-meadow-500 font-semibold mb-3">
            {aiResults ? `AI picks for "${theme}"` : `${displayList.length} spiritual${displayList.length !== 1 ? 's' : ''}`}
          </div>
          {loading && <div className="text-sm text-meadow-500">Loading collection…</div>}
          {!loading && all.length === 0 && (
            <div className="bg-meadow-100 border border-meadow-200 rounded-xl p-6 text-center">
              <p className="text-sm text-meadow-700 mb-3">
                The collection is empty. Upload your PDF to populate it.
              </p>
              <Link
                to="/app/spirituals/admin"
                className="inline-block px-4 py-2 bg-meadow-700 text-meadow-50 rounded-full text-sm font-medium"
              >
                Upload PDF
              </Link>
            </div>
          )}
          {!loading && all.length > 0 && (
            <ul className="space-y-2">
              {displayList.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => openOne(s.id, s.why_it_fits)}
                    className={`w-full text-left p-3 bg-white border rounded-lg transition-colors ${
                      selected?.id === s.id ? 'border-meadow-400 bg-meadow-100' : 'border-meadow-100 hover:border-meadow-300'
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <div className="font-serif text-lg font-semibold text-meadow-900">
                        {s.number ? <span className="text-meadow-400 text-sm mr-1">{s.number}.</span> : null}
                        {s.title}
                      </div>
                    </div>
                    {s.why_it_fits ? (
                      <div className="text-xs italic text-meadow-500 mt-0.5">{s.why_it_fits}</div>
                    ) : (
                      <div className="text-xs text-meadow-500 mt-0.5 line-clamp-1">{s.preview}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
