import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAssistant, type AssistantAction } from '@/lib/assistantContext';
import { Sun } from '@/components/decorations/GardenDecorations';

type Msg = { role: 'user' | 'assistant'; content: string; actions?: AssistantAction[] };

export default function AssistantOverlay() {
  const { open, closeAssistant, getContext, getCallbacks, initialPrompt } = useAssistant();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Seed with initial prompt when opened
  useEffect(() => {
    if (open) {
      setInput(initialPrompt || '');
      // Focus input after paint
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      // Clear on close
      setInput('');
    }
  }, [open, initialPrompt]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg: Msg = { role: 'user', content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const r = await api.assistant({
        message: text,
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        page_context: getContext(),
      });
      const assistantMsg: Msg = { role: 'assistant', content: r.reply || '(no reply)', actions: r.actions || [] };
      setMessages([...nextMessages, assistantMsg]);
      // Auto-execute safe actions (navigation, dictionary lookup, search)
      // Actions that modify user content (insert line, create song) require user click
    } catch (e: any) {
      setMessages([...nextMessages, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function runAction(a: AssistantAction) {
    const cbs = getCallbacks();
    try {
      switch (a.type) {
        case 'navigate':
          navigate(a.path);
          closeAssistant();
          break;
        case 'open_dictionary':
          navigate(`/app/dictionary`);
          sessionStorage.setItem('sw_assistant_dict_word', a.word);
          closeAssistant();
          toast.message(`Looking up "${a.word}"`);
          break;
        case 'search_bible':
          navigate(`/app/bible`);
          sessionStorage.setItem('sw_assistant_bible_q', a.query);
          closeAssistant();
          break;
        case 'search_poetry':
          navigate(`/app/poetry?q=${encodeURIComponent(a.theme)}`);
          closeAssistant();
          break;
        case 'create_song': {
          const rawSections = Array.isArray(a.sections) ? a.sections : [];
          const sections = rawSections.map((s) => ({
            id: crypto.randomUUID(),
            type: (s && typeof s.type === 'string' ? s.type : 'verse') as any,
            label: (s && typeof s.label === 'string' && s.label.trim()) ? s.label : 'Section',
            lines: (s && Array.isArray(s.lines) && s.lines.length > 0)
              ? s.lines.map((l) => String(l || '').trim()).filter(Boolean)
              : [''],
          }));
          if (sections.length === 0) {
            sections.push({
              id: crypto.randomUUID(),
              type: 'verse' as any,
              label: 'Verse 1',
              lines: [''],
            });
          }
          const song = await api.createSong({
            title: a.title || 'Untitled',
            sections: sections as any,
            notes: a.notes || '',
          });
          toast.success('Song created');
          closeAssistant();
          navigate(`/app/song/${song.id}`);
          break;
        }
        case 'editor_insert_line':
          if (!cbs.onInsertLine) {
            toast.error('Open a song first to insert a line');
            return;
          }
          cbs.onInsertLine(a.line);
          toast.success('Line inserted');
          break;
        case 'editor_replace_line':
          if (!cbs.onReplaceLine) {
            toast.error('Click a line in the editor first');
            return;
          }
          cbs.onReplaceLine(a.line);
          toast.success('Line replaced');
          break;
        case 'editor_append_section':
          if (!cbs.onAppendSection) {
            toast.error('Open a song first to add a section');
            return;
          }
          cbs.onAppendSection(a.section_type, a.label || a.section_type, a.lines);
          toast.success(`${a.section_type} added`);
          break;
        case 'editor_set_title':
          if (!cbs.onSetTitle) {
            toast.error('Open a song first to set the title');
            return;
          }
          cbs.onSetTitle(a.title);
          toast.success('Title updated');
          break;
        default:
          toast.message('Unknown action');
      }
    } catch (e: any) {
      toast.error(e.message || 'Action failed');
    }
  }

  if (!open) return null;

  const ctx = getContext();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-[12vh] px-2 sm:px-4 bg-meadow-900/30 backdrop-blur-sm"
      onClick={closeAssistant}
    >
      <div
        className="relative w-full max-w-2xl bg-white rounded-xl sm:rounded-2xl shadow-2xl border border-meadow-200 overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative sun in corner */}
        <Sun className="absolute -top-8 -right-8 opacity-30 pointer-events-none" size={140} />

        {/* Header */}
        <div className="relative px-5 py-3 border-b border-meadow-100 bg-sun-gradient flex items-center justify-between">
          <div>
            <div className="font-serif text-lg font-bold text-meadow-900">AI helper</div>
            <div className="text-[11px] text-meadow-600">
              on <span className="font-semibold">{ctx.page}</span>
              {ctx.summary && <> · {ctx.summary}</>}
            </div>
          </div>
          <button
            onClick={closeAssistant}
            className="text-meadow-500 hover:text-meadow-800 text-sm px-2"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-meadow-500 py-6">
              <div className="mb-3">Try asking:</div>
              <ul className="space-y-1.5 text-meadow-700">
                <li>• "Start a new song about leaving home"</li>
                <li>• "What's a rhyme for 'window'?"</li>
                <li>• "Add a bridge about forgiveness"</li>
                <li>• "Look up 'ember'"</li>
                <li>• "Find Bible verses about hope"</li>
                <li>• "What can I do with this word?"</li>
              </ul>
              <div className="mt-4 text-[11px] text-meadow-400">
                Toggle with <kbd className="px-1.5 py-0.5 bg-meadow-100 border border-meadow-200 rounded text-[10px]">⇧⌘K</kbd>
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
              <div
                className={
                  m.role === 'user'
                    ? 'max-w-[85%] bg-meadow-700 text-meadow-50 rounded-2xl rounded-br-sm px-4 py-2 text-sm'
                    : 'max-w-[90%] text-meadow-800 text-sm'
                }
              >
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>

                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {m.actions.map((a, j) => (
                      <ActionButton key={j} action={a} onRun={() => runAction(a)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="text-sm text-meadow-500 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-meadow-400 animate-pulse" />
              <span className="inline-block w-2 h-2 rounded-full bg-meadow-400 animate-pulse" style={{ animationDelay: '0.15s' }} />
              <span className="inline-block w-2 h-2 rounded-full bg-meadow-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-3 border-t border-meadow-100 bg-meadow-50 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); send(); }
            }}
            placeholder="Ask anything or give a command…"
            className="flex-1 bg-white border border-meadow-200 rounded-full px-4 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-5 py-2 bg-meadow-700 text-meadow-50 rounded-full hover:bg-meadow-800 text-sm font-medium disabled:opacity-40"
          >
            {loading ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ action, onRun }: { action: AssistantAction; onRun: () => void }) {
  const { label, preview, primary } = describeAction(action);
  return (
    <div className="bg-sun-100 border border-sun-200 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-[10px] uppercase tracking-wider text-meadow-600 font-semibold">{label}</div>
        <button
          onClick={onRun}
          className={`text-xs px-3 py-1 rounded-full font-medium ${
            primary
              ? 'bg-meadow-700 text-meadow-50 hover:bg-meadow-800'
              : 'bg-white border border-meadow-200 hover:bg-meadow-100'
          }`}
        >
          {primary ? 'Do it →' : 'Go'}
        </button>
      </div>
      {preview && <div className="text-sm text-meadow-800 font-serif italic">{preview}</div>}
    </div>
  );
}

function describeAction(a: AssistantAction): { label: string; preview?: string; primary: boolean } {
  switch (a.type) {
    case 'navigate':        return { label: `Open ${a.path}`, primary: false };
    case 'open_dictionary': return { label: `Look up "${a.word}"`, primary: false };
    case 'search_bible':    return { label: 'Search the Bible', preview: a.query, primary: false };
    case 'search_poetry':   return { label: 'Search poetry', preview: a.theme, primary: false };
    case 'create_song':     return { label: `Create song "${a.title || 'Untitled'}"`, preview: a.sections?.[0]?.lines?.[0], primary: true };
    case 'editor_insert_line':  return { label: 'Insert line', preview: `"${a.line}"`, primary: true };
    case 'editor_replace_line': return { label: 'Replace current line', preview: `"${a.line}"`, primary: true };
    case 'editor_append_section': return { label: `Add ${a.section_type}`, preview: a.lines?.[0] && `"${a.lines[0]}"`, primary: true };
    case 'editor_set_title': return { label: 'Set title', preview: a.title, primary: true };
    default: return { label: 'Action', primary: false };
  }
}
