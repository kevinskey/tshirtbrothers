import { useAssistant } from '@/lib/assistantContext';

export default function AssistantFab() {
  const { openAssistant, open } = useAssistant();
  if (open) return null;

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform);
  const shortcut = isMac ? '⇧⌘K' : '⇧Ctrl+K';

  return (
    <button
      onClick={() => openAssistant()}
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 group flex items-center gap-2 pl-3 pr-4 py-3 bg-accent text-meadow-900 rounded-full shadow-lg hover:shadow-xl hover:bg-accent-hover transition-all"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      title={`AI helper (${shortcut})`}
    >
      <SparkleIcon />
      <span className="text-sm font-medium hidden sm:inline">Ask AI</span>
      <span className="text-[10px] opacity-70 hidden md:inline border border-meadow-600 rounded px-1.5 py-0.5">
        {shortcut}
      </span>
    </button>
  );
}

function SparkleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
      <path
        d="M12 3 L13.5 9 L19.5 10.5 L13.5 12 L12 18 L10.5 12 L4.5 10.5 L10.5 9 Z"
        fill="#f5c842"
      />
      <circle cx="19" cy="5" r="1.2" fill="#fde68a" />
      <circle cx="5" cy="17" r="0.9" fill="#fde68a" />
    </svg>
  );
}
