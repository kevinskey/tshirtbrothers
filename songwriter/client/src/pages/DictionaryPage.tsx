import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type User, type DictionaryEntry, type WordInsights } from '@/lib/api';
import TopBar from '@/components/TopBar';
import PageBanner from '@/components/PageBanner';

export default function DictionaryPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [word, setWord] = useState('');
  const [entry, setEntry] = useState<DictionaryEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [insights, setInsights] = useState<WordInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  async function lookup(term: string = word) {
    const w = term.trim().toLowerCase();
    if (!w) {
      toast.message('Type a word');
      return;
    }
    setLoading(true);
    setEntry(null);
    setInsights(null);
    try {
      const r = await api.lookupWord(w);
      setEntry(r);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadInsights() {
    if (!entry) return;
    setLoadingInsights(true);
    try {
      const r = await api.wordInsights(entry.word);
      setInsights(r);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingInsights(false);
    }
  }

  function playAudio(url: string) {
    try { new Audio(url).play(); } catch { /* noop */ }
  }

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <PageBanner
        theme="flowers"
        eyebrow="🌸 Lyricist's lookup"
        title="Dictionary"
        subtitle="Definitions, synonyms, antonyms, rhymes, collocations, and AI songwriting insights for any word."
      />

      <main className="max-w-5xl mx-auto px-8 py-10">
        <div className="mb-4 text-sm">
          <Link to="/app" className="text-meadow-500 hover:text-meadow-800">← All songs</Link>
        </div>

        {/* Search */}
        <section className="bg-white border border-ink-100 rounded-lg p-5 mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
              placeholder="Look up a word…"
              className="flex-1 text-base bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              autoFocus
            />
            <button
              onClick={() => lookup()}
              disabled={loading || !word.trim()}
              className="px-6 py-2 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 text-sm font-medium disabled:opacity-40"
            >
              {loading ? 'Looking up…' : 'Look up'}
            </button>
          </div>
        </section>

        {!entry && !loading && (
          <div className="text-center py-12 text-ink-400">
            <p className="text-sm">Try "ember", "silhouette", "drift", "untethered"…</p>
          </div>
        )}

        {entry && (
          <>
            {/* Headword */}
            <section className="bg-white border border-ink-100 rounded-lg p-6 mb-4">
              <div className="flex items-baseline flex-wrap gap-3 mb-3">
                <h2 className="font-serif text-4xl font-bold">{entry.word}</h2>
                {entry.phonetics.length > 0 && (
                  <div className="flex items-center gap-2 text-ink-400">
                    {entry.phonetics.map((p, i) => (
                      <span key={i} className="flex items-center gap-1">
                        <span className="italic">{p.text}</span>
                        {p.audio && (
                          <button
                            onClick={() => playAudio(p.audio!)}
                            className="text-accent hover:text-accent-hover"
                            title="Play pronunciation"
                          >
                            ♪
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Meanings */}
              {entry.meanings.length > 0 && (
                <div className="space-y-4">
                  {entry.meanings.map((m, i) => (
                    <div key={i}>
                      <div className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1.5">
                        {m.partOfSpeech}
                      </div>
                      <ol className="list-decimal list-outside ml-5 space-y-1.5 text-sm text-ink-800">
                        {m.definitions.map((d, j) => (
                          <li key={j}>
                            <span>{d.definition}</span>
                            {d.example && (
                              <div className="text-xs italic text-ink-400 mt-0.5">"{d.example}"</div>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}

              {entry.origin && (
                <div className="mt-5 pt-4 border-t border-ink-100">
                  <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">Origin</div>
                  <p className="text-sm text-ink-800 italic">{entry.origin}</p>
                </div>
              )}
            </section>

            {/* Synonyms / Antonyms grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <WordGroup title="Synonyms" words={entry.synonyms} highlight="accent" />
              <WordGroup title="Antonyms" words={entry.antonyms} highlight="red" />
            </div>

            {/* Associations, rhymes, collocations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <WordGroup
                title="Associations (words evoked)"
                words={entry.associations}
                onClick={(w) => { setWord(w); lookup(w); }}
              />
              <WordGroup title="Sounds similar" words={entry.similar_sound} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <WordGroup
                title="Perfect rhymes"
                words={entry.rhymes}
                onClick={(w) => navigator.clipboard.writeText(w).then(() => toast.success(`Copied "${w}"`))}
              />
              <WordGroup
                title="Near rhymes"
                words={entry.near_rhymes}
                onClick={(w) => navigator.clipboard.writeText(w).then(() => toast.success(`Copied "${w}"`))}
              />
            </div>

            {(entry.collocations.adjectives_for_noun.length > 0 ||
              entry.collocations.nouns_for_adjective.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {entry.collocations.adjectives_for_noun.length > 0 && (
                  <WordGroup
                    title="Adjectives paired with this word"
                    words={entry.collocations.adjectives_for_noun}
                  />
                )}
                {entry.collocations.nouns_for_adjective.length > 0 && (
                  <WordGroup
                    title="Nouns paired with this word"
                    words={entry.collocations.nouns_for_adjective}
                  />
                )}
              </div>
            )}

            {/* AI insights */}
            <section className="bg-white border border-ink-100 rounded-lg p-5 mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-serif text-xl font-bold">Songwriter's insight</h3>
                {!insights && (
                  <button
                    onClick={loadInsights}
                    disabled={loadingInsights}
                    className="px-4 py-1.5 bg-accent text-ink-900 rounded-md hover:bg-accent-hover text-sm font-medium disabled:opacity-40"
                  >
                    {loadingInsights ? 'Thinking…' : 'Get AI insights'}
                  </button>
                )}
              </div>

              {!insights && !loadingInsights && (
                <p className="text-sm text-ink-400">
                  Connotation, emotional weight, metaphor ideas, contrast pairs, and example lyric lines.
                </p>
              )}

              {insights && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {insights.connotation && <Tag label="Connotation" value={insights.connotation} />}
                    {insights.register && <Tag label="Register" value={insights.register} />}
                    {insights.emotional_weight && <Tag label="Emotional weight" value={insights.emotional_weight} />}
                    {insights.sensory_feel && <Tag label="Sensory feel" value={insights.sensory_feel} />}
                  </div>

                  {insights.metaphor_ideas && insights.metaphor_ideas.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">Metaphor ideas</div>
                      <ul className="list-disc list-outside ml-5 text-sm text-ink-800 space-y-1">
                        {insights.metaphor_ideas.map((m, i) => <li key={i}>{m}</li>)}
                      </ul>
                    </div>
                  )}

                  {insights.contrast_pairs && insights.contrast_pairs.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">Powerful contrast pairs</div>
                      <div className="flex flex-wrap gap-1.5">
                        {insights.contrast_pairs.map((w, i) => (
                          <span key={i} className="text-xs bg-ink-100 rounded px-2 py-1">{w}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {insights.song_line_examples && insights.song_line_examples.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">Example lyric lines</div>
                      <div className="space-y-1.5">
                        {insights.song_line_examples.map((l, i) => (
                          <div key={i} className="font-serif text-base italic text-ink-800 bg-ink-50 border-l-2 border-accent pl-3 py-1.5">
                            {l}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {insights.pitfalls && (
                    <div className="pt-3 border-t border-ink-100">
                      <div className="text-[10px] uppercase tracking-wider text-amber-700 mb-1">Pitfalls to avoid</div>
                      <p className="text-sm text-ink-800">{insights.pitfalls}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function WordGroup({
  title,
  words,
  highlight = 'default',
  onClick,
}: {
  title: string;
  words: string[];
  highlight?: 'default' | 'accent' | 'red';
  onClick?: (w: string) => void;
}) {
  if (!words || words.length === 0) return null;
  const color =
    highlight === 'accent'
      ? 'bg-accent/10 text-ink-900 border-accent/30 hover:bg-accent hover:text-ink-900'
      : highlight === 'red'
      ? 'bg-red-50 text-red-800 border-red-100 hover:bg-red-100'
      : 'bg-ink-50 text-ink-800 border-ink-100 hover:bg-ink-100';

  const handleClick = (w: string) => {
    if (onClick) onClick(w);
    else navigator.clipboard.writeText(w).then(() => toast.success(`Copied "${w}"`));
  };

  return (
    <section className="bg-white border border-ink-100 rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {words.map((w) => (
          <button
            key={w}
            onClick={() => handleClick(w)}
            className={`text-xs border rounded px-2 py-1 ${color}`}
          >
            {w}
          </button>
        ))}
      </div>
    </section>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-ink-50 rounded p-2">
      <div className="text-[9px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="text-sm font-medium text-ink-800 capitalize">{value}</div>
    </div>
  );
}
