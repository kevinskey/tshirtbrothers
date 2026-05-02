import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Canvas as FabricCanvas } from 'fabric';
import { exportPng } from '@/lib/fabric/exportPng';
import { exportSvg } from '@/lib/fabric/exportSvg';
import { serializeCanvas, deserializeCanvas } from '@/lib/fabric/serializeJson';
import { loadFabricImage } from '@/lib/fabric/loadImage';
import { hydrateLegacyElements } from '@/lib/fabric/hydrateLegacy';
import { extractLegacyElements } from '@/lib/fabric/extractLegacy';
import type { FabricObjectWithMeta } from '@/lib/fabric/types';
import { FabricCanvasContext } from './FabricCanvasContext';
import type {
  CanvasHandle,
  FabricDesignCanvasProps,
  StoredDesign,
  ViewSide,
} from './types';

/**
 * Logical canvas size. ALL object coordinates (left, top, fontSize,
 * strokeWidth) live in this space. The backing canvas is always 1000×1000;
 * the display size is driven entirely by CSS so objects don't drift on
 * resize. Per the migration plan, this is fixed — never change without a
 * migration that scales every saved design.
 */
export const LOGICAL_CANVAS_SIZE = 1000;

/**
 * The Fabric-based design canvas. Renders nothing visible by default —
 * the parent decides background product, panels add elements via the
 * FabricCanvasContext.
 *
 * Phase 1 scope: scaffolding. Hydration of legacy v1 designs and the
 * QuotePage adapter (getLegacyElements) land in PR #4.
 */
