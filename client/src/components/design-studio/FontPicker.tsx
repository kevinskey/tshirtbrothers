/**
 * Phase 2 PR #12 — searchable, categorized font picker.
 *
 * Replaces the wall-of-text 100+-item dropdown with a UI you can actually
 * navigate: a search input, category chips, and rows that render each font
 * name in its own face so you can pick by look instead of by remembered
 * name.
 *
 * Performance: 100+ DOM rows is fine for a picker that's only mounted when
 * a user clicks "Font" — no virtualization needed at this scale. Each row
 * lazy-loads its font on hover (via the page's loadGoogleFont function the
 * caller passes in as a prop), so the network cost is also progressive.
 *
 * The component is renderer-agnostic — works in both legacy and Fabric
 * mode. Selection is communicated via onSelect(fontName); the page wires
 * it to updateElement.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { FONT_CATALOG, FONT_CATEGORIES, type FontCategory } from './fontCatalog';

interface FontPickerProps {
  /** Current font name (for highlighting the selected row). */
  selectedFont: string;
  /** Called when the user picks a font. The page wires this to updateElement. */
  onSelect: (fontName: string) => void;
  /** The page's Google Fonts loader. Hover triggers a load; click awaits it. */
  loadFont: (name: string) => Promise<void>;
  /** Page-supplied callback to bump a counter that re-renders text after a font loads. */
  onFontReady?: () => void;
  /** Optional CSS class on the outer wrapper, for popup vs side-panel sizing. */
  className?: string;
  /** Auto-focus the search input on mount. Useful inside popups. */
  autoFocus?: boolean;
}

export function FontPicker(props: FontPickerProps) {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<FontCategory | 'all'>('all');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (props.autoFocus) inputRef.current?.focus();
  }, [props.autoFocus]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FONT_CATALOG.filter((f) => {
      if (activeCat !== 'all' && f.category !== activeCat) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [query, activeCat]);

  return (
    <div className={`flex flex-col bg-white ${props.className ?? ''}`}>
      {/* Search */}
      <div className="relative px-2 pt-2">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fonts…"
          className="w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1 px-2 py-2 border-b border-gray-100">
        <Chip
          active={activeCat === 'all'}
          onClick={() => setActiveCat('all')}
          label="All"
        />
        {FONT_CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            active={activeCat === c.id}
            onClick={() => setActiveCat(c.id)}
            label={c.label}
          />
        ))}
      </div>

      {/* Font list */}
      <div className="flex-1 overflow-y-auto max-h-72">
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-gray-400">
            No fonts match "{query}"
          </div>
        ) : (
          filtered.map((f) => {
            const isSelected = props.selectedFont === f.name;
            return (
              <button
                key={f.name}
                type="button"
                onMouseEnter={() => {
                  // Best-effort preload. Errors are swallowed by the loader.
                  props.loadFont(f.name);
                }}
                onClick={() => {
                  props.loadFont(f.name).then(() => props.onFontReady?.());
                  props.onSelect(f.name);
                }}
                className={`w-full text-left px-3 py-2 text-sm transition border-l-2 ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 text-blue-900 font-semibold'
                    : 'border-transparent text-gray-700 hover:bg-blue-50'
                }`}
                style={{ fontFamily: f.name }}
              >
                {f.name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}
