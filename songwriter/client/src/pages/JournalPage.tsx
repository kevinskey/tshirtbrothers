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

  // Mobile sidebar drawer
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      setDrawerOpen(false); // close mobile drawer after selection
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
    setDrawerOpen(false);
  }

  // Autosave
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

  const saveLabel = { idle: 'Start writing…', dirty: 'Unsaved', saving: 'Saving…', saved: 'Saved' }[saveState];
  const grouped = useMemo(() => groupByMonth(entries), [entries]);

  const sidebar = (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          onClick={newEntry}
          className="flex-1 px-4 py-2 bg-meadow-700 text-meadow-50 rounded-full hover:bg-meadow-800 text-sm font-medium shadow-sm"
        >
          + New entry
        </button>
        <button
          onClick={() => setAskOpen((v) => !v)}
          className="px-4 py-2 bg-accent text-meadow-900 rounded-full hover:bg-accent-hover text-sm font-medium shadow-sm whitespace-nowrap"
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
            className="w-full text-sm bg-white border border-meadow-200 rounded-lg px-3 py-2 focus:outline-none focus:border-accent resize-none"
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
          <div className="text-[10px] uppercase tracking-wider text-meadow-600 font-semibold mb-2">🌸 On this day</div>
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

      <div className="space-y-4">
        {loading && <div className="text-sm text-meadow-500">Loading…</div>}
        {!loading && entries.length === 0 && (
          <div className="text-sm text-meadow-500">No entries yet. Start writing.</div>
        )}
        {Object.entries(grouped).map(([label, items]) => (
          <div key={label}>
            <div className="text-[10px] uppercase tracking-wider text-meadow-500 font-semibold mb-1.5">{label}</div>
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
    </div>
  );

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <PageBanner
        theme="sun"
        eyebrow="📓 Chronicle of musings"
        title="Journal"
        subtitle="A free, private writing space. Every entry is archived forever."
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-4 sm:py-8 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 lg:gap-8">
        {/* Mobile-only toolbar above the composer */}
        <div className="lg:hidden flex items-center gap-2">
          <button
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-2 border border-meadow-200 bg-white rounded-full hover:bg-meadow-100 text-sm font-medium text-meadow-700"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            Archive ({entries.length})
          </button>
          <button
            onClick={newEntry}
            className="flex-1 px-4 py-2 bg-meadow-700 text-meadow-50 rounded-full hover:bg-meadow-800 text-sm font-medium shadow-sm"
          >
            + New entry
          </button>
        </div>

        {/* Sidebar (desktop only) */}
        <aside className="hidden lg:block">
          {sidebar}
        </aside>

        {/* Composer */}
        <section className="bg-white border border-meadow-200 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[60vh] lg:min-h-[70vh]">
          <div className="px-4 sm:px-6 py-2.5 border-b border-meadow-100 bg-meadow-50 flex items-center justify-between gap-2 text-xs flex-wrap min-h-[44px]">
            <div className="text-meadow-500 truncate flex-1 min-w-0">
              {entry
                ? `Started ${new Date(entry.created_at).toLocaleDateString()}`
                : 'New entry'}
            </div>
            <input
              type="text"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="mood"
              className="bg-white border border-meadow-200 rounded-full px-3 py-1 focus:outline-none focus:border-accent w-24 sm:w-32 flex-shrink-0"
            />
            <span
              className={`w-16 text-right flex-shrink-0 ${
                saveState === 'saved' ? 'text-meadow-500' :
                saveState === 'saving' ? 'text-accent' : 'text-meadow-600'
              }`}
            >
              {saveLabel}
            </span>
            {selectedId && (
              <button
                onClick={deleteEntry}
                className="text-red-600 hover:text-red-800 px-2 flex-shrink-0"
                title="Delete entry"
              >
                Delete
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col px-4 sm:px-8 py-4 sm:py-6">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A title (optional)"
              className="w-full font-serif text-2xl sm:text-3xl font-bold bg-transparent border-0 focus:outline-none mb-3 sm:mb-4 text-meadow-900 placeholder:text-meadow-200"
            />
            <Link to="/app" className="hidden" aria-hidden>keep</Link>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Start writing… come back later and the AI can help you remember, find themes, or pull ideas for songs."
              className="flex-1 w-full bg-transparent border-0 focus:outline-none font-serif text-base sm:text-lg leading-relaxed text-meadow-900 placeholder:text-meadow-300 resize-none min-h-[40vh]"
            />
          </div>
        </section>
      </main>

      {/* Mobile archive drawer */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-meadow-900/30 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="absolute top-0 left-0 bottom-0 w-[min(320px,85vw)] bg-meadow-50 shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-meadow-50 border-b border-meadow-200 px-4 py-3 flex items-center justify-between">
              <div className="font-serif text-lg font-bold text-meadow-900">Archive</div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-meadow-500 hover:text-meadow-800 text-sm px-2 py-1"
                aria-label="Close archive"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              {sidebar}
            </div>
          </div>
        </div>
      )}
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
