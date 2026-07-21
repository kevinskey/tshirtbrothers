// High-level design studio composite.
//
// Consumers pass a product (TB blank), an optional brand theme, and a save
// callback. The component owns the Fabric canvas lifecycle, the tool
// toolbar, and a contextual side panel for the active element. Everything
// tenant-specific enters via props; nothing about GleeWorld — or any
// specific tenant — is baked in.
//
// Distinct from the more powerful DesignStudioPage in the TSB storefront
// (which layers on product catalog + pricing + invoice mockup + admin
// fittings). This composite is the shared authoring surface — the piece
// consumers actually embed. When TB's own DesignStudioPage eventually
// migrates onto this composite, we'll delete the toolbar duplication that
// exists in both today.
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { IText, Rect, Circle, Triangle } from 'fabric';
import type { Canvas as FabricCanvas, FabricObject } from 'fabric';
import { FabricDesignCanvas } from './design-studio/FabricDesignCanvas';
import { loadFabricImage } from '../lib/fabric/loadImage';
import { serializeCanvas } from '../lib/fabric/serializeJson';
import type { CanvasHandle } from './design-studio/types';
import {
  MERCH_DESIGN_SCHEMA_VERSION,
  type MerchDesign,
  type PrintAreaName,
  type PrintMethod,
} from '../types/merch-design';

// ─── Public API ──────────────────────────────────────────────────────────

export interface MerchDesignStudioProduct {
  /** TB catalog id — flows into the saved MerchDesign for print resolution. */
  tb_product_id: string;
  /** Displayed in the top bar so the user sees what they're designing on. */
  name: string;
  /** Optional background image (blank mockup). If absent, the canvas has
   *  a plain white background — still usable for a print-only design. */
  cover_image?: string | null;
  /** Optional short label under the product name (e.g. "Gildan Softstyle · Black"). */
  subtitle?: string;
}

export interface MerchDesignStudioTheme {
  /** Primary brand color (CSS color). Injected as `--mds-brand`. */
  brand?: string;
  /** Foreground on the brand color (buttons on brand bg). Injected as `--mds-brand-fg`. */
  brandForeground?: string;
  /** Neutral surface — the studio chrome background. Default white. */
  surface?: string;
  /** Border color for the toolbar / side panel. Default subtle gray. */
  border?: string;
}

export interface MerchDesignStudioHandle {
  /** Returns the current design as MerchDesign JSON without saving. */
  getDesign(): MerchDesign;
  /** Access to the underlying Fabric canvas for advanced ops. */
  getCanvas(): FabricCanvas | null;
}

export interface MerchDesignStudioProps {
  product: MerchDesignStudioProduct;
  theme?: MerchDesignStudioTheme;
  /** If provided, hydrates the canvas on ready. */
  initialDesign?: MerchDesign | null;
  /** Fired when the user clicks Save. Composite awaits this before
   *  clearing its saving state. Throw to indicate failure. */
  onSave: (design: MerchDesign) => Promise<void>;
  /** Fired when the user clicks Exit / back. */
  onExit?: () => void;
  /** Extra element in the top bar (e.g. a design-name input). Rendered
   *  between the product label and the Save button. */
  topBarSlot?: React.ReactNode;
  /** Save button label. Default: "Save design". */
  saveLabel?: string;
  /** Print method saved into MerchDesign.print_method. Default 'dtf'. */
  printMethod?: PrintMethod;
  /** Which side of the garment is being designed. Default 'front'. */
  side?: PrintAreaName;
  /** Optional class on the outer wrapper. */
  className?: string;
}

// ─── Component ───────────────────────────────────────────────────────────

