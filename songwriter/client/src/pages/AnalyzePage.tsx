import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type SongAnalysis, type User, type Section } from '@/lib/api';
import TopBar from '@/components/TopBar';

type InputMode = 'paste' | 'lookup';

export default function AnalyzePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();

  const [mode, setMode] = useState<InputMode>('paste');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [analysis, setAnalysis] = useState<SongAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [newTopic, setNewTopic] = useState('');
  const [newStyle, setNewStyle] = useState('');
  const [keepTone, setKeepTone] = useState(true);
  const [generating, setGenerating] = useState(false);

  async function analyze() {
    if (mode === 'paste' && !lyrics.trim()) {
      toast.message('Paste the lyrics first');
      return;
    }
    if (mode === 'lookup' && (!title.trim() || !artist.trim())) {
      toast.message('Enter both a title and an artist');
      return;
    }
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const r = await api.analyzeSong({
        lyrics: mode === 'paste' ? lyrics : undefined,
        title: title || undefined,
        artist: artist || undefined,
      });
      setAnalysis(r);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function generateModeled() {
    if (!analysis) return;
    if (!newTopic.trim()) {
      toast.message('Enter a topic for your new song');
      return;
    }
    setGenerating(true);
    try {
      const r = await api.generateFromModel({
        analysis,
        new_topic: newTopic,
        new_style: newStyle,
        keep_tone: keepTone,
      });

      const sections: Section[] = (r.sections || []).map((s) => ({
        id: crypto.randomUUID(),
        type: s.type,
        label: s.label,
        lines: s.lines.length > 0 ? s.lines : [''],
      }));

      const song = await api.createSong({
        title: r.title || `Song modeled on ${analysis.song_title || 'source'}`,
        sections,
        notes: [
          `Modeled on "${analysis.song_title || '(pasted lyrics)'}"${analysis.artist ? ` — ${analysis.artist}` : ''}`,
          analysis.template_summary ? `\nTemplate: ${analysis.template_summary}` : '',
          r.notes ? `\n${r.notes}` : '',
        ].filter(Boolean).join(''),
      });
      toast.success('New song created');
      navigate(`/app/song/${song.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <main className="max-w-4xl mx-auto px-8 py-12">
        <div className="mb-2 text-sm">
          <Link to="/app" className="text-ink-400 hover:text-ink-800">← All songs</Link>
        </div>
        <h1 className="font-serif text-4xl font-bold mb-2">Analyze &amp; model</h1>
        <p className="text-ink-600 mb-8">
          Study any song — structure, rhyme, meter, imagery — then write a new song using it as a template.
        </p>

        {/* Input */}
        <section className="bg-white border border-ink-100 rounded-lg p-5 mb-8">
          <div className="flex gap-1 mb-4 bg-ink-50 rounded-md p-1 max-w-sm">
            <button
              onClick={() => setMode('paste')}
              className={`flex-1 text-xs py-1.5 rounded ${mode === 'paste' ? 'bg-white shadow-sm font-medium' : 'text-ink-400'}`}
            >
              Paste lyrics
            </button>
            <button
              onClick={() => setMode('lookup')}
              className={`flex-1 text-xs py-1.5 rounded ${mode === 'lookup' ? 'bg-white shadow-sm font-medium' : 'text-ink-400'}`}
            >
              By title / artist
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                Song title {mode === 'lookup' && '*'}
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Hallelujah"
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                Artist {mode === 'lookup' && '*'}
              </label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="e.g. Leonard Cohen"
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          {mode === 'paste' && (
            <div className="mb-3">
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                Lyrics *
              </label>
              <textarea
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="Paste the full lyrics here…"
                rows={12}
                className="w-full text-sm font-serif bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent whitespace-pre-wrap"
              />
            </div>
          )}

          <button
            onClick={analyze}
            disabled={analyzing}
            className="px-6 py-2 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 text-sm font-medium disabled:opacity-40"
          >
            {analyzing ? 'Analyzing…' : 'Analyze song'}
          </button>
          {mode === 'lookup' && (
            <p className="text-[11px] text-ink-400 mt-2">
              Note: results based on what the AI recalls. For best accuracy, paste the lyrics.
            </p>
          )}
        </section>

        {/* Analysis result */}
        {analysis && (
          <section className="bg-white border border-ink-100 rounded-lg p-5 mb-8">
            <div className="mb-4">
              <h2 className="font-serif text-2xl font-bold">
                {analysis.song_title || 'Analysis'}
                {analysis.artist && <span className="text-ink-400 font-normal"> — {analysis.artist}</span>}
              </h2>
              {analysis.confidence_note && (
                <p className="text-xs italic text-amber-700 mt-1">⚠ {analysis.confidence_note}</p>
              )}
            </div>

            {analysis.template_summary && (
              <div className="bg-accent/10 border border-accent/30 rounded p-3 mb-5">
                <div className="text-[10px] uppercase tracking-wider text-accent mb-1 font-semibold">The recipe</div>
                <p className="text-sm text-ink-800">{analysis.template_summary}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
              {analysis.structure && (
                <Field label="Structure">
                  <div className="flex flex-wrap gap-1">
                    {analysis.structure.map((s, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-ink-100 rounded">{s}</span>
                    ))}
                  </div>
                </Field>
              )}

              {analysis.rhyme_scheme && (
                <Field label="Rhyme scheme">
                  <div className="space-y-0.5">
                    {analysis.rhyme_scheme.verse && <div><span className="text-ink-400">Verse:</span> {analysis.rhyme_scheme.verse}</div>}
                    {analysis.rhyme_scheme.chorus && <div><span className="text-ink-400">Chorus:</span> {analysis.rhyme_scheme.chorus}</div>}
                    {analysis.rhyme_scheme.bridge && <div><span className="text-ink-400">Bridge:</span> {analysis.rhyme_scheme.bridge}</div>}
                  </div>
                </Field>
              )}

              {analysis.meter_description && (
                <Field label="Meter"><span>{analysis.meter_description}</span></Field>
              )}

              {analysis.pov && (
                <Field label="POV / tense">
                  <span>{analysis.pov}{analysis.tense ? ` · ${analysis.tense}` : ''}</span>
                </Field>
              )}

              {analysis.tone && <Field label="Tone"><span>{analysis.tone}</span></Field>}

              {analysis.hook && (
                <Field label="Hook"><span className="font-serif italic">"{analysis.hook}"</span></Field>
              )}

              {analysis.themes && analysis.themes.length > 0 && (
                <Field label="Themes">
                  <div className="flex flex-wrap gap-1">
                    {analysis.themes.map((t, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-ink-100 rounded">{t}</span>
                    ))}
                  </div>
                </Field>
              )}

              {analysis.key_imagery && analysis.key_imagery.length > 0 && (
                <Field label="Key imagery">
                  <div className="flex flex-wrap gap-1">
                    {analysis.key_imagery.map((t, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-ink-100 rounded">{t}</span>
                    ))}
                  </div>
                </Field>
              )}

              {analysis.devices && analysis.devices.length > 0 && (
                <Field label="Devices">
                  <div className="flex flex-wrap gap-1">
                    {analysis.devices.map((t, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 bg-ink-100 rounded">{t}</span>
                    ))}
                  </div>
                </Field>
              )}
            </div>

            {analysis.why_it_works && (
              <div className="mt-5 pt-4 border-t border-ink-100">
                <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">Why it works</div>
                <p className="text-sm text-ink-800">{analysis.why_it_works}</p>
              </div>
            )}
          </section>
        )}

        {/* Use as model */}
        {analysis && (
          <section className="bg-white border border-ink-100 rounded-lg p-5">
            <h2 className="font-serif text-2xl font-bold mb-1">Use as a model</h2>
            <p className="text-sm text-ink-600 mb-4">
              Write a new, original song that follows the same structure, rhyme scheme, and meter — but about your topic.
            </p>

            <div className="mb-3">
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                What should your new song be about? *
              </label>
              <textarea
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="e.g. finally forgiving my father"
                rows={2}
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-start mb-4">
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
                  Style / mood (optional — overrides the model's tone)
                </label>
                <input
                  type="text"
                  value={newStyle}
                  onChange={(e) => setNewStyle(e.target.value)}
                  placeholder="e.g. country ballad, raw and stripped down"
                  className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-3 py-2 focus:outline-none focus:border-accent"
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs text-ink-600 mt-6 md:mt-0">
                <input
                  type="checkbox"
                  checked={keepTone}
                  onChange={(e) => setKeepTone(e.target.checked)}
                />
                Keep original tone & POV
              </label>
            </div>

            <button
              onClick={generateModeled}
              disabled={generating || !newTopic.trim()}
              className="px-6 py-2.5 bg-accent text-ink-900 rounded-md hover:bg-accent-hover font-medium disabled:opacity-40"
            >
              {generating ? 'Writing your song…' : 'Write the new song →'}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">{label}</div>
      <div className="text-ink-800">{children}</div>
    </div>
  );
}
