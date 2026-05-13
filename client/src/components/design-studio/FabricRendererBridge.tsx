/**
 * Bridges the existing DesignStudioPage state (designElements + selectedElementId)
 * to the new <FabricDesignCanvas>. Lives behind the ?canvas=fabric flag so the
 * legacy positioned-div renderer stays untouched when the flag is off.
 *
 * Two-way sync model:
 *   STATE → CANVAS: a useEffect runs whenever designElements / currentView /
 *     displayImage changes. Diffs against a Map<elementId, FabricObject>.
 *     Adds, removes, and property updates are pushed into Fabric.
 *
 *   CANVAS → STATE: Fabric drag/resize/rotate fires `object:modified`. We
 *     extract back to legacy coords (re-using extractLegacyElements' math)
 *     and call onElementsChange so the page state catches up. A skip-flag
 *     suppresses the re-sync that would otherwise ping-pong the change.
 *
 *   SELECTION: Fabric `selection:created/updated/cleared` → setSelectedElementId.
 *     Reverse: when the page sets selectedElementId from a side panel,
 *     `canvas.setActiveObject` is called.
 *
 * The legacy DesignElement[] shape stays the source of truth. Side panels,
 * the save handler, and the QuotePage handoff all keep working unchanged.
 * Fabric is a render target with bidirectional event flow.
 */

import { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { FabricImage, IText, Group, Shadow, Gradient } from 'fabric';
import { FabricDesignCanvas, LOGICAL_CANVAS_SIZE } from './FabricDesignCanvas';
import { hydrateLegacyElements } from '@/lib/fabric/hydrateLegacy';
import { extractLegacyElements } from '@/lib/fabric/extractLegacy';
import type { CanvasHandle, ViewSide, UserRole, DesignElement } from './types';
import type { FabricObjectWithMeta } from '@/lib/fabric/types';

export interface FabricRendererBridgeHandle {
  /** PNG export — used by handleSaveToLibrary in Fabric mode. */
  exportPNG(opts?: { transparent?: boolean }): string | null;
  /** v2 serialized form for the save handler. */
  getDesignJSON(): object;
  /** Switch the visible side (front/back/sleeve). Used by the invoice
   *  mockup save flow to snapshot each side via exportPNG. */
  setSide(side: ViewSide): void;
}

export interface FabricRendererBridgeProps {
  userRole: UserRole;
  designElements: DesignElement[];
  selectedElementId: string | null;
  currentView: ViewSide;
  displayImage: string | null;
  onElementsChange: (next: DesignElement[]) => void;
  onSelectElement: (id: string | null) => void;
  className?: string;
}

export const FabricRendererBridge = forwardRef<
  FabricRendererBridgeHandle,
  FabricRendererBridgeProps
>(function FabricRendererBridge(props, ref) {
  const handleRef = useRef<CanvasHandle | null>(null);
  // State-backed ready flag so effects re-run once the underlying Fabric
  // canvas is constructed (a ref change wouldn't trigger re-renders).
  const [ready, setReady] = useState(false);
  // Map<elementId, FabricObject> for diff-based syncing. Lives in a ref so
  // identity stays stable across re-renders.
  const idMapRef = useRef<Map<string, FabricObjectWithMeta>>(new Map());
  // Set during canvas → state callbacks so the matching state → canvas
  // effect doesn't re-push the change we just received.
  const skipSyncRef = useRef(false);

  // ─── CANVAS → STATE ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = handleRef.current?.getCanvas();
    if (!canvas) return;

    const onModified = () => {
      // Extract everything back to legacy form. Cheap relative to the
      // user-perceived "drag ended" event (mouseup-frequency, not 60fps).
      // Preserve the original element ids by reading data.designId off
      // each Fabric object — extractLegacyElements assigns fresh ids.
      const objs = canvas.getObjects() as FabricObjectWithMeta[];
      const extracted = extractLegacyElements(canvas);
      const next = extracted.map((el, i) => ({
        ...el,
        id: objs[i]?.data?.designId ?? el.id,
      }));
      skipSyncRef.current = true;
      props.onElementsChange(next);
    };
    const onSelectionChange = () => {
      const active = canvas.getActiveObject() as FabricObjectWithMeta | null;
      props.onSelectElement(active?.data?.designId ?? null);
    };
    const onSelectionCleared = () => props.onSelectElement(null);

    canvas.on('object:modified', onModified);
    canvas.on('selection:created', onSelectionChange);
    canvas.on('selection:updated', onSelectionChange);
    canvas.on('selection:cleared', onSelectionCleared);
    return () => {
      canvas.off('object:modified', onModified);
      canvas.off('selection:created', onSelectionChange);
      canvas.off('selection:updated', onSelectionChange);
      canvas.off('selection:cleared', onSelectionCleared);
    };
    // props callbacks are stable in practice; we deliberately do NOT
    // re-attach listeners on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ─── STATE → CANVAS: background product ────────────────────────────────
  useEffect(() => {
    if (!ready || !handleRef.current) return;
    handleRef.current.setBackgroundProduct(props.displayImage).catch(() => {
      /* errors already reported via FabricDesignCanvas internal wiring */
    });
  }, [ready, props.displayImage]);

  // ─── STATE → CANVAS: side switching ────────────────────────────────────
  useEffect(() => {
    if (!ready || !handleRef.current) return;
    handleRef.current.setSide(props.currentView);
  }, [ready, props.currentView]);

  // ─── STATE → CANVAS: elements diff ─────────────────────────────────────
  useEffect(() => {
    const canvas = handleRef.current?.getCanvas();
    if (!canvas) return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    const desired = new Map(props.designElements.map((el) => [el.id, el]));
    // Remove
    for (const [id, obj] of idMapRef.current.entries()) {
      if (!desired.has(id)) {
        canvas.remove(obj);
        idMapRef.current.delete(id);
      }
    }
    // Add or update
    void syncElements(canvas, props.designElements, idMapRef.current);
  }, [ready, props.designElements]);

  // ─── STATE → CANVAS: selection ─────────────────────────────────────────
  useEffect(() => {
    const canvas = handleRef.current?.getCanvas();
    if (!canvas) return;
    const id = props.selectedElementId;
    if (!id) {
      canvas.discardActiveObject();
      canvas.renderAll();
      return;
    }
    const obj = idMapRef.current.get(id);
    if (obj && canvas.getActiveObject() !== obj) {
      canvas.setActiveObject(obj);
      canvas.renderAll();
    }
  }, [ready, props.selectedElementId]);

  useImperativeHandle(ref, (): FabricRendererBridgeHandle => ({
    exportPNG(opts) {
      return handleRef.current?.exportPNG(opts) ?? null;
    },
    getDesignJSON() {
      return handleRef.current?.getDesignJSON() ?? {};
    },
    setSide(side) {
      handleRef.current?.setSide(side);
    },
  }), []);

  return (
    <FabricDesignCanvas
      ref={handleRef}
      userRole={props.userRole}
      initialSide={props.currentView}
      className={props.className}
      onReady={() => setReady(true)}
    />
  );
});

async function syncElements(
  canvas: import('fabric').Canvas,
  desired: DesignElement[],
  idMap: Map<string, FabricObjectWithMeta>,
): Promise<void> {
  for (const el of desired) {
    const existing = idMap.get(el.id);
    if (existing) {
      applyLegacyToObject(existing, el);
      continue;
    }
    // Add new — reuse the legacy hydrator on a single-element array. Same
    // coord / font / filter mapping as the bulk-hydrate path, no second
    // translation to maintain.
    const before = new Set(canvas.getObjects());
    await hydrateLegacyElements(canvas, [el]);
    for (const obj of canvas.getObjects()) {
      if (!before.has(obj)) {
        const meta = (obj as FabricObjectWithMeta).data ?? {};
        meta.designId = el.id;
        (obj as FabricObjectWithMeta).data = meta;
        idMap.set(el.id, obj as FabricObjectWithMeta);
      }
    }
  }
  canvas.renderAll();
}

function buildLinearGradient(
  colorA: string,
  colorB: string,
  angleDeg: number,
): Gradient<'linear'> {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * 0.5;
  const dy = Math.sin(rad) * 0.5;
  return new Gradient({
    type: 'linear',
    gradientUnits: 'percentage',
    coords: {
      x1: 0.5 - dx, y1: 0.5 - dy,
      x2: 0.5 + dx, y2: 0.5 + dy,
    },
    colorStops: [
      { offset: 0, color: colorA },
      { offset: 1, color: colorB },
    ],
  });
}

function applyLegacyToObject(obj: FabricObjectWithMeta, el: DesignElement): void {
  const COORD_SCALE = LOGICAL_CANVAS_SIZE / 100;
  const FONT_SCALE = LOGICAL_CANVAS_SIZE / 800;
  const widthPx = el.width * COORD_SCALE;
  const leftPx = el.x * COORD_SCALE;
  const topPx = el.y * COORD_SCALE;

  if (obj instanceof FabricImage) {
    const naturalW = obj.width || 1;
    const scale = widthPx / naturalW;
    obj.set({
      left: leftPx + widthPx / 2,
      top: topPx + ((obj.height || 1) * scale) / 2,
      scaleX: scale,
      scaleY: scale,
      angle: el.rotation ?? 0,
      opacity: el.opacity ?? 1,
    });
    return;
  }
  if (obj instanceof IText) {
    const fontSize = (el.fontSize ?? 24) * FONT_SCALE;
    // Phase 2 PR #14: real stroke + gradient fill + drop shadow.
    // Mirrors the math in hydrateLegacy.ts so panel updates produce the
    // same visual result as a fresh hydrate.
    const useRealStroke =
      typeof el.strokeWidth === 'number' && el.strokeWidth > 0 && !!el.strokeColor;
    const strokeColor = useRealStroke
      ? el.strokeColor
      : el.outline ? 'rgba(0,0,0,0.5)' : undefined;
    const strokeWidth = useRealStroke
      ? (el.strokeWidth as number) * FONT_SCALE
      : el.outline ? 1 : 0;
    const fill = el.gradient
      ? buildLinearGradient(el.gradient.colorA, el.gradient.colorB, el.gradient.angle)
      : (el.color ?? '#000000');
    obj.set({
      left: leftPx + widthPx / 2,
      top: topPx + (fontSize * (el.lineHeight ?? 1.2)) / 2,
      angle: el.rotation ?? 0,
      opacity: el.opacity ?? 1,
      fontSize,
      fill,
      fontFamily: el.fontFamily ?? 'Inter',
      textAlign: el.textAlign ?? 'center',
      charSpacing: (el.letterSpacing ?? 0) * 1000,
      lineHeight: el.lineHeight ?? 1.2,
      stroke: strokeColor,
      strokeWidth,
      paintFirst: strokeWidth > 0 ? 'stroke' : 'fill',
      shadow: el.shadow ? new Shadow({
        offsetX: el.shadow.offsetX * FONT_SCALE,
        offsetY: el.shadow.offsetY * FONT_SCALE,
        blur: el.shadow.blur * FONT_SCALE,
        color: el.shadow.color,
      }) : null,
      text: el.content,
    });
    return;
  }
  if (obj instanceof Group) {
    // Shaped text — only position / rotation / opacity update incrementally.
    // Shape / intensity / text-content changes require re-creating the
    // group; the page does this implicitly when those fields change because
    // it issues a remove + add.
    obj.set({
      left: leftPx + widthPx / 2,
      top: topPx + ((obj.height || 1) * (obj.scaleY || 1)) / 2,
      angle: el.rotation ?? 0,
      opacity: el.opacity ?? 1,
    });
  }
}