export const FabricDesignCanvas = forwardRef<CanvasHandle, FabricDesignCanvasProps>(
  function FabricDesignCanvas(props, ref) {
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const canvasElRef = useRef<HTMLCanvasElement | null>(null);
    const fabricRef = useRef<FabricCanvas | null>(null);
    // Triggers a re-render once the canvas is constructed so the context
    // provider can hand the live instance to children.
    const [ready, setReady] = useState(false);
    const currentSideRef = useRef<ViewSide>(props.initialSide ?? 'front');

    // ─── Init / dispose ──────────────────────────────────────────────────
    // Re-runs on userRole change because corner-size + touch sizes differ
    // between admin (precise mouse work) and customer (touch-friendly).
    useEffect(() => {
      if (!canvasElRef.current) return;

      const canvas = new FabricCanvas(canvasElRef.current, {
        width: LOGICAL_CANVAS_SIZE,
        height: LOGICAL_CANVAS_SIZE,
        backgroundColor: '#ffffff',
        preserveObjectStacking: true,
        enableRetinaScaling: true,
        // Touch-friendly handle sizes for customer mode; tighter for admin.
        ...(props.userRole === 'customer'
          ? { allowTouchScrolling: false }
          : {}),
      });

      // Per-object defaults applied via prototype on first construction.
      // Customer mode: bigger handles so dragging on a phone is forgiving.
      const cornerSize = props.userRole === 'customer' ? 24 : 12;
      const touchCornerSize = props.userRole === 'customer' ? 32 : 24;
      canvas.on('object:added', (e) => {
        e.target?.set({
          cornerSize,
          touchCornerSize,
          borderColor: '#3b82f6',
          cornerColor: '#3b82f6',
          cornerStyle: 'circle',
          transparentCorners: false,
        });
      });

      // Selection change → page shell. Fabric fires three events for the
      // same conceptual transition; we collapse them.
      const onSel = () => {
        const active = canvas.getActiveObject() ?? null;
        props.onSelectionChange?.(active);
      };
      canvas.on('selection:created', onSel);
      canvas.on('selection:updated', onSel);
      canvas.on('selection:cleared', onSel);

      fabricRef.current = canvas;
      setReady(true);
      props.onReady?.();

      return () => {
        canvas.off('selection:created', onSel);
        canvas.off('selection:updated', onSel);
        canvas.off('selection:cleared', onSel);
        canvas.dispose();
        fabricRef.current = null;
        setReady(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.userRole]);

    // ─── Responsive CSS sizing ───────────────────────────────────────────
    // Backing store is always 1000×1000 (object coords are stable). Display
    // size is whatever the wrapper gives us, applied via cssOnly:true.
    useEffect(() => {
      const wrapper = wrapperRef.current;
      const canvas = fabricRef.current;
      if (!wrapper || !canvas) return;

      const apply = () => {
        const { width } = wrapper.getBoundingClientRect();
        if (width <= 0) return;
        // Square canvas — height tracks width.
        canvas.setDimensions({ width, height: width }, { cssOnly: true });
      };
      apply();

      const ro = new ResizeObserver(apply);
      ro.observe(wrapper);
      return () => ro.disconnect();
    }, [ready]);

    // ─── Side switching ──────────────────────────────────────────────────
    function setSide(side: ViewSide) {
      currentSideRef.current = side;
      const canvas = fabricRef.current;
      if (!canvas) return;
      for (const obj of canvas.getObjects() as FabricObjectWithMeta[]) {
        const objSide = obj.data?.side ?? 'front';
        const visible = objSide === side;
        obj.visible = visible;
        obj.evented = visible;
        obj.selectable = visible;
      }
      canvas.discardActiveObject();
      canvas.renderAll();
    }

    // ─── Background product ──────────────────────────────────────────────
    async function setBackgroundProduct(url: string | null) {
      const canvas = fabricRef.current;
      if (!canvas) return;
      if (!url) {
        canvas.backgroundImage = undefined;
        canvas.renderAll();
        return;
      }
      const img = await loadFabricImage(url);
      const w = img.width ?? 1;
      const h = img.height ?? 1;
      const scale = Math.min(LOGICAL_CANVAS_SIZE / w, LOGICAL_CANVAS_SIZE / h);
      img.scale(scale);
      img.set({
        left: (LOGICAL_CANVAS_SIZE - w * scale) / 2,
        top: (LOGICAL_CANVAS_SIZE - h * scale) / 2,
        selectable: false,
        evented: false,
        originX: 'left',
        originY: 'top',
      });
      canvas.backgroundImage = img;
      canvas.renderAll();
    }

    // ─── Imperative handle ───────────────────────────────────────────────
    useImperativeHandle(
      ref,
      (): CanvasHandle => ({
        async loadDesign(stored: StoredDesign) {
          const canvas = fabricRef.current;
          if (!canvas) return;
          // Wait for any in-flight webfont loads — Fabric measures text
          // with whatever is loaded at deserialize time and bakes those
          // glyph widths in. Without this, hydrated text jumps when the
          // webfont finishes loading later.
          await document.fonts.ready;

          // v1 (legacy positioned-div array) → hydrate via converter.
          // v2 (Fabric serialized object) → loadFromJSON. Both branches
          // already awaited document.fonts.ready above; the hydrator
          // additionally injects any required Google Fonts.
          if (Array.isArray(stored)) {
            await hydrateLegacyElements(canvas, stored);
            return;
          }
          await deserializeCanvas(canvas, stored);
        },
        getDesignJSON() {
          const canvas = fabricRef.current;
          if (!canvas) return {};
          return {
            schemaVersion: 2,
            canvasWidth: LOGICAL_CANVAS_SIZE,
            canvasHeight: LOGICAL_CANVAS_SIZE,
            ...serializeCanvas(canvas),
          };
        },
        getLegacyElements() {
          const canvas = fabricRef.current;
          if (!canvas) return [];
          return extractLegacyElements(canvas);
        },
        exportPNG(opts) {
          const canvas = fabricRef.current;
          if (!canvas) throw new Error('canvas not initialized');
          return exportPng(canvas, opts);
        },
        async exportSVG(opts) {
          const canvas = fabricRef.current;
          if (!canvas) throw new Error('canvas not initialized');
          return exportSvg(canvas, opts);
        },
        setSide,
        setBackgroundProduct,
      }),
      // setSide and setBackgroundProduct close over fabricRef which is
      // mutable; the handle is recomputed each render so callers always
      // dispatch through the live functions.
      [ready],
    );

    return (
      <FabricCanvasContext.Provider value={fabricRef.current}>
        <div
          ref={wrapperRef}
          className={`relative w-full max-w-[1000px] aspect-square mx-auto bg-white ${props.className ?? ''}`}
        >
          <canvas ref={canvasElRef} />
        </div>
      </FabricCanvasContext.Provider>
    );
  },
);
