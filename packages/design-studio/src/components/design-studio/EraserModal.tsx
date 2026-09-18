/**
 * Paint-to-erase editor. Opens against an existing image element, lets the
 * user brush over areas to make them transparent (Canvas-2D destination-out
 * strokes at the image's natural resolution), then returns the new PNG data
 * URL. Same client-side rationale as CropModal: instant, no server trip,
 * and the data URL flows through handleSave's auto-upload to Spaces.
 *
 * Pointer math mirrors CropModal: strokes are captured against the rendered
 * preview and scaled to natural pixels, so erasing is resolution-accurate
 * regardless of how large the preview is on screen.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Check, Eraser as EraserIcon, Undo2, RotateCcw } from 'lucide-react';

interface EraserModalProps {
  src: string;
  onCancel: () => void;
  /** Resolves with the erased image's PNG data URL when the user clicks Apply. */
  onApply: (dataUrl: string) => void;
}

const MAX_UNDO = 20;

export function EraserModal({ src, onCancel, onApply }: EraserModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Brush diameter as a fraction of the image's larger natural dimension,
  // so the default feels the same on a 400px clipart and a 4000px photo.
  const [brushPct, setBrushPct] = useState(6);
  const [dirty, setDirty] = useState(false);
  const [undoDepth, setUndoDepth] = useState(0);

  // Stroke state lives in refs — pointer moves must not re-render.
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  // Pristine pixels, captured at load — the undo stack caps out, so Reset
  // can't rely on its oldest entry still being the original.
  const originalRef = useRef<ImageData | null>(null);
  // Live cursor preview circle, positioned via rAF-free direct style writes.
  const cursorRef = useRef<HTMLDivElement | null>(null);

  // Load the source image into the canvas at natural resolution.
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { setLoadError(true); return; }
      ctx.drawImage(img, 0, 0);
      try {
        originalRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch {
        // Tainted canvas (CORS) — erasing/export would fail anyway.
        setLoadError(true);
        return;
      }
      setImgLoaded(true);
    };
    img.onerror = () => { if (!cancelled) setLoadError(true); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  function naturalBrushRadius(): number {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    return (brushPct / 100) * Math.max(canvas.width, canvas.height) / 2;
  }

  /** Preview px → natural px. The canvas element is CSS-scaled to fit. */
  function toNatural(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function eraseSegment(from: { x: number; y: number }, to: { x: number; y: number }) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const r = naturalBrushRadius();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = r * 2;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    // A zero-length line draws nothing in some browsers — dot the point too.
    ctx.beginPath();
    ctx.arc(to.x, to.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function pushUndoSnapshot() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const stack = undoStackRef.current;
    stack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (stack.length > MAX_UNDO) stack.shift();
    setUndoDepth(stack.length);
  }

  function handleUndo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const snap = undoStackRef.current.pop();
    if (!canvas || !ctx || !snap) return;
    ctx.putImageData(snap, 0, 0);
    setUndoDepth(undoStackRef.current.length);
    if (undoStackRef.current.length === 0) setDirty(false);
  }

  function handleReset() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !originalRef.current) return;
    ctx.putImageData(originalRef.current, 0, 0);
    undoStackRef.current = [];
    setUndoDepth(0);
    setDirty(false);
  }

  function moveCursorPreview(e: { clientX: number; clientY: number }) {
    const cursor = cursorRef.current;
    const canvas = canvasRef.current;
    if (!cursor || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Brush radius in preview px = natural radius scaled back down.
    const rPreview = naturalBrushRadius() * (rect.width / canvas.width);
    cursor.style.display = 'block';
    cursor.style.width = `${rPreview * 2}px`;
    cursor.style.height = `${rPreview * 2}px`;
    cursor.style.left = `${e.clientX - rect.left - rPreview}px`;
    cursor.style.top = `${e.clientY - rect.top - rPreview}px`;
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!imgLoaded) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toNatural(e);
    if (!pt) return;
    pushUndoSnapshot();
    drawingRef.current = true;
    lastPtRef.current = pt;
    eraseSegment(pt, pt);
    setDirty(true);
    moveCursorPreview(e);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    moveCursorPreview(e);
    if (!drawingRef.current) return;
    e.preventDefault();
    const pt = toNatural(e);
    if (!pt) return;
    eraseSegment(lastPtRef.current ?? pt, pt);
    lastPtRef.current = pt;
  }

  function onPointerUp() {
    drawingRef.current = false;
    lastPtRef.current = null;
  }

  function handleApply() {
    const canvas = canvasRef.current;
    if (!canvas || !imgLoaded) return;
    onApply(canvas.toDataURL('image/png'));
  }

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <EraserIcon className="h-4 w-4 text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-900">Erase parts of image</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-gray-50 min-h-[300px]">
          {loadError ? (
            <p className="text-sm text-red-600">Couldn&apos;t load this image for editing.</p>
          ) : (
            <div
              className="relative inline-block max-w-full"
              // Checkerboard shows through wherever pixels get erased.
              style={{
                backgroundImage:
                  'linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%), linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%)',
                backgroundSize: '16px 16px',
                backgroundPosition: '0 0, 8px 8px',
                backgroundColor: '#fff',
              }}
            >
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={() => { onPointerUp(); if (cursorRef.current) cursorRef.current.style.display = 'none'; }}
                className="block max-w-full max-h-[55vh] select-none cursor-crosshair"
                style={{ touchAction: 'none' }}
              />
              {/* Brush outline that follows the pointer */}
              <div
                ref={cursorRef}
                className="absolute rounded-full border-2 border-blue-600/80 pointer-events-none hidden"
                style={{ display: 'none' }}
              />
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-gray-200 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 whitespace-nowrap">Brush size</span>
            <input
              type="range"
              min={1}
              max={25}
              value={brushPct}
              onChange={e => setBrushPct(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <span className="text-xs w-8 text-right text-gray-600">{brushPct}</span>
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoDepth === 0}
              title="Undo last stroke"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              <Undo2 className="h-3.5 w-3.5" /> Undo
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={!dirty}
              title="Restore the original image"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-300 text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="hidden sm:block text-xs text-gray-500">
              Brush over the parts you want to remove — they become transparent
            </p>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 sm:flex-none px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!imgLoaded || !dirty}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                <Check className="h-4 w-4" /> Apply
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
