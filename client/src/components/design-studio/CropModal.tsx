/**
 * Visual image cropper. Opens against an existing image element, lets the
 * user drag a crop rectangle (interior to move; 4 corners to resize), then
 * crops the image bytes via Canvas-2D and returns the new data URL.
 *
 * Why client-side: instant, no server round-trip, and the resulting data
 * URL flows through the existing handleSave path (POST /api/designs auto-
 * uploads data: images to Spaces). For very large images this means a
 * bigger save body, but the same is true of any uploaded image; cropping
 * actually reduces the payload.
 *
 * The crop rectangle is stored as 0..1 fractions of the loaded image so
 * the math is independent of how big the image is rendered on screen.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Check, Crop as CropIcon } from 'lucide-react';

interface CropModalProps {
  src: string;
  onCancel: () => void;
  /** Resolves with the cropped image's data URL when the user clicks Apply. */
  onApply: (dataUrl: string) => void;
}

interface CropRect { x: number; y: number; w: number; h: number; } // 0..1

const HANDLE_SIZE = 14;

export function CropModal({ src, onCancel, onApply }: CropModalProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  // Initial crop: 10% inset on every side. Most users tighten from there.
  const [crop, setCrop] = useState<CropRect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const dragRef = useRef<null | {
    mode: 'move' | 'tl' | 'tr' | 'bl' | 'br';
    startMx: number;
    startMy: number;
    startCrop: CropRect;
  }>(null);

  // The natural image dimensions — needed for the final crop math (we
  // crop pixel-accurate, not based on the rendered preview size).
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const onImgLoad = () => {
    if (imgRef.current) {
      setNatural({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight });
      setImgLoaded(true);
    }
  };

  // Pointer-down handlers per region. We keep them as plain DOM handlers
  // on the overlay so dragging outside the modal still works.
  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current || !imgRef.current) return;
      const rect = imgRef.current.getBoundingClientRect();
      const point = 'touches' in e ? e.touches[0] : e;
      if (!point) return;
      const dx = (point.clientX - dragRef.current.startMx) / rect.width;
      const dy = (point.clientY - dragRef.current.startMy) / rect.height;
      const start = dragRef.current.startCrop;
      let next: CropRect;
      switch (dragRef.current.mode) {
        case 'move': {
          next = {
            x: Math.max(0, Math.min(1 - start.w, start.x + dx)),
            y: Math.max(0, Math.min(1 - start.h, start.y + dy)),
            w: start.w,
            h: start.h,
          };
          break;
        }
        case 'tl':
          next = {
            x: Math.max(0, Math.min(start.x + start.w - 0.05, start.x + dx)),
            y: Math.max(0, Math.min(start.y + start.h - 0.05, start.y + dy)),
            w: start.w - dx,
            h: start.h - dy,
          };
          next.w = Math.max(0.05, next.x === 0 ? start.w + start.x : start.w - dx);
          next.h = Math.max(0.05, next.y === 0 ? start.h + start.y : start.h - dy);
          break;
        case 'tr':
          next = {
            x: start.x,
            y: Math.max(0, Math.min(start.y + start.h - 0.05, start.y + dy)),
            w: Math.max(0.05, Math.min(1 - start.x, start.w + dx)),
            h: Math.max(0.05, start.y + dy < 0 ? start.h + start.y : start.h - dy),
          };
          break;
        case 'bl':
          next = {
            x: Math.max(0, Math.min(start.x + start.w - 0.05, start.x + dx)),
            y: start.y,
            w: Math.max(0.05, start.x + dx < 0 ? start.w + start.x : start.w - dx),
            h: Math.max(0.05, Math.min(1 - start.y, start.h + dy)),
          };
          break;
        case 'br':
          next = {
            x: start.x,
            y: start.y,
            w: Math.max(0.05, Math.min(1 - start.x, start.w + dx)),
            h: Math.max(0.05, Math.min(1 - start.y, start.h + dy)),
          };
          break;
      }
      setCrop(next);
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  const startDrag = (
    mode: 'move' | 'tl' | 'tr' | 'bl' | 'br',
  ) => (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const point = 'touches' in e ? e.touches[0] : e;
    if (!point) return;
    dragRef.current = {
      mode,
      startMx: point.clientX,
      startMy: point.clientY,
      startCrop: crop,
    };
  };

  function handleApply() {
    if (!natural || !imgRef.current) return;
    const sx = Math.round(crop.x * natural.w);
    const sy = Math.round(crop.y * natural.h);
    const sw = Math.round(crop.w * natural.w);
    const sh = Math.round(crop.h * natural.h);
    if (sw <= 0 || sh <= 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh);
    onApply(canvas.toDataURL('image/png'));
  }

  const cropStyle: React.CSSProperties = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CropIcon className="h-4 w-4 text-gray-600" />
            <h2 className="text-sm font-semibold text-gray-900">Crop image</h2>
          </div>
          <button type="button" onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-gray-50 min-h-[300px]">
          <div ref={containerRef} className="relative inline-block max-w-full max-h-[60vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt="Crop source"
              crossOrigin="anonymous"
              onLoad={onImgLoad}
              className="block max-w-full max-h-[60vh] select-none pointer-events-none"
              draggable={false}
            />
            {imgLoaded && (
              <>
                {/* Dimming overlay around the crop rect — 4 sides as
                    independent rects so the crop area itself stays clear. */}
                <div className="absolute pointer-events-none bg-black/50" style={{ left: 0, top: 0, right: 0, height: `${crop.y * 100}%` }} />
                <div className="absolute pointer-events-none bg-black/50" style={{ left: 0, top: `${(crop.y + crop.h) * 100}%`, right: 0, bottom: 0 }} />
                <div className="absolute pointer-events-none bg-black/50" style={{ left: 0, top: `${crop.y * 100}%`, width: `${crop.x * 100}%`, height: `${crop.h * 100}%` }} />
                <div className="absolute pointer-events-none bg-black/50" style={{ left: `${(crop.x + crop.w) * 100}%`, top: `${crop.y * 100}%`, right: 0, height: `${crop.h * 100}%` }} />
                {/* Crop rectangle */}
                <div
                  className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] cursor-move"
                  style={cropStyle}
                  onMouseDown={startDrag('move')}
                  onTouchStart={startDrag('move')}
                >
                  {/* Corner handles */}
                  <Handle pos="tl" onMouseDown={startDrag('tl')} onTouchStart={startDrag('tl')} />
                  <Handle pos="tr" onMouseDown={startDrag('tr')} onTouchStart={startDrag('tr')} />
                  <Handle pos="bl" onMouseDown={startDrag('bl')} onTouchStart={startDrag('bl')} />
                  <Handle pos="br" onMouseDown={startDrag('br')} onTouchStart={startDrag('br')} />
                </div>
              </>
            )}
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Drag the corners to resize · drag the box to move
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!imgLoaded}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Apply Crop
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Handle({ pos, onMouseDown, onTouchStart }: {
  pos: 'tl' | 'tr' | 'bl' | 'br';
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
}) {
  const style: React.CSSProperties = {
    position: 'absolute',
    width: HANDLE_SIZE, height: HANDLE_SIZE,
    background: 'white',
    border: '2px solid #1d4ed8',
    borderRadius: 2,
    ...(pos === 'tl' && { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nwse-resize' }),
    ...(pos === 'tr' && { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nesw-resize' }),
    ...(pos === 'bl' && { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nesw-resize' }),
    ...(pos === 'br' && { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nwse-resize' }),
  };
  return <div style={style} onMouseDown={onMouseDown} onTouchStart={onTouchStart} />;
}
