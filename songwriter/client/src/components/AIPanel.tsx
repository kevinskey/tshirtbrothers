import { useState } from 'react';
import { toast } from 'sonner';
import { api, type Section } from '@/lib/api';

type Props = {
  selectedWord: string;
  currentLine: string;
  previousLines: string[];
  sectionType: string;
  existingSections: Section[];
  onInsertLine: (line: string) => void;
  onReplaceLine: (line: string) => void;
  onFillCurrentSection: (lines: string[]) => void;
  onAppendSection: (type: Section['type'], label: string, lines: string[]) => void;
  onReplaceSong: (
    title: string | undefined,
    sections: { type: Section['type']; label: string; lines: string[] }[]
  ) => void;
};

type Tab = 'rhymes' | 'next' | 'rewrite' | 'generate';

export default function AIPanel({
  selectedWord, currentLine, previousLines, sectionType, existingSections,
  onInsertLine, onReplaceLine, onFillCurrentSection, onAppendSection, onReplaceSong,
}: Props) {
  const [tab, setTab] = useState<Tab>('generate');
  const [style, setStyle] = useState('');

  return (
    <aside className="bg-white border border-meadow-200 rounded-xl p-4 sm:p-5 shadow-sm">
      <div className="hidden lg:flex items-center justify-between mb-4">
        <h2 className="font-serif text-lg font-semibold">AI co-writer</h2>
      </div>

      <div className="flex gap-1 mb-4 bg-meadow-100 rounded-md p-1">
        <TabBtn active={tab === 'generate'} onClick={() => setTab('generate')}>Generate</TabBtn>
        <TabBtn active={tab === 'rhymes'} onClick={() => setTab('rhymes')}>Rhymes</TabBtn>
        <TabBtn active={tab === 'next'} onClick={() => setTab('next')}>Next</TabBtn>
        <TabBtn active={tab === 'rewrite'} onClick={() => setTab('rewrite')}>Rewrite</TabBtn>
      </div>

      <div className="mb-4">
        <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">Style / mood (optional)</label>
        <input
          type="text"
          value={style}
          onChange={(e) => setStyle(e.target.value)}
          placeholder="e.g. folk ballad, heartbreak, gritty"
          className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-2 py-1.5 focus:outline-none focus:border-accent"
        />
      </div>

      {tab === 'generate' && (
        <GenerateTab
          style={style}
          sectionType={sectionType}
          existingSections={existingSections}
          onFillCurrentSection={onFillCurrentSection}
          onAppendSection={onAppendSection}
          onReplaceSong={onReplaceSong}
        />
      )}
      {tab === 'rhymes' && (
        <RhymeTab word={selectedWord} context={currentLine} style={style} />
      )}
      {tab === 'next' && (
        <NextLineTab
          previousLines={previousLines}
          sectionType={sectionType}
          style={style}
          onInsertLine={onInsertLine}
        />
      )}
      {tab === 'rewrite' && (
        <RewriteTab
          line={currentLine}
          context={previousLines.join(' / ')}
          onReplace={onReplaceLine}
        />
      )}
    </aside>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-xs py-1.5 rounded ${active ? 'bg-white shadow-sm text-ink-900 font-medium' : 'text-ink-400 hover:text-ink-800'}`}
    >
      {children}
    </button>
  );
}

// ── Generate (full song / section) ───────────────────────────────────────

type GenMode = 'song' | 'section';

function GenerateTab({
  style, sectionType, existingSections,
  onFillCurrentSection, onAppendSection, onReplaceSong,
}: {
  style: string;
  sectionType: string;
  existingSections: Section[];
  onFillCurrentSection: (lines: string[]) => void;
  onAppendSection: (type: Section['type'], label: string, lines: string[]) => void;
  onReplaceSong: (
    title: string | undefined,
    sections: { type: Section['type']; label: string; lines: string[] }[]
  ) => void;
}) {
  const [mode, setMode] = useState<GenMode>('section');
  const [topic, setTopic] = useState('');
  const [targetType, setTargetType] = useState<Section['type']>('verse');
  const [lineCount, setLineCount] = useState(4);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ lines: string[]; type: Section['type'] } | null>(null);
  const [songPreview, setSongPreview] = useState<
    { title?: string; sections: { type: Section['type']; label: string; lines: string[] }[] } | null
  >(null);

  async function generateSection() {
    setLoading(true);
    setPreview(null);
    try {
      const r = await api.generateSection({
        section_type: targetType,
        topic,
        style,
        existing_sections: existingSections.map((s) => ({ type: s.type, lines: s.lines })),
        line_count: lineCount,
      });
      setPreview({ lines: r.lines || [], type: targetType });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateSong() {
    if (!topic) {
      toast.message('Give the song a topic first');
      return;
    }
    setLoading(true);
    setSongPreview(null);
    try {
      const r = await api.generateSong({
        topic,
        style,
        structure: ['verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'],
        title_suggestion: true,
      });
      setSongPreview({ title: r.title, sections: r.sections || [] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex gap-1 mb-3 bg-ink-50 rounded-md p-1">
        <button
          onClick={() => setMode('section')}
          className={`flex-1 text-xs py-1.5 rounded ${mode === 'section' ? 'bg-white shadow-sm font-medium' : 'text-ink-400'}`}
        >
          A section
        </button>
        <button
          onClick={() => setMode('song')}
          className={`flex-1 text-xs py-1.5 rounded ${mode === 'song' ? 'bg-white shadow-sm font-medium' : 'text-ink-400'}`}
        >
          Full song
        </button>
      </div>

      <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">
        {mode === 'song' ? 'What\'s the song about?' : 'Topic / theme (optional if song has context)'}
      </label>
      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder={mode === 'song' ? 'A love song about a rainy Sunday…' : 'e.g. missing home'}
        className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-2 py-1.5 min-h-[60px] focus:outline-none focus:border-accent mb-3"
      />

      {mode === 'section' && (
        <>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">Type</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as Section['type'])}
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-2 py-1.5 focus:outline-none focus:border-accent"
              >
                <option value="verse">Verse</option>
                <option value="chorus">Chorus</option>
                <option value="pre-chorus">Pre-Chorus</option>
                <option value="bridge">Bridge</option>
                <option value="intro">Intro</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">Lines</label>
              <input
                type="number"
                min={2}
                max={12}
                value={lineCount}
                onChange={(e) => setLineCount(Number(e.target.value) || 4)}
                className="w-full text-sm bg-ink-50 border border-ink-100 rounded px-2 py-1.5 focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          <button
            onClick={generateSection}
            disabled={loading}
            className="w-full px-3 py-2 bg-ink-900 text-ink-50 text-sm rounded hover:bg-ink-800 disabled:opacity-40"
          >
            {loading ? 'Writing…' : `Generate ${targetType}`}
          </button>
        </>
      )}

      {mode === 'song' && (
        <button
          onClick={generateSong}
          disabled={loading}
          className="w-full px-3 py-2 bg-ink-900 text-ink-50 text-sm rounded hover:bg-ink-800 disabled:opacity-40"
        >
          {loading ? 'Writing your song…' : 'Generate full song'}
        </button>
      )}

      {preview && mode === 'section' && (
        <div className="mt-4 bg-ink-50 border border-ink-100 rounded p-3">
          <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-2">{preview.type}</div>
          <div className="font-serif text-sm text-ink-800 whitespace-pre-line mb-3">
            {preview.lines.join('\n')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onAppendSection(preview.type, `${preview.type[0].toUpperCase()}${preview.type.slice(1)}`, preview.lines);
                toast.success('Added to song');
                setPreview(null);
              }}
              className="flex-1 text-xs px-2 py-1.5 bg-white border border-ink-200 rounded hover:bg-accent hover:text-ink-900 font-medium"
            >
              Add as new section
            </button>
            {preview.type === sectionType && (
              <button
                onClick={() => {
                  onFillCurrentSection(preview.lines);
                  toast.success('Filled current section');
                  setPreview(null);
                }}
                className="flex-1 text-xs px-2 py-1.5 bg-white border border-ink-200 rounded hover:bg-accent hover:text-ink-900 font-medium"
              >
                Fill current
              </button>
            )}
          </div>
          <button
            onClick={generateSection}
            className="w-full mt-2 text-[11px] text-ink-400 hover:text-ink-800"
          >
            ↻ Try again
          </button>
        </div>
      )}

      {songPreview && mode === 'song' && (
        <div className="mt-4 bg-ink-50 border border-ink-100 rounded p-3">
          {songPreview.title && (
            <div className="font-serif text-lg font-bold mb-2">{songPreview.title}</div>
          )}
          {songPreview.sections.map((s, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1">{s.label || s.type}</div>
              <div className="font-serif text-sm text-ink-800 whitespace-pre-line">{s.lines.join('\n')}</div>
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                onReplaceSong(songPreview.title, songPreview.sections);
                toast.success('Song loaded');
                setSongPreview(null);
              }}
              className="flex-1 text-xs px-2 py-1.5 bg-white border border-ink-200 rounded hover:bg-accent hover:text-ink-900 font-medium"
            >
              Replace current song
            </button>
            <button
              onClick={generateSong}
              className="text-xs px-2 py-1.5 text-ink-400 hover:text-ink-800"
            >
              ↻ Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Rhymes ────────────────────────────────────────────────────────────────

function RhymeTab({ word, context, style }: { word: string; context: string; style: string }) {
  const [result, setResult] = useState<{ perfect: string[]; near: string[]; multi: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastWord, setLastWord] = useState('');

  async function find(w: string) {
    if (!w) return;
    setLoading(true);
    try {
      const r = await api.rhymes({ word: w, context, style });
      setResult(r);
      setLastWord(w);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          type="text"
          defaultValue={word}
          key={word}
          placeholder="Word to rhyme"
          className="flex-1 text-sm border border-ink-200 rounded px-2 py-1.5 focus:outline-none focus:border-accent"
          onKeyDown={(e) => { if (e.key === 'Enter') find((e.target as HTMLInputElement).value.trim()); }}
        />
        <button
          onClick={() => find(word)}
          disabled={!word || loading}
          className="px-3 py-1.5 bg-ink-900 text-ink-50 text-xs rounded hover:bg-ink-800 disabled:opacity-40"
        >
          {loading ? '…' : 'Find'}
        </button>
      </div>
      <p className="text-[11px] text-ink-400 mt-2">
        Tip: click a word in the editor to fill this field.
      </p>

      {result && (
        <div className="mt-4 space-y-4">
          <RhymeGroup title={`Perfect rhymes for "${lastWord}"`} words={result.perfect} />
          <RhymeGroup title="Near rhymes" words={result.near} />
          <RhymeGroup title="Multi-syllable" words={result.multi} />
        </div>
      )}
    </div>
  );
}

function RhymeGroup({ title, words }: { title: string; words: string[] }) {
  if (!words?.length) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-400 mb-1.5">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {words.map((w) => (
          <button
            key={w}
            onClick={() => navigator.clipboard.writeText(w).then(() => toast.success(`Copied "${w}"`))}
            className="text-xs bg-ink-50 hover:bg-accent hover:text-ink-900 border border-ink-100 rounded px-2 py-1"
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Next line ────────────────────────────────────────────────────────────

function NextLineTab({
  previousLines, sectionType, style, onInsertLine,
}: { previousLines: string[]; sectionType: string; style: string; onInsertLine: (s: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function suggest() {
    if (previousLines.length === 0) {
      toast.message('Write a line first, then ask for the next one');
      return;
    }
    setLoading(true);
    try {
      const r = await api.nextLine({
        previous_lines: previousLines,
        section_type: sectionType,
        style,
        count: 3,
      });
      setSuggestions(r.suggestions || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="text-xs text-ink-600 mb-2">
        Using <strong>{previousLines.length}</strong> prior line{previousLines.length !== 1 ? 's' : ''} in this {sectionType}.
      </div>
      <button
        onClick={suggest}
        disabled={loading}
        className="w-full px-3 py-2 bg-ink-900 text-ink-50 text-sm rounded hover:bg-ink-800 disabled:opacity-40"
      >
        {loading ? 'Thinking…' : 'Suggest next line'}
      </button>

      {suggestions.length > 0 && (
        <div className="mt-4 space-y-2">
          {suggestions.map((s, i) => (
            <div key={i} className="group flex items-start gap-2 bg-ink-50 border border-ink-100 rounded p-3">
              <div className="flex-1 font-serif text-sm text-ink-800">{s}</div>
              <button
                onClick={() => onInsertLine(s)}
                className="text-[11px] px-2 py-1 bg-white border border-ink-200 rounded hover:bg-accent hover:text-ink-900"
                title="Insert into the editor"
              >
                Use
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Rewrite ──────────────────────────────────────────────────────────────

function RewriteTab({ line, context, onReplace }: { line: string; context: string; onReplace: (s: string) => void }) {
  const [instruction, setInstruction] = useState('make it stronger');
  const [rewrites, setRewrites] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function go() {
    if (!line) {
      toast.message('Click a line in the editor first');
      return;
    }
    setLoading(true);
    try {
      const r = await api.rewrite({ line, instruction, context, count: 3 });
      setRewrites(r.rewrites || []);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="text-xs text-ink-400 mb-1">Rewriting</div>
      <div className="text-sm italic text-ink-600 mb-3 min-h-[1.5em]">
        {line ? `"${line}"` : '(click a line in the editor)'}
      </div>

      <label className="block text-[10px] uppercase tracking-wider text-ink-400 mb-1">Instruction</label>
      <input
        type="text"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        className="w-full text-sm border border-ink-200 rounded px-2 py-1.5 focus:outline-none focus:border-accent mb-3"
      />

      <button
        onClick={go}
        disabled={loading || !line}
        className="w-full px-3 py-2 bg-ink-900 text-ink-50 text-sm rounded hover:bg-ink-800 disabled:opacity-40"
      >
        {loading ? 'Rewriting…' : 'Get 3 rewrites'}
      </button>

      {rewrites.length > 0 && (
        <div className="mt-4 space-y-2">
          {rewrites.map((r, i) => (
            <div key={i} className="flex items-start gap-2 bg-ink-50 border border-ink-100 rounded p-3">
              <div className="flex-1 font-serif text-sm text-ink-800">{r}</div>
              <button
                onClick={() => onReplace(r)}
                className="text-[11px] px-2 py-1 bg-white border border-ink-200 rounded hover:bg-accent hover:text-ink-900"
              >
                Replace
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
