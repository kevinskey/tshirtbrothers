import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, type Section, type Song, type User } from '@/lib/api';
import TopBar from '@/components/TopBar';
import SectionBlock from '@/components/SectionBlock';
import AIPanel from '@/components/AIPanel';
import { useRegisterPage } from '@/lib/assistantContext';
import VersionHistoryPanel from '@/components/VersionHistoryPanel';
import { getSongCached } from '@/lib/cachedApi';

type SaveState = 'saved' | 'saving' | 'dirty' | 'error';

export default function EditorPage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { id } = useParams<{ id: string }>();
  const songId = Number(id);

  const [song, setSong] = useState<Song | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [focusedLine, setFocusedLine] = useState<{ sectionId: string; index: number } | null>(null);
  const [selectedWord, setSelectedWord] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiOpenMobile, setAiOpenMobile] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);

  // Load song
  useEffect(() => {
    getSongCached(songId)
      .then(setSong)
      .catch((e) => toast.error(e.message));
  }, [songId]);

  // Autosave (debounced) whenever song changes via update()
  const scheduleSave = useCallback((next: Song) => {
    setSaveState('dirty');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.updateSong(next.id, {
          title: next.title,
          sections: next.sections,
          notes: next.notes,
          tempo_bpm: next.tempo_bpm,
          key_signature: next.key_signature,
        });
        setSaveState('saved');
      } catch (e: any) {
        setSaveState('error');
        toast.error(e.message);
      }
    }, 800);
  }, []);

  const update = useCallback((patch: Partial<Song>) => {
    setSong((curr) => {
      if (!curr) return curr;
      const next = { ...curr, ...patch } as Song;
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  // Section helpers
  function addSection(type: Section['type']) {
    if (!song) return;
    const label =
      type === 'verse' ? `Verse ${song.sections.filter((s) => s.type === 'verse').length + 1}` :
      type === 'chorus' ? 'Chorus' :
      type === 'pre-chorus' ? 'Pre-Chorus' :
      type === 'bridge' ? 'Bridge' :
      type === 'intro' ? 'Intro' : 'Outro';
    update({
      sections: [...song.sections, { id: crypto.randomUUID(), type, label, lines: [''] }],
    });
  }

  function updateSection(sectionId: string, patch: Partial<Section>) {
    if (!song) return;
    update({
      sections: song.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
    });
  }

  function deleteSection(sectionId: string) {
    if (!song) return;
    update({ sections: song.sections.filter((s) => s.id !== sectionId) });
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    if (!song) return;
    const idx = song.sections.findIndex((s) => s.id === sectionId);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= song.sections.length) return;
    const next = [...song.sections];
    [next[idx], next[target]] = [next[target], next[idx]];
    update({ sections: next });
  }

  // Receive a line suggestion → insert at focused position
  function insertLine(line: string) {
    if (!song || !focusedLine) {
      toast.message('Click a line first to choose where this goes');
      return;
    }
    const section = song.sections.find((s) => s.id === focusedLine.sectionId);
    if (!section) return;
    const lines = [...section.lines];
    // If the focused line is empty, replace it; otherwise insert after
    if (!lines[focusedLine.index]?.trim()) {
      lines[focusedLine.index] = line;
    } else {
      lines.splice(focusedLine.index + 1, 0, line);
    }
    updateSection(section.id, { lines });
  }

  function replaceLine(line: string) {
    if (!song || !focusedLine) return;
    const section = song.sections.find((s) => s.id === focusedLine.sectionId);
    if (!section) return;
    const lines = [...section.lines];
    lines[focusedLine.index] = line;
    updateSection(section.id, { lines });
  }

  // Fill the currently-focused section with AI-generated lines
  function fillCurrentSection(lines: string[]) {
    if (!song || !focusedLine) {
      toast.message('Click into a section first to choose where to fill');
      return;
    }
    const section = song.sections.find((s) => s.id === focusedLine.sectionId);
    if (!section) return;
    updateSection(section.id, { lines });
  }

  // Append a brand-new section at the end
  function appendSection(type: Section['type'], label: string, lines: string[]) {
    if (!song) return;
    const nextLabel =
      type === 'verse'
        ? `Verse ${song.sections.filter((s) => s.type === 'verse').length + 1}`
        : label;
    update({
      sections: [...song.sections, { id: crypto.randomUUID(), type, label: nextLabel, lines }],
    });
  }

  // Replace the entire song (from "Generate full song")
  function replaceSong(
    title: string | undefined,
    sections: { type: Section['type']; label: string; lines: string[] }[]
  ) {
    if (!song) return;
    update({
      title: title || song.title,
      sections: sections.map((s) => ({
        id: crypto.randomUUID(),
        type: s.type,
        label: s.label,
        lines: s.lines.length > 0 ? s.lines : [''],
      })),
    });
  }

  // Derive editor context values (safe when song is null)
  const currentLine = (song && focusedLine)
    ? song.sections.find((s) => s.id === focusedLine.sectionId)?.lines[focusedLine.index] || ''
    : '';
  const currentSection = (song && focusedLine)
    ? song.sections.find((s) => s.id === focusedLine.sectionId)
    : null;
  const prevLines = currentSection
    ? currentSection.lines.slice(0, (focusedLine?.index ?? 0)).filter((l) => l.trim())
    : [];

  // IMPORTANT: This hook MUST be called unconditionally on every render.
  // Don't move it after the `if (!song) return ...` guard or React will
  // crash the editor with a hook-count mismatch.
  useRegisterPage(
    {
      page: 'Editor',
      route: song ? `/app/song/${song.id}` : `/app/song/${songId}`,
      summary: song
        ? `Editing "${song.title}"${currentSection ? ` · cursor in ${currentSection.type}` : ''}`
        : 'Loading song…',
      data: song
        ? {
            song_title: song.title,
            current_line: currentLine,
            current_section_type: currentSection?.type,
            previous_lines: prevLines,
            all_sections: song.sections.map((s) => ({ type: s.type, label: s.label, lines: s.lines })),
          }
        : {},
    },
    {
      onInsertLine: insertLine,
      onReplaceLine: replaceLine,
      onAppendSection: (type, label, lines) => appendSection(type as Section['type'], label, lines),
      onSetTitle: (title) => update({ title }),
    }
  );

  if (!song) return <div className="p-12 text-meadow-400">Loading song…</div>;

  return (
    <div className="min-h-screen">
      <TopBar user={user} onLogout={onLogout} />

      <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between text-sm">
        <Link to="/app" className="text-meadow-500 hover:text-meadow-800">← All songs</Link>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setHistoryOpen(true)}
            className="text-xs text-meadow-500 hover:text-meadow-900 flex items-center gap-1"
            title="View and restore past versions"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" />
            </svg>
            History
          </button>
          <SaveIndicator state={saveState} />
        </div>
      </div>

      <VersionHistoryPanel
        songId={song.id}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onRestored={(restored) => setSong(restored)}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24 lg:pb-16 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 lg:gap-8">
        {/* Editor column */}
        <div>
          <input
            type="text"
            value={song.title}
            onChange={(e) => update({ title: e.target.value })}
            className="w-full font-serif text-3xl sm:text-4xl font-bold bg-transparent border-0 focus:outline-none mb-2"
            placeholder="Untitled"
          />

          {/* Song meta */}
          <div className="flex flex-wrap gap-4 mb-6 sm:mb-8 text-sm">
            <input
              type="text"
              value={song.key_signature || ''}
              onChange={(e) => update({ key_signature: e.target.value || null })}
              placeholder="Key (e.g. G major)"
              className="bg-transparent border-b border-meadow-200 focus:border-accent focus:outline-none px-0 py-1 text-meadow-700 placeholder:text-meadow-300 w-36"
            />
            <input
              type="number"
              value={song.tempo_bpm || ''}
              onChange={(e) => update({ tempo_bpm: e.target.value ? Number(e.target.value) : null })}
              placeholder="BPM"
              className="bg-transparent border-b border-meadow-200 focus:border-accent focus:outline-none px-0 py-1 text-meadow-700 placeholder:text-meadow-300 w-20"
            />
          </div>

          {/* Sections */}
          <div className="space-y-8">
            {song.sections.map((section, i) => (
              <SectionBlock
                key={section.id}
                section={section}
                canMoveUp={i > 0}
                canMoveDown={i < song.sections.length - 1}
                focusedLine={focusedLine?.sectionId === section.id ? focusedLine.index : null}
                onChange={(patch) => updateSection(section.id, patch)}
                onDelete={() => deleteSection(section.id)}
                onMoveUp={() => moveSection(section.id, -1)}
                onMoveDown={() => moveSection(section.id, 1)}
                onFocusLine={(index) => setFocusedLine({ sectionId: section.id, index })}
                onSelectWord={setSelectedWord}
              />
            ))}
          </div>

          {/* Add section */}
          <div className="mt-8 flex flex-wrap gap-2">
            {(['verse', 'pre-chorus', 'chorus', 'bridge', 'intro', 'outro'] as const).map((t) => (
              <button
                key={t}
                onClick={() => addSection(t)}
                className="px-3 py-1.5 text-xs border border-ink-200 rounded-md hover:bg-ink-100 capitalize"
              >
                + {t}
              </button>
            ))}
          </div>

          {/* Notes */}
          <div className="mt-10">
            <label className="block text-xs uppercase tracking-wider text-ink-400 mb-2">Notes</label>
            <textarea
              value={song.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Story, mood, references, arrangement ideas…"
              className="w-full min-h-[120px] bg-white border border-ink-100 rounded-md p-3 text-sm text-ink-800 focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* AI panel — sticky sidebar on desktop, bottom drawer on mobile */}
        <div
          className={`
            lg:block lg:sticky lg:top-6 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto lg:static lg:shadow-none lg:rounded-none lg:border-0 lg:bg-transparent
            ${aiOpenMobile
              ? 'fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto shadow-2xl rounded-t-2xl bg-meadow-50 border-t border-meadow-200'
              : 'hidden'}
          `}
        >
          {/* Mobile drawer handle */}
          <div className="lg:hidden sticky top-0 bg-meadow-50 border-b border-meadow-200 px-4 py-2 flex items-center justify-between z-10">
            <div className="text-xs text-meadow-500">AI co-writer</div>
            <button
              onClick={() => setAiOpenMobile(false)}
              className="text-meadow-500 hover:text-meadow-800 text-sm px-2 py-1"
              aria-label="Close AI panel"
            >
              ✕
            </button>
          </div>
          <div className="px-4 pb-4 lg:p-0">
            <AIPanel
              selectedWord={selectedWord}
              currentLine={currentLine}
              previousLines={prevLines}
              sectionType={currentSection?.type || 'verse'}
              existingSections={song.sections}
              onInsertLine={(l) => { insertLine(l); setAiOpenMobile(false); }}
              onReplaceLine={(l) => { replaceLine(l); setAiOpenMobile(false); }}
              onFillCurrentSection={(ls) => { fillCurrentSection(ls); setAiOpenMobile(false); }}
              onAppendSection={(t, lbl, ls) => { appendSection(t, lbl, ls); setAiOpenMobile(false); }}
              onReplaceSong={(t, s) => { replaceSong(t, s); setAiOpenMobile(false); }}
            />
          </div>
        </div>

        {/* Mobile floating button to open AI panel */}
        {!aiOpenMobile && (
          <button
            onClick={() => setAiOpenMobile(true)}
            className="lg:hidden fixed bottom-20 right-4 z-30 bg-meadow-700 text-meadow-50 rounded-full shadow-lg hover:bg-meadow-800 px-4 py-3 text-sm font-medium flex items-center gap-2"
            aria-label="Open AI co-writer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3 L13.5 9 L19.5 10.5 L13.5 12 L12 18 L10.5 12 L4.5 10.5 L10.5 9 Z" />
            </svg>
            AI co-writer
          </button>
        )}
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const label =
    state === 'saved' ? 'Saved' :
    state === 'saving' ? 'Saving…' :
    state === 'dirty' ? 'Unsaved changes' :
    'Save failed';
  const color =
    state === 'saved' ? 'text-ink-400' :
    state === 'saving' ? 'text-accent' :
    state === 'dirty' ? 'text-ink-600' :
    'text-red-600';
  return <span className={`text-xs ${color}`}>{label}</span>;
}
