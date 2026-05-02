/**
 * Phase 2 PR #10 — Layers panel for the Fabric design studio.
 *
 * Renders a right-rail list of every element on the current side, in
 * top-of-canvas-first order (Photoshop convention: the visually-topmost
 * element sits at the top of the panel). Per row: small thumbnail / icon,
 * a derived name, reorder buttons, and delete.
 *
 * Behavior is wired through the page's existing array-order helpers
 * (bringForward / sendBackward / removeElement) which the FabricRendererBridge
 * already mirrors into Fabric — so this panel doesn't need to know about
 * Fabric directly.
 *
 * Scope:
 *   - Click a row → select that element (the bridge then calls
 *     canvas.setActiveObject under the hood).
 *   - ↑ / ↓ buttons reorder one position. ⤒ / ⤓ buttons jump to top / bottom.
 *   - Delete (🗑) removes the element.
 *
 * Out of scope (future Phase 2 PRs):
 *   - Drag-and-drop reorder (kept as buttons for PR #10 simplicity).
 *   - Lock / visibility toggles per row (would need new DesignElement fields).
 *   - Rename (current name is derived from type / content).
 *
 * Mobile: this PR ships desktop-only (md:block). The mobile layout port is a
 * separate PR — there's no good answer for "left tool panel + right layers
 * panel + canvas + bottom toolbar" on a 375px screen without redesigning
 * the panel system.
 */

import { Trash2, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, Type, Image as ImageIcon } from 'lucide-react';

interface DesignElement {
  id: string;
  type: 'image' | 'text';
  side?: 'front' | 'back' | 'sleeve';
  content: string;
  fontFamily?: string;
}

interface LayersPanelProps {
  elements: DesignElement[];
  currentView: 'front' | 'back' | 'sleeve';
  selectedElementId: string | null;
  onSelect: (id: string) => void;
  onBringForward: (id: string) => void;
  onSendBackward: (id: string) => void;
  onBringToFront: (id: string) => void;
  onSendToBack: (id: string) => void;
  onRemove: (id: string) => void;
}

export function LayersPanel(props: LayersPanelProps) {
  // Filter to current side, then reverse so the top of the panel is the
  // top-of-canvas (last-painted) element. Fabric paints in array order,
  // so designElements[N-1] is the topmost layer visually.
  const sideEls = props.elements.filter(
    (el) => (el.side ?? 'front') === props.currentView,
  );
  const reversed = [...sideEls].reverse();

  return (
    <aside className="hidden md:flex fixed right-0 top-16 bottom-0 w-72 bg-white border-l border-gray-200 z-30 flex-col">
      <header className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Layers</h2>
        <span className="text-xs text-gray-400">{sideEls.length}</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {reversed.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">
            No elements on this side yet.
          </div>
        ) : (
          <ul className="py-1">
            {reversed.map((el) => {
              const isSelected = props.selectedElementId === el.id;
              return (
                <li
                  key={el.id}
                  className={`group flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2 ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-transparent hover:bg-gray-50'
                  }`}
                  onClick={() => props.onSelect(el.id)}
                >
                  <Thumbnail el={el} />
                  <span
                    className={`flex-1 text-sm truncate ${
                      isSelected ? 'text-blue-900 font-medium' : 'text-gray-700'
                    }`}
                  >
                    {deriveName(el)}
                  </span>

                  <div
                    className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <RowButton title="Bring to front" onClick={() => props.onBringToFront(el.id)}>
                      <ChevronsUp className="h-3.5 w-3.5" />
                    </RowButton>
                    <RowButton title="Bring forward" onClick={() => props.onBringForward(el.id)}>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </RowButton>
                    <RowButton title="Send backward" onClick={() => props.onSendBackward(el.id)}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </RowButton>
                    <RowButton title="Send to back" onClick={() => props.onSendToBack(el.id)}>
                      <ChevronsDown className="h-3.5 w-3.5" />
                    </RowButton>
                    <RowButton title="Delete" onClick={() => props.onRemove(el.id)} danger>
                      <Trash2 className="h-3.5 w-3.5" />
                    </RowButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="px-4 py-2 border-t border-gray-200 text-[11px] text-gray-400">
        Top of list = top of canvas
      </footer>
    </aside>
  );
}

function RowButton({
  title,
  onClick,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1 rounded ${
        danger
          ? 'text-red-500 hover:bg-red-50'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

function Thumbnail({ el }: { el: DesignElement }) {
  if (el.type === 'image' && el.content) {
    return (
      <img
        src={el.content}
        alt=""
        className="w-9 h-9 rounded object-cover bg-gray-100 border border-gray-200 flex-shrink-0"
        draggable={false}
      />
    );
  }
  if (el.type === 'text') {
    return (
      <div className="w-9 h-9 rounded bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
        <Type className="h-4 w-4 text-gray-500" />
      </div>
    );
  }
  return (
    <div className="w-9 h-9 rounded bg-gray-100 border border-gray-200 flex items-center justify-center flex-shrink-0">
      <ImageIcon className="h-4 w-4 text-gray-400" />
    </div>
  );
}

function deriveName(el: DesignElement): string {
  if (el.type === 'text') {
    const trimmed = (el.content ?? '').trim();
    if (!trimmed) return 'Text';
    return trimmed.length > 30 ? trimmed.slice(0, 30) + '…' : trimmed;
  }
  if (el.type === 'image') {
    // For uploaded images we only have the URL — use the basename.
    if (!el.content) return 'Image';
    if (el.content.startsWith('data:')) return 'Image (uploaded)';
    try {
      const u = new URL(el.content);
      const base = u.pathname.split('/').pop() ?? 'Image';
      return base.length > 28 ? base.slice(0, 28) + '…' : base;
    } catch {
      return 'Image';
    }
  }
  return 'Element';
}