export const MerchDesignStudio = forwardRef<MerchDesignStudioHandle, MerchDesignStudioProps>(
  function MerchDesignStudio(props, ref) {
    const canvasRef = useRef<CanvasHandle>(null);
    const [canvasReady, setCanvasReady] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selection, setSelection] = useState<FabricObject | null>(null);

    const side: PrintAreaName = props.side ?? 'front';
    const printMethod: PrintMethod = props.printMethod ?? 'dtf';

    // ─── Ready: load background + initial design ─────────────────────────
    useEffect(() => {
      if (!canvasReady) return;
      const handle = canvasRef.current;
      if (!handle) return;

      (async () => {
        // Background: the blank mockup. Fabric renders this behind objects
        // and never lets the user grab it (setBackgroundProduct sets
        // selectable/evented false).
        await handle.setBackgroundProduct(props.product.cover_image ?? null);

        // Initial design: read from MerchDesign.print_areas[side].canvas
        // and load into Fabric.
        const initialCanvas = props.initialDesign?.print_areas?.[side]?.canvas;
        if (initialCanvas) {
          await handle.loadDesign({
            schemaVersion: 2,
            canvas: initialCanvas,
          } as unknown as Parameters<CanvasHandle['loadDesign']>[0]);
        }
      })();
      // We deliberately don't reload when initialDesign changes mid-session —
      // the user's in-flight edits would be blown away. Consumers who need
      // a hard reset should remount the component with a fresh `key`.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasReady, props.product.cover_image, side]);

    // ─── Toolbar actions ─────────────────────────────────────────────────
    const withCanvas = <T,>(fn: (c: FabricCanvas) => T): T | null => {
      const c = canvasRef.current?.getCanvas();
      return c ? fn(c) : null;
    };

    const addText = useCallback(() => {
      withCanvas((c) => {
        const t = new IText('Your text', {
          left: 200,
          top: 200,
          fontSize: 72,
          fill: '#111111',
          fontFamily: 'Arial',
        });
        c.add(t);
        c.setActiveObject(t);
        c.requestRenderAll();
      });
    }, []);

    const addShape = useCallback((shape: 'rect' | 'circle' | 'triangle') => {
      withCanvas((c) => {
        const opts = { left: 300, top: 300, fill: 'var(--mds-brand-runtime, #ec4899)' as unknown as string };
        // We resolve the CSS var to a literal color at add time so Fabric
        // (which doesn't understand CSS custom properties) stores a real
        // color in the serialized JSON. Falls back to a sensible default.
        const rootColor = getComputedStyle(c.getElement()).getPropertyValue('--mds-brand-runtime').trim();
        const fill = rootColor || '#ec4899';
        let obj: FabricObject;
        if (shape === 'rect') obj = new Rect({ ...opts, width: 240, height: 160, fill });
        else if (shape === 'circle') obj = new Circle({ ...opts, radius: 120, fill });
        else obj = new Triangle({ ...opts, width: 240, height: 240, fill });
        c.add(obj);
        c.setActiveObject(obj);
        c.requestRenderAll();
      });
    }, []);

    const addImage = useCallback(async (file: File) => {
      const url = URL.createObjectURL(file);
      try {
        const img = await loadFabricImage(url);
        withCanvas((c) => {
          const maxDim = 400;
          const scale = Math.min(maxDim / (img.width ?? 1), maxDim / (img.height ?? 1), 1);
          img.set({ left: 300, top: 300, scaleX: scale, scaleY: scale });
          c.add(img);
          c.setActiveObject(img);
          c.requestRenderAll();
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }, []);

    const removeSelected = useCallback(() => {
      withCanvas((c) => {
        const active = c.getActiveObject();
        if (active) {
          c.remove(active);
          c.discardActiveObject();
          c.requestRenderAll();
        }
      });
    }, []);

    const bringForward = useCallback(() => {
      withCanvas((c) => {
        const active = c.getActiveObject();
        if (active) { c.bringObjectForward(active); c.requestRenderAll(); }
      });
    }, []);

    const sendBackward = useCallback(() => {
      withCanvas((c) => {
        const active = c.getActiveObject();
        if (active) { c.sendObjectBackwards(active); c.requestRenderAll(); }
      });
    }, []);

    // ─── Save ────────────────────────────────────────────────────────────
    const buildDesign = useCallback((): MerchDesign => {
      const c = canvasRef.current?.getCanvas();
      const canvasJson = c ? serializeCanvas(c) : {};
      return {
        schema_version: MERCH_DESIGN_SCHEMA_VERSION,
        tb_product_id: props.product.tb_product_id,
        print_areas: {
          [side]: { canvas: canvasJson as Record<string, unknown>, render_ref: null },
        } as Partial<Record<PrintAreaName, { canvas: Record<string, unknown>; render_ref: string | null }>>,
        colorways: [],
        print_method: printMethod,
        asset_refs: [],
      };
    }, [props.product.tb_product_id, printMethod, side]);

    const doSave = useCallback(async () => {
      if (saving) return;
      setSaving(true);
      try {
        await props.onSave(buildDesign());
      } finally {
        setSaving(false);
      }
    }, [saving, props.onSave, buildDesign]);

    useImperativeHandle(ref, () => ({
      getDesign: buildDesign,
      getCanvas: () => canvasRef.current?.getCanvas() ?? null,
    }), [buildDesign]);

    // ─── Theme wrapper ───────────────────────────────────────────────────
    const t = props.theme ?? {};
    const themeStyle: React.CSSProperties = {
      // These custom properties are the tenant hook. Downstream elements
      // (buttons, panels, etc.) read them via CSS. Runtime shape colors
      // read `--mds-brand-runtime` (a literal, not a var reference).
      ['--mds-brand' as any]: t.brand ?? '#3b82f6',
      ['--mds-brand-fg' as any]: t.brandForeground ?? '#ffffff',
      ['--mds-brand-runtime' as any]: t.brand ?? '#3b82f6',
      ['--mds-surface' as any]: t.surface ?? '#ffffff',
      ['--mds-border' as any]: t.border ?? '#e5e7eb',
    };

    // ─── Render ──────────────────────────────────────────────────────────
    return (
      <div
        style={themeStyle}
        className={`mds-root ${props.className ?? ''}`.trim()}
      >
        <style>{MDS_STYLES}</style>

        {/* Top bar */}
        <div className="mds-topbar">
          {props.onExit && (
            <button type="button" onClick={props.onExit} className="mds-btn mds-btn-ghost">
              ←
            </button>
          )}
          <div className="mds-product">
            <span className="mds-product-name">{props.product.name}</span>
            {props.product.subtitle && (
              <span className="mds-product-subtitle">{props.product.subtitle}</span>
            )}
          </div>
          {props.topBarSlot && <div className="mds-topbar-slot">{props.topBarSlot}</div>}
          <button
            type="button"
            onClick={doSave}
            disabled={saving || !canvasReady}
            className="mds-btn mds-btn-primary"
          >
            {saving ? 'Saving…' : (props.saveLabel ?? 'Save design')}
          </button>
        </div>

        <div className="mds-body">
          {/* Toolbar (left rail) */}
          <div className="mds-toolbar">
            <button type="button" onClick={addText} className="mds-tool">
              <span className="mds-tool-icon">T</span>
              <span>Text</span>
            </button>
            <button type="button" onClick={() => addShape('rect')} className="mds-tool">
              <span className="mds-tool-icon">▭</span>
              <span>Rect</span>
            </button>
            <button type="button" onClick={() => addShape('circle')} className="mds-tool">
              <span className="mds-tool-icon">◯</span>
              <span>Circle</span>
            </button>
            <button type="button" onClick={() => addShape('triangle')} className="mds-tool">
              <span className="mds-tool-icon">△</span>
              <span>Triangle</span>
            </button>
            <label className="mds-tool" title="Upload image">
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addImage(f);
                  e.target.value = '';
                }}
              />
              <span className="mds-tool-icon">🖼</span>
              <span>Image</span>
            </label>
          </div>

          {/* Canvas */}
          <div className="mds-canvas-wrap">
            <FabricDesignCanvas
              ref={canvasRef}
              userRole="admin"
              initialSide={(side === 'front' || side === 'back') ? side : 'front'}
              onReady={() => setCanvasReady(true)}
              onSelectionChange={(obj) => setSelection(obj)}
              className="mds-canvas"
            />
          </div>

          {/* Contextual side panel */}
          <div className="mds-sidebar">
            <SelectionPanel
              selection={selection}
              onChange={() => canvasRef.current?.getCanvas()?.requestRenderAll()}
              onDelete={removeSelected}
              onForward={bringForward}
              onBackward={sendBackward}
            />
          </div>
        </div>
      </div>
    );
  }
);

// ─── Selection panel ─────────────────────────────────────────────────────
// A pragmatic set of controls that cover most tenant needs: color, text
// content + size, layer nudges, delete. Not feature-parity with the full
// TSB studio — the professional composite is deliberately smaller than the
// storefront's DesignStudioPage.

function SelectionPanel({
  selection,
  onChange,
  onDelete,
  onForward,
  onBackward,
}: {
  selection: FabricObject | null;
  onChange: () => void;
  onDelete: () => void;
  onForward: () => void;
  onBackward: () => void;
}) {
  if (!selection) {
    return (
      <div className="mds-empty-panel">
        <p>Select an element to edit it.</p>
        <p style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>
          Or add one from the left toolbar.
        </p>
      </div>
    );
  }

  const isText = selection.type === 'i-text' || selection.type === 'text';
  const setProp = (patch: Record<string, unknown>) => {
    selection.set(patch);
    (selection as unknown as { setCoords: () => void }).setCoords();
    onChange();
  };

  return (
    <div className="mds-panel">
      <p className="mds-panel-title">
        {isText ? 'Text' : selection.type === 'image' ? 'Image' : 'Shape'}
      </p>

      {isText && (
        <>
          <label className="mds-field">
            <span>Content</span>
            <input
              type="text"
              defaultValue={(selection as unknown as { text: string }).text}
              onChange={(e) => setProp({ text: e.target.value })}
            />
          </label>
          <label className="mds-field">
            <span>Size</span>
            <input
              type="number"
              min={8}
              max={200}
              defaultValue={(selection as unknown as { fontSize: number }).fontSize}
              onChange={(e) => setProp({ fontSize: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      {(isText || selection.type === 'rect' || selection.type === 'circle' || selection.type === 'triangle') && (
        <label className="mds-field">
          <span>Color</span>
          <input
            type="color"
            defaultValue={(selection.fill as string) || '#111111'}
            onChange={(e) => setProp({ fill: e.target.value })}
          />
        </label>
      )}

      <label className="mds-field">
        <span>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          defaultValue={Math.round((selection.opacity ?? 1) * 100)}
          onChange={(e) => setProp({ opacity: Number(e.target.value) / 100 })}
        />
      </label>

      <div className="mds-panel-actions">
        <button type="button" onClick={onForward} className="mds-btn mds-btn-ghost">↑ Forward</button>
        <button type="button" onClick={onBackward} className="mds-btn mds-btn-ghost">↓ Back</button>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="mds-btn mds-btn-danger"
        style={{ width: '100%', marginTop: 8 }}
      >
        Delete
      </button>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────
// Component-scoped styles injected once per mount. Keeps the composite
// self-contained — consumers don't need Tailwind or any specific CSS stack.
// Tenants theme via the --mds-* CSS custom properties.

const MDS_STYLES = `
.mds-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 480px;
  background: var(--mds-surface);
  color: #111827;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.mds-topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--mds-border);
  background: var(--mds-surface);
}
.mds-product {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.mds-product-name { font-weight: 600; font-size: 14px; }
.mds-product-subtitle { font-size: 11px; color: #6b7280; }
.mds-topbar-slot { flex: 1; display: flex; justify-content: center; }

.mds-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.mds-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.mds-btn-primary {
  background: var(--mds-brand);
  color: var(--mds-brand-fg);
  border-color: var(--mds-brand);
  margin-left: auto;
}
.mds-btn-primary:hover:not(:disabled) { filter: brightness(0.95); }
.mds-btn-ghost {
  background: transparent;
  color: #374151;
  border-color: var(--mds-border);
}
.mds-btn-ghost:hover { background: #f3f4f6; }
.mds-btn-danger {
  background: #fef2f2;
  color: #b91c1c;
  border-color: #fecaca;
}
.mds-btn-danger:hover { background: #fee2e2; }

.mds-body {
  flex: 1;
  display: grid;
  grid-template-columns: 88px 1fr 260px;
  min-height: 0;
}
@media (max-width: 900px) {
  .mds-body { grid-template-columns: 72px 1fr; }
  .mds-sidebar { display: none; }
}

.mds-toolbar {
  border-right: 1px solid var(--mds-border);
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--mds-surface);
}
.mds-tool {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 4px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 6px;
  font-size: 10px;
  color: #4b5563;
  cursor: pointer;
}
.mds-tool:hover { background: #f3f4f6; border-color: var(--mds-border); }
.mds-tool-icon { font-size: 18px; line-height: 1; }

.mds-canvas-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: #f9fafb;
  min-width: 0;
}
.mds-canvas { max-width: 100%; }

.mds-sidebar {
  border-left: 1px solid var(--mds-border);
  padding: 16px;
  background: var(--mds-surface);
  overflow-y: auto;
}
.mds-empty-panel { color: #6b7280; font-size: 13px; }
.mds-panel-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #6b7280;
  margin: 0 0 12px 0;
}
.mds-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  font-size: 12px;
  color: #374151;
}
.mds-field span { font-weight: 500; }
.mds-field input[type="text"],
.mds-field input[type="number"] {
  padding: 6px 8px;
  border: 1px solid var(--mds-border);
  border-radius: 6px;
  font-size: 13px;
}
.mds-field input[type="color"] {
  width: 44px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--mds-border);
  border-radius: 6px;
  cursor: pointer;
}
.mds-panel-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-top: 8px;
}
`;
