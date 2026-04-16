import { useRef } from 'react';
import type { Section } from '@/lib/api';
import { countSyllables } from '@/lib/syllables';

type Props = {
  section: Section;
  canMoveUp: boolean;
  canMoveDown: boolean;
  focusedLine: number | null;
  onChange: (patch: Partial<Section>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onFocusLine: (index: number) => void;
  onSelectWord: (word: string) => void;
};

const TYPE_COLORS: Record<Section['type'], string> = {
  verse: 'text-ink-600',
  'pre-chorus': 'text-amber-700',
  chorus: 'text-accent',
  bridge: 'text-purple-700',
  intro: 'text-ink-400',
  outro: 'text-ink-400',
};

export default function SectionBlock({
  section, canMoveUp, canMoveDown, focusedLine,
  onChange, onDelete, onMoveUp, onMoveDown, onFocusLine, onSelectWord,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  function updateLine(i: number, value: string) {
    const lines = [...section.lines];
    lines[i] = value;
    onChange({ lines });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const lines = [...section.lines];
      lines.splice(i + 1, 0, '');
      onChange({ lines });
      // Focus next line after state update
      setTimeout(() => {
        const inputs = containerRef.current?.querySelectorAll<HTMLInputElement>('input.lyric-line');
        inputs?.[i + 1]?.focus();
      }, 0);
    } else if (e.key === 'Backspace' && section.lines[i] === '' && section.lines.length > 1) {
      e.preventDefault();
      const lines = section.lines.filter((_, idx) => idx !== i);
      onChange({ lines });
      setTimeout(() => {
        const inputs = containerRef.current?.querySelectorAll<HTMLInputElement>('input.lyric-line');
        inputs?.[Math.max(0, i - 1)]?.focus();
      }, 0);
    }
  }

  function handleMouseUp(e: React.MouseEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    if (start !== end) {
      const selected = input.value.slice(start, end).trim();
      if (selected && /^[a-zA-Z'-]+$/.test(selected)) onSelectWord(selected);
    } else {
      // Pick the word under cursor
      const value = input.value;
      let l = start, r = start;
      while (l > 0 && /[a-zA-Z'-]/.test(value[l - 1])) l--;
      while (r < value.length && /[a-zA-Z'-]/.test(value[r])) r++;
      const word = value.slice(l, r);
      if (word) onSelectWord(word);
    }
  }

  return (
    <div ref={containerRef} className="group">
      <div className="flex items-center gap-2 mb-2">
        <input
          type="text"
          value={section.label || ''}
          onChange={(e) => onChange({ label: e.target.value })}
          className={`font-sans text-xs font-semibold uppercase tracking-widest bg-transparent border-0 focus:outline-none w-auto min-w-[5rem] ${TYPE_COLORS[section.type]}`}
          placeholder={section.type}
        />
        <div className="flex-1 h-px bg-ink-100" />
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
          <button onClick={onMoveUp} disabled={!canMoveUp} className="text-xs text-ink-400 hover:text-ink-800 disabled:opacity-30 px-1">↑</button>
          <button onClick={onMoveDown} disabled={!canMoveDown} className="text-xs text-ink-400 hover:text-ink-800 disabled:opacity-30 px-1">↓</button>
          <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 px-1">×</button>
        </div>
      </div>

      <div>
        {section.lines.map((line, i) => (
          <div key={i} className="flex items-center gap-3 group/line">
            <input
              type="text"
              value={line}
              onChange={(e) => updateLine(i, e.target.value)}
              onFocus={() => onFocusLine(i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              onMouseUp={handleMouseUp}
              className={`lyric-line ${focusedLine === i ? 'border-accent' : ''}`}
              placeholder={i === 0 ? 'Start writing…' : ''}
            />
            <span className="text-[10px] text-ink-200 group-hover/line:text-ink-400 w-6 text-right tabular-nums">
              {line ? countSyllables(line) : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
