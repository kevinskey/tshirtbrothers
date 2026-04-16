// Global context the AI assistant reads from every page.
// Pages "register" what the assistant can see + commands it can call.

import { createContext, useCallback, useContext, useMemo, useRef, useState, ReactNode, useEffect } from 'react';

export type PageContext = {
  page: string;                 // human name, e.g. "Editor", "Dictionary"
  route: string;                // e.g. "/app/song/12"
  summary?: string;             // one-line description of what user is looking at
  data?: Record<string, any>;   // page-specific data the AI can read
};

export type AssistantAction =
  | { type: 'navigate'; path: string }
  | { type: 'create_song'; title?: string; sections?: { type: string; label: string; lines: string[] }[]; notes?: string }
  | { type: 'editor_insert_line'; line: string }
  | { type: 'editor_replace_line'; line: string }
  | { type: 'editor_append_section'; section_type: string; label?: string; lines: string[] }
  | { type: 'editor_set_title'; title: string }
  | { type: 'open_dictionary'; word: string }
  | { type: 'search_bible'; query: string }
  | { type: 'search_poetry'; theme: string };

export type PageCallbacks = {
  onInsertLine?: (line: string) => void;
  onReplaceLine?: (line: string) => void;
  onAppendSection?: (section_type: string, label: string, lines: string[]) => void;
  onSetTitle?: (title: string) => void;
};

type AssistantState = {
  open: boolean;
  openAssistant: (initialPrompt?: string) => void;
  closeAssistant: () => void;
  setContext: (ctx: PageContext) => void;
  getContext: () => PageContext;
  setCallbacks: (cbs: PageCallbacks) => void;
  getCallbacks: () => PageCallbacks;
  initialPrompt: string;
};

const AssistantCtx = createContext<AssistantState | null>(null);

export function useAssistant() {
  const ctx = useContext(AssistantCtx);
  if (!ctx) throw new Error('useAssistant must be used inside AssistantProvider');
  return ctx;
}

// Hook for pages to register context & optional callbacks
export function useRegisterPage(ctx: PageContext, callbacks: PageCallbacks = {}) {
  const { setContext, setCallbacks } = useAssistant();
  // Serialize deps to a string so the effect only re-runs on real changes
  const ctxKey = JSON.stringify(ctx);

  useEffect(() => {
    setContext(ctx);
    setCallbacks(callbacks);
    // On unmount, clear callbacks (page-specific) but leave context for the next page to overwrite
    return () => {
      setCallbacks({});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxKey]);
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState('');
  const contextRef = useRef<PageContext>({ page: 'Unknown', route: '/' });
  const callbacksRef = useRef<PageCallbacks>({});

  const openAssistant = useCallback((prompt?: string) => {
    setInitialPrompt(prompt || '');
    setOpen(true);
  }, []);
  const closeAssistant = useCallback(() => setOpen(false), []);

  const setContext = useCallback((ctx: PageContext) => { contextRef.current = ctx; }, []);
  const getContext = useCallback(() => contextRef.current, []);
  const setCallbacks = useCallback((cbs: PageCallbacks) => { callbacksRef.current = cbs; }, []);
  const getCallbacks = useCallback(() => callbacksRef.current, []);

  // Global hotkey: Shift+Cmd+K (Mac) / Shift+Ctrl+K (Win/Linux)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = /Mac|iPhone|iPad/i.test(navigator.platform);
      const modifierPressed = isMac ? e.metaKey : e.ctrlKey;
      if (modifierPressed && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const value = useMemo<AssistantState>(() => ({
    open, openAssistant, closeAssistant, setContext, getContext, setCallbacks, getCallbacks, initialPrompt,
  }), [open, openAssistant, closeAssistant, setContext, getContext, setCallbacks, getCallbacks, initialPrompt]);

  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>;
}
