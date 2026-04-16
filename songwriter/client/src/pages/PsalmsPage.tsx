import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type User, type Section, type Psalm } from '@/lib/api';
import TopBar from '@/components/TopBar';

type ViewedPsalm = Psalm & { why_it_fits?: string };

export default function PsalmsPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();

  const [theme, setTheme] = useState('');
  const [count, setCount] = useState(4);
  const [searchResults, setSearchResults] = useState<ViewedPsalm[]>([]);
  const [searching, setSearching] = useState(false);

  const [selected, setSelected] = useState<ViewedPsalm | null>(null);
  const [loadingSelected, setLoadingSelected] = useState(false);
  const [adapting, setAdapting] = useState(false);
  const [adaptStyle, setAdaptStyle] = useState('');

  async function searchByTheme() {
    if (!theme.trim()) {
      toast.message('Enter a theme');
      return;
    }
    setSearching(true);
    setSearchResults([]);
    setSelected(null);
    try {
      const r = await api.searchPsalms({ theme, count });
      setSearchResults(r.psalms || []);
      if ((r.psalms || []).length === 0) toast.message('No matches');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSearching(false);
    }
  }

  async function openPsalm(number: number, whyItFits?: string) {
    setLoadingSelected(true);
    try {
      const p = await api.getPsalm(number);
      setSelected({ ...p, why_it_fits: whyItFits });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingSelected(false);
    }
  }

  async function useAsSong() {
    if (!selected) return;
    try {
      // Break the text into lines for the first verse section
      const lines = selected.verses.map((v) => v.text.replace(/\s+/g, ' ').trim()).filter(Boolean);
      const sections: Section[] = [
        {
          id: crypto.randomUUID(),
          type: 'verse',
          label: selected.reference,
          lines,
        },
        { id: crypto.randomUUID(), type: 'chorus', label: 'Chorus', lines: [''] },
      ];
      const song = await api.createSong({
        title: selected.reference,
        sections,
        notes: `From ${selected.reference} (${selected.translation}, ${selected.translation_note})${selected.why_it_fits ? `\n\n${selected.why_it_fits}` : ''}`,
      });
      toast.success('Song created');
      navigate(`/app/song/${song.id}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function adaptIntoSong() {
    if (!selected) return;
    setAdapting(true);
    try {
      const adapted = await api.adaptPsalm({
        psalm_number: selected.number,
        style: adaptStyle,
        preserve_imagery: true,
      });
      const sections: Section[] = (adapted.sections || []).map((s) => ({
        id: crypto.randomUUID(),
        type: s.type,
        label: s.label,
        lines: s.lines.length > 0 ? s.lines : [''],
      }));
      const song = await api.createSong({
        title: adapted.title || `Song from ${selected.reference}`,
        sections,
        notes: `Adapted from ${selected.reference} (${selected.translation})`,
      });
      toast.success('Adapted song created');
      navigate(`/app/song/${song.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAdapting(false);
    }
  }

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <main className="max-w-5xl mx-auto px-8 py-12">
        <div className="mb-2 text-sm">
          <Link to="/app" className="text-ink-400 hover:text-ink-800">← All songs</Link>
        </div>
        <h1 className="font-serif text-4xl font-bold mb-2">Psalms</h1>
        <p className="text-ink-600 mb-8">
          Browse all 150 psalms, search by theme, or let AI adapt a psalm into a modern song.
        </p>

        {/* Search by theme */}
        <section className="bg-white border border-ink-100 rounded-lg p-5 mb-6">
          <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
            Search by theme
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') searchByTheme(); }}
              placeholder="e.g. grief, gratitude, protection, praise, doubt"
              className="flex-1 text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
            />
            <input
              type="number"
              min={1}
              max={8}
              value={count}
              onChange={(e) => setCount(Math.min(8, Math.max(1, Number(e.target.value) || 4)))}
              className="w-20 text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              title="Number of results"
            />
            <button
              onClick={searchByTheme}
              disabled={searching || !theme.trim()}
              className="px-5 py-2 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 text-sm font-medium disabled:opacity-40"
            >
              {searching ? 'Searching…' : 'Find psalms'}
            </button>
          </div>
        </section>

        {/* Search results */}
        {searchResults.length > 0 && (
          <section className="mb-8">
            <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">Best matches</div>
            <div className="space-y-2">
              {searchResults.map((p) => (
                <button
                  key={p.number}
                  onClick={() => setSelected(p)}
                  className="w-full text-left p-3 bg-white border border-ink-100 rounded-md hover:border-accent"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-serif font-semibold">{p.reference}</div>
                    {p.why_it_fits && (
                      <div className="text-xs italic text-ink-400 text-right max-w-md">{p.why_it_fits}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* All 150 grid */}
        <section className="mb-8">
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">Browse all 150</div>
          <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-12 gap-1">
            {Array.from({ length: 150 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => openPsalm(n)}
                className={`aspect-square text-xs rounded border ${
                  selected?.number === n
                    ? 'bg-ink-900 text-ink-50 border-ink-900'
                    : 'bg-white border-ink-100 hover:border-accent hover:bg-ink-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        {/* Selected psalm */}
        {loadingSelected && (
          <div className="text-ink-400 py-8 text-sm">Loading psalm…</div>
        )}
        {selected && !loadingSelected && (
          <section className="bg-white border border-ink-100 rounded-lg p-6 mb-8">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="font-serif text-3xl font-bold">{selected.reference}</h2>
                <div className="text-xs text-ink-400 mt-1">
                  {selected.translation} · {selected.translation_note}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={useAsSong}
                  className="text-xs px-3 py-2 bg-accent text-ink-900 rounded-md hover:bg-accent-hover font-medium whitespace-nowrap"
                >
                  Use as song →
                </button>
              </div>
            </div>

            {selected.why_it_fits && (
              <p className="text-sm italic text-ink-600 mb-4 border-l-2 border-ink-100 pl-3">
                {selected.why_it_fits}
              </p>
            )}

            <div className="font-serif text-base text-ink-800 leading-relaxed space-y-1 mb-6">
              {selected.verses.map((v) => (
                <div key={v.verse} className="flex gap-3">
                  <span className="text-[10px] text-ink-400 mt-1.5 w-5 text-right tabular-nums flex-shrink-0">{v.verse}</span>
                  <span>{v.text}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-ink-100 pt-4">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">Adapt into a modern song</div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={adaptStyle}
                  onChange={(e) => setAdaptStyle(e.target.value)}
                  placeholder="Style (optional) — e.g. gospel ballad, indie folk, contemporary worship"
                  className="flex-1 text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
                />
                <button
                  onClick={adaptIntoSong}
                  disabled={adapting}
                  className="px-5 py-2 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 text-sm font-medium disabled:opacity-40 whitespace-nowrap"
                >
                  {adapting ? 'Adapting…' : 'Adapt with AI'}
                </button>
              </div>
              <p className="text-[11px] text-ink-400 mt-2">
                AI rewrites the psalm in modern, singable lyrics with a chorus hook. Keeps the spiritual essence intact.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
