import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type User, type Section, type BiblePassage, type BibleTranslation } from '@/lib/api';
import TopBar from '@/components/TopBar';
import PageBanner from '@/components/PageBanner';
import { getBiblePassageCached } from '@/lib/cachedApi';

const TRANSLATION_KEY = 'sw_psalm_translation'; // share with PsalmsPage

type Testament = 'any' | 'ot' | 'nt';

export default function BibleSearchPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();

  const [translations, setTranslations] = useState<BibleTranslation[]>([]);
  const [translation, setTranslation] = useState<string>(
    () => localStorage.getItem(TRANSLATION_KEY) || 'kjv'
  );

  const [query, setQuery] = useState('');
  const [count, setCount] = useState(6);
  const [testament, setTestament] = useState<Testament>('any');
  const [results, setResults] = useState<BiblePassage[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    api.getPsalmTranslations()
      .then((r) => setTranslations(r.translations))
      .catch(() => { /* non-fatal */ });
  }, []);

  useEffect(() => {
    localStorage.setItem(TRANSLATION_KEY, translation);
    // If results are present, re-fetch them in the new translation
    if (results.length > 0) refetchInTranslation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translation]);

  async function refetchInTranslation() {
    const refs = results.map((p) => ({ ref: p.reference, why: p.why_it_fits }));
    const fresh: BiblePassage[] = [];
    for (const { ref, why } of refs) {
      try {
        const p = await getBiblePassageCached(ref, translation);
        fresh.push({ ...p, why_it_fits: why });
      } catch { /* skip failures */ }
    }
    setResults(fresh);
  }

  async function search() {
    if (!query.trim()) {
      toast.message('Enter a word or idea');
      return;
    }
    setSearching(true);
    setResults([]);
    try {
      const r = await api.searchBible({ query, count, translation, testament });
      setResults(r.passages || []);
      if ((r.passages || []).length === 0) toast.message('No matches — try different wording');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function useAsSong(p: BiblePassage) {
    try {
      const lines = p.verses.map((v) => v.text.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const sections: Section[] = [
        {
          id: crypto.randomUUID(),
          type: 'verse',
          label: p.reference,
          lines,
        },
        { id: crypto.randomUUID(), type: 'chorus', label: 'Chorus', lines: [''] },
      ];
      const song = await api.createSong({
        title: p.reference,
        sections,
        notes: `From ${p.reference} (${p.translation}, ${p.translation_note})${p.why_it_fits ? `\n\n${p.why_it_fits}` : ''}`,
      });
      toast.success('Song created');
      navigate(`/app/song/${song.id}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function copyPassage(p: BiblePassage) {
    try {
      await navigator.clipboard.writeText(`${p.reference}\n\n${p.text}`);
      toast.success('Passage copied');
    } catch {
      toast.error('Copy failed');
    }
  }

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <PageBanner
        theme="grass"
        eyebrow="🌾 Rooted in scripture"
        title="Bible search"
        subtitle="Search the entire Bible for a word, phrase, or idea. Use any passage as the starting verse of a new song."
      >
        {translations.length > 0 && (
          <div className="inline-flex items-center gap-2 bg-white/80 backdrop-blur rounded-full pl-4 pr-2 py-1.5 border border-meadow-200">
            <label className="text-[10px] uppercase tracking-wider text-meadow-600 font-semibold">
              Translation
            </label>
            <select
              value={translation}
              onChange={(e) => setTranslation(e.target.value)}
              className="text-sm bg-transparent border-0 focus:outline-none min-w-[220px]"
            >
              {translations.map((t) => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
          </div>
        )}
      </PageBanner>

      <main className="max-w-4xl mx-auto px-8 py-10">
        <div className="mb-4 text-sm">
          <Link to="/app" className="text-meadow-500 hover:text-meadow-800">← All songs</Link>
        </div>

        <section className="bg-white border border-ink-100 rounded-lg p-5 mb-6">
          <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
            Word, phrase, or idea *
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
            placeholder='e.g. "love your enemies", mercy, joy in suffering, the cost of following'
            className="w-full text-base bg-ink-50 border border-ink-100 rounded px-3 py-2 mb-3 focus:outline-none focus:border-accent"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">Where to search</label>
              <select
                value={testament}
                onChange={(e) => setTestament(e.target.value as Testament)}
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              >
                <option value="any">Whole Bible</option>
                <option value="ot">Old Testament only</option>
                <option value="nt">New Testament only</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">Number of results</label>
              <input
                type="number"
                min={1}
                max={12}
                value={count}
                onChange={(e) => setCount(Math.min(12, Math.max(1, Number(e.target.value) || 6)))}
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <button
            onClick={search}
            disabled={searching || !query.trim()}
            className="px-6 py-2 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 text-sm font-medium disabled:opacity-40"
          >
            {searching ? 'Searching the scriptures…' : 'Search'}
          </button>
        </section>

        {results.length > 0 && (
          <div className="space-y-4">
            {results.map((p, i) => (
              <article key={i} className="bg-white border border-ink-100 rounded-lg p-6">
                <div className="flex items-start justify-between mb-3 gap-4">
                  <div>
                    <h2 className="font-serif text-2xl font-bold">{p.reference}</h2>
                    <div className="text-xs text-ink-400 mt-0.5">
                      {p.translation} · {p.translation_note}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => copyPassage(p)}
                      className="text-xs px-3 py-1.5 border border-ink-200 rounded-md hover:bg-ink-100 whitespace-nowrap"
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => useAsSong(p)}
                      className="text-xs px-3 py-1.5 bg-accent text-ink-900 rounded-md hover:bg-accent-hover font-medium whitespace-nowrap"
                    >
                      Use as song →
                    </button>
                  </div>
                </div>

                {p.why_it_fits && (
                  <p className="text-sm italic text-ink-600 mb-3 border-l-2 border-ink-100 pl-3">
                    {p.why_it_fits}
                  </p>
                )}

                <div className="font-serif text-base text-ink-800 leading-relaxed space-y-1">
                  {p.verses.map((v, vi) => (
                    <div key={vi} className="flex gap-3">
                      <span className="text-[10px] text-ink-400 mt-1.5 w-10 text-right tabular-nums flex-shrink-0">
                        {v.verse}
                      </span>
                      <span>{v.text}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}

        {!searching && results.length === 0 && (
          <div className="text-center py-12 text-ink-400">
            <p className="text-sm">
              Try: "the Lord is my shepherd", "forgive seventy times seven", "all things new", "peace that passes understanding"
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
