import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type User, type JournalEntry, type JournalSummary } from '@/lib/api';
import TopBar from '@/components/TopBar';
import PageBanner from '@/components/PageBanner';
import { useRegisterPage } from '@/lib/assistantContext';
import { listJournalCached, getJournalCached } from '@/lib/cachedApi';

type AskMode = 'recall' | 'themes' | 'inspire';

export default function JournalPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [entries, setEntries] = useState<JournalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [onThisDay, setOnThisDay] = useState<JournalSummary[]>([]);

  // Composer state
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [mood, setMood] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const saveTimer = useRef<number | undefined>(undefined);

  // Ask panel
  const [askOpen, setAskOpen] = useState(false);
  const [askQ, setAskQ] = useState('');
  const [askMode, setAskMode] = useState<AskMode>('recall');
  const [askReply, setAskReply] = useState<string>('');
  const [asking, setAsking] = useState(false);

  useRegisterPage({
    page: 'Journal',
    route: '/app/journal',
    summary: `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}${entry ? ` · viewing #${entry.id}` : ''}`,
    data: {
      recent_titles: entries.slice(0, 5).map((e) => e.title || e.preview.slice(0, 40)),
      current_entry: entry ? { id: entry.id, title: entry.title, body_preview: entry.body.slice(0, 300) } : null,
    },
  });

  useEffect(() => {
    refresh();
    api.onThisDay().then(setOnThisDay).catch(() => { /* noop */ });
  }, []);

  async function refresh(q?: string) {
    setLoading(true);
    try {
      const r = await listJournalCached(q);
      setEntries(r);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function openEntry(id: number) {
    try {
      const e = await getJournalCached(id);
      setSelectedId(id);
      setEntry(e);
      setTitle(e.title || '');
      setBody(e.body || '');
      setMood(e.mood || '');
      setSaveState('idle');
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  function newEntry() {
    setSelectedId(null);
    setEntry(null);
    setTitle('');
    setBody('');
    setMood('');
    setSaveState('idle');
  }

  // Autosave: 1s debounce. Creates on first change if no id, updates thereafter.
  useEffect(() => {
    if (saveState === 'idle' && !title && !body) return;
    setSaveState('dirty');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!title.trim() && !body.trim()) return;
      setSaveState('saving');
      try {
        if (selectedId) {
          const updated = await api.updateJournal(selectedId, { title, body, mood: mood || null });
          setEntry(updated);
        } else {
          const created = await api.createJournal({ title, body, mood: mood || null });
          setSelectedId(created.id);
          setEntry(created);
        }
        setSaveState('saved');
        refresh(query);
      } catch (e: any) {
        toast.error(e.message);
        setSaveState('dirty');
      }
    }, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, mood]);

  async function deleteEntry() {
    if (!selectedId) return;
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    try {
      await api.deleteJournal(selectedId);
      toast.success('Entry deleted');
      newEntry();
      refresh(query);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function askAI() {
    if (!askQ.trim()) return;
    setAsking(true);
    setAskReply('');
    try {
      const r = await api.askJournal({ question: askQ, mode: askMode });
      setAskReply(r.reply);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setAsking(false);
    }
  }

  const saveLabel = {
    idle: 'Start writing…',
    dirty: 'Unsaved',
    saving: 'Saving…',
    saved: 'Saved',
  }[saveState];

  const grouped = useMemo(() => groupByMonth(entries), [entries]);

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <PageBanner
        theme="sun"
        eyebrow="📓 Chronicle of musings"
        title="Journal"
        subtitle="A free, private writing space. Every entry is archived forever. Ask AI to remind you, find themes, or turn musings into songs."
      />

      <main className="max-w-6xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8">
        {/* Sidebar */}
        <aside className="space-y-4">
          <div className="flex gap-2">
            <button
              onClick={newEntry}
              className="flex-1 px-4 py-2 bg-meadow-700 text-meadow-50 rounded-full hover:bg-meadow-800 text-sm font-medium shadow-sm"
            >
              + New entry
            </button>
            <button
              onClick={() => setAskOpen((v) => !v)}
              className="px-4 py-2 bg-accent text-meadow-900 rounded-full hover:bg-accent-hover text-sm font-medium shadow-sm"
              title="Ask AI about your journal"
            >
              {askOpen ? '✕' : 'Ask AI'}
            </button>
          </div>

          {askOpen && (
            <div className="bg-sun-100 border border-sun-200 rounded-xl p-3 space-y-2">
              <div className="flex gap-1 bg-white/70 rounded-full p-0.5">
                {(['recall', 'themes', 'inspire'] as AskMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setAskMode(m)}
                    className={`flex-1 text-[11px] py-1 rounded-full capitalize ${askMode === m ? 'bg-meadow-700 text-meadow-50 font-medium' : 'text-meadow-600'}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <textarea
                value={askQ}
                onChange={(e) => setAskQ(e.target.value)}
                placeholder={
                  askMode === 'recall' ? 'What did I write about my dad?' :
                  askMode === 'themes' ? 'What keeps showing up?' :
                  'Pull a song idea from last month'
                }
                rows={3}
                className="w-full text-sm bg-white border border-meadow-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent"
              />
              <button
                onClick={askAI}
                disabled={asking || !askQ.trim()}
                className="w-full px-3 py-1.5 bg-meadow-700 text-meadow-50 rounded-full text-xs font-medium disabled:opacity-40"
              >
                {asking ? 'Thinking…' : 'Ask'}
              </button>
              {askReply && (
                <div className="text-sm text-meadow-800 whitespace-pre-wrap leading-relaxed bg-white/80 rounded-lg p-3 mt-2 border border-meadow-200">
                  {askReply}
                </div>
              )}
            </div>
          )}

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') refresh(query); }}
            placeholder="Search entries…"
            className="w-full text-sm bg-white border border-meadow-200 rounded-full px-4 py-2 focus:outline-none focus:border-accent"
          />

          {onThisDay.length > 0 && (
            <div className="bg-petal-300/20 border border-petal-300/50 rounded-xl p-3">
              <div className="text-[10px] uppercase tracking-wider text-meadow-600 font-semibold mb-2">
                🌸 On this day
              </div>
              <div className="space-y-1">
                {onThisDay.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => openEntry(e.id)}
                    className="w-full text-left text-xs text-meadow-800 hover:text-meadow-900 underline underline-offset-2"
                  >
                    {new Date(e.created_at).toLocaleDateString(undefined, { year: 'numeric' })} — {e.title || e.preview.slice(0, 40)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Grouped list */}
          <div className="space-y-4">
            {loading && <div className="text-sm text-meadow-500">Loading…</div>}
            {!loading && entries.length === 0 && (
              <div className="text-sm text-meadow-500">No entries yet. Start writing.</div>
            )}
            {Object.entries(grouped).map(([label, items]) => (
              <div key={label}>
                <div className="text-[10px] uppercase tracking-wider text-meadow-500 font-semibold mb-1.5">
                  {label}
                </div>
                <ul className="space-y-1">
                  {items.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => openEntry(e.id)}
                        className={`w-full text-left p-2 rounded-lg transition-colors ${
                          selectedId === e.id ? 'bg-meadow-200' : 'hover:bg-meadow-100'
                        }`}
                      >
                        <div className="font-medium text-sm text-meadow-900 truncate">
                          {e.title || e.preview.slice(0, 50)}
                        </div>
                        <div className="text-[10px] text-meadow-500 mt-0.5">
                          {new Date(e.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          {e.mood && <> · {e.mood}</>}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Composer */}
        <section className="bg-white border border-meadow-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[70vh]">
          <div className="px-6 py-3 border-b border-meadow-100 bg-meadow-50 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-xs text-meadow-500">
              {entry ? `Started ${new Date(entry.created_at).toLocaleString()}` : 'New entry'}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                placeholder="mood / feeling"
                className="text-xs bg-white border border-meadow-200 rounded-full px-3 py-1 focus:outline-none focus:border-accent w-40"
              />
              <span className={`text-xs ${saveState === 'saved' ? 'text-meadow-500' : saveState === 'saving' ? 'text-accent' : 'text-meadow-600'}`}>
                {saveLabel}
              </span>
              {selectedId && (
                <button
                  onClick={deleteEntry}
                  className="text-xs text-red-600 hover:text-red-800 px-2"
                >
                  Delete
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col px-8 py-6">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A title (optional)"
              className="w-full font-serif text-3xl font-bold bg-transparent border-0 focus:outline-none mb-4 text-meadow-900 placeholder:text-meadow-200"
            />
            <Link to="/app" className="hidden" aria-hidden>keep</Link>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Start writing… nothing here is shared. Come back later and the AI can help you remember, find themes, or pull ideas for songs."
              className="flex-1 w-full bg-transparent border-0 focus:outline-none font-serif text-lg leading-relaxed text-meadow-900 placeholder:text-meadow-300 resize-none"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function groupByMonth(entries: JournalSummary[]) {
  const out: Record<string, JournalSummary[]> = {};
  for (const e of entries) {
    const d = new Date(e.created_at);
    const label = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
    (out[label] ||= []).push(e);
  }
  return out;
}
