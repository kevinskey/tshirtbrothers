import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Canvas as FabricCanvas, FabricImage, Line, FabricText, Rect } from 'fabric';
import {
  ArrowLeft, Maximize, Layout, Download, Save, Upload,
  FolderOpen, Trash2, Loader2, Plus, Minus,
  DollarSign, Info, X, Wand2, Eraser
} from 'lucide-react';
import {
  SHEET_WIDTH_PX, PX_PER_FOOT, DISPLAY_SCALE, MAX_SHEET_LENGTH_FT,
  DESIGN_SPACING_PX, EDGE_PADDING_PX, PRICING, GRID_COLOR_MAJOR, GRID_COLOR_MINOR, GRID_LABEL_COLOR,
  SIZE_PRESETS,
  pxToInches, pxToFeet, inchesToPx, feetToPx, calculateSheetCost,
  type PricingTier
} from '@/lib/gangsheet/constants';
import { calculateDPI, getDPIStatus, getImageDimensions, DPI_COLORS } from '@/lib/gangsheet/dpiUtils';
import { packDesigns, type PackItem } from '@/lib/gangsheet/binPacking';

// Types
interface DesignItem {
  id: string;
  name: string;
  imageUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  printWidthInches: number;
  printHeightInches: number;
  quantity: number;
  dpi: number;
}

function getToken() { return localStorage.getItem('tsb_token') || ''; }
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GangSheetBuilder() {
  const navigate = useNavigate();
  const { id: sheetId } = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sheet state
  const [sheetName, setSheetName] = useState('Untitled Sheet');
  const [designs, setDesigns] = useState<DesignItem[]>([]);
  const [pricingTier, setPricingTier] = useState<PricingTier>('standard');
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(!!sheetId);
  const [dbId, setDbId] = useState<number | null>(sheetId ? parseInt(sheetId) : null);

  // UI state
  const [activePanel, setActivePanel] = useState<'upload' | 'library' | 'pricing' | null>('upload');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [selectedDesign, setSelectedDesign] = useState<string | null>(null);
  const [sheetLengthFt, setSheetLengthFt] = useState(1);
  const [designCount, setDesignCount] = useState(0);
  const [fitError, setFitError] = useState<string | null>(null);
  const [aiBusyId, setAiBusyId] = useState<string | null>(null);

  // Library data
  const [libraryDesigns, setLibraryDesigns] = useState<{ id: number; name: string; image_url: string; category?: string }[]>([]);
  const [quoteDesigns, setQuoteDesigns] = useState<{ id: number; customer_name: string; design_url: string; product_name: string }[]>([]);

  // ─── Canvas Initialization ──────────────────────────────────────────────

  const initCanvas = useCallback(() => {
    if (!canvasRef.current || fabricRef.current) return;

    const initialHeight = feetToPx(1); // 12 inches (1 ft) — user changes via the Length input
    const canvas = new FabricCanvas(canvasRef.current, {
      width: SHEET_WIDTH_PX,
      height: initialHeight,
      backgroundColor: '#ffffff',
      selection: true,
    });

    // Set initial zoom to fit viewport.
    // IMPORTANT: when using setZoom(scale), we must NOT also shrink CSS via
    // cssOnly — that would double-apply the scale (once by fabric's zoom,
    // once by CSS compression). Shrink bitmap + CSS together so zoom alone
    // handles the downscale.
    const container = containerRef.current;
    const viewportWidth = container ? container.clientWidth - 40 : 800;
    const scale = viewportWidth / SHEET_WIDTH_PX;
    canvas.setZoom(scale);
    canvas.setDimensions({
      width: SHEET_WIDTH_PX * scale,
      height: initialHeight * scale,
    });

    setZoom(scale);
    drawGrid(canvas, initialHeight);
    fabricRef.current = canvas;

    // Selection events
    canvas.on('selection:created', (e) => {
      const obj = e.selected?.[0];
      if ((obj as any)?.data?.designId) setSelectedDesign((obj as any).data.designId);
    });
    canvas.on('selection:cleared', () => setSelectedDesign(null));

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cleanup = initCanvas();
    return () => cleanup?.();
  }, [initCanvas]);

  // ─── Grid Drawing ───────────────────────────────────────────────────────

  function drawGrid(canvas: FabricCanvas, height: number) {
    // Remove existing grid
    const objects = canvas.getObjects();
    objects.forEach(obj => {
      if ((obj as any).data?.isGrid) canvas.remove(obj);
    });

    // Horizontal lines (1-foot intervals)
    for (let ft = 1; ft <= pxToFeet(height); ft++) {
      const y = ft * PX_PER_FOOT;
      const line = new Line([0, y, SHEET_WIDTH_PX, y], {
        stroke: GRID_COLOR_MAJOR,
        strokeWidth: 2,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        data: { isGrid: true },
      });
      canvas.add(line);

      const label = new FabricText(`${ft} ft`, {
        left: 20,
        top: y + 10,
        fontSize: 36,
        fill: GRID_LABEL_COLOR,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        data: { isGrid: true },
      });
      canvas.add(label);
    }

    // Vertical lines (1-inch intervals, subtle)
    for (let inch = 1; inch < 22; inch++) {
      const x = inch * 300;
      const line = new Line([x, 0, x, height], {
        stroke: GRID_COLOR_MINOR,
        strokeWidth: 1,
        selectable: false,
        evented: false,
        excludeFromExport: true,
        data: { isGrid: true },
      });
      canvas.add(line);
    }

    // Border
    const border = new Line([SHEET_WIDTH_PX - 1, 0, SHEET_WIDTH_PX - 1, height], {
      stroke: '#d1d5db',
      strokeWidth: 2,
      selectable: false,
      evented: false,
      excludeFromExport: true,
      data: { isGrid: true },
    });
    canvas.add(border);

    // Safe-zone dashed outline: 0.25" inset from every edge.
    // Stroke is thick in canvas-units because canvas display is zoomed way down.
    const safeZone = new Rect({
      left: EDGE_PADDING_PX,
      top: EDGE_PADDING_PX,
      width: SHEET_WIDTH_PX - 2 * EDGE_PADDING_PX,
      height: height - 2 * EDGE_PADDING_PX,
      fill: 'rgba(0,0,0,0)',
      stroke: '#ea580c',
      strokeWidth: 20,
      strokeDashArray: [60, 40],
      strokeUniform: true,
      selectable: false,
      evented: false,
      excludeFromExport: true,
      data: { isGrid: true },
    });
    canvas.add(safeZone);

    canvas.sendObjectToBack(border);
    canvas.renderAll();
  }

  // ─── Design Management ──────────────────────────────────────────────────

  async function loadFabricImage(url: string): Promise<FabricImage> {
    // Try with crossOrigin first (required for canvas export)
    try {
      return await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    } catch {
      // Fallback: load without CORS (canvas will be tainted, export may not work
      // but image will display)
      return await FabricImage.fromURL(url);
    }
  }

  async function addDesignToCanvas(imageUrl: string, name: string, targetWidthInches?: number) {
    const canvas = fabricRef.current;
    if (!canvas) return;

    try {
      const dims = await getImageDimensions(imageUrl);
      const maxWidth = pxToInches(dims.width);
      // Default: at least 6" so low-res graphics are still visible,
      // capped at 10" or the natural max if it's larger.
      const printW = targetWidthInches || Math.max(6, Math.min(maxWidth, 10));
      const printH = printW * (dims.height / dims.width);
      const dpi = calculateDPI(dims.width, printW);

      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const design: DesignItem = {
        id,
        name,
        imageUrl,
        naturalWidth: dims.width,
        naturalHeight: dims.height,
        printWidthInches: printW,
        printHeightInches: printH,
        quantity: 1,
        dpi,
      };

      setDesigns(prev => [...prev, design]);

      const img = await loadFabricImage(imageUrl);
      // Do NOT set img.width/height on Fabric Image — it crops instead of resizes.
      // Use HTMLImageElement.naturalWidth for scale math; fabric's img.width
      // should already match this once fromURL finishes loading.
      const el = img.getElement() as HTMLImageElement;
      const natW = el?.naturalWidth || dims.width;
      const targetW = inchesToPx(printW);
      const targetH = targetW * (dims.height / dims.width);
      const scale = targetW / natW;

      // Place the new graphic after any existing graphics: try to fit it to
      // the right of the right-most existing graphic on the bottom-most row;
      // if it won't fit, start a new row below all existing content.
      const existingObjs = canvas.getObjects().filter(o => !(o as any).data?.isGrid);
      let startLeft = EDGE_PADDING_PX;
      let startTop = EDGE_PADDING_PX;
      if (existingObjs.length > 0) {
        let maxBottom = EDGE_PADDING_PX;
        let rightmostOnLastRow = EDGE_PADDING_PX;
        let lastRowTop = 0;
        for (const o of existingObjs) {
          const b = (o.top || 0) + (o.getScaledHeight?.() || 0);
          if (b > maxBottom) maxBottom = b;
        }
        // Find objects whose bottom == maxBottom (i.e. live in the last row)
        for (const o of existingObjs) {
          const b = (o.top || 0) + (o.getScaledHeight?.() || 0);
          if (Math.abs(b - maxBottom) < 2) {
            const r = (o.left || 0) + (o.getScaledWidth?.() || 0);
            if (r > rightmostOnLastRow) rightmostOnLastRow = r;
            if ((o.top || 0) > lastRowTop) lastRowTop = (o.top || 0);
          }
        }
        const candidateLeft = rightmostOnLastRow + DESIGN_SPACING_PX;
        if (candidateLeft + targetW <= SHEET_WIDTH_PX - EDGE_PADDING_PX) {
          startLeft = candidateLeft;
          startTop = lastRowTop;
        } else {
          startLeft = EDGE_PADDING_PX;
          startTop = maxBottom + DESIGN_SPACING_PX;
        }
      }

      img.set({
        left: startLeft,
        top: startTop,
        scaleX: scale,
        scaleY: scale,
        data: { designId: id, natW } as any,
      });
      // Reference targetH so linting doesn't complain (also helps document intent)
      void targetH;
      console.log('[gangsheet] add', {
        name,
        printW,
        natW,
        targetW,
        scale,
        fabricWidth: img.width,
        renderedCanvasPx: natW * scale,
        sheetPx: SHEET_WIDTH_PX,
        pctOfSheet: `${((natW * scale) / SHEET_WIDTH_PX * 100).toFixed(1)}%`,
        existingCount: existingObjs.length,
        placedAt: { left: startLeft, top: startTop },
      });

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      resolveOverlaps();
      checkFit();
      recalculateSheet();
    } catch (err) {
      console.error('Failed to add design:', err);
      alert('Failed to load image. Make sure it is accessible.');
    }
  }

  function removeDesign(designId: string) {
    const canvas = fabricRef.current;
    if (!canvas) return;

    // Remove ALL fabric objects that belong to this design (including clones)
    const objs = canvas.getObjects().filter(o => (o as any).data?.designId === designId);
    for (const o of objs) canvas.remove(o);

    setDesigns(prev => prev.filter(d => d.id !== designId));
    setSelectedDesign(null);
    checkFit();
    recalculateSheet();
  }

  async function updateDesignQuantity(designId: string, qty: number) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const clamped = Math.max(1, qty);
    const design = designs.find((d) => d.id === designId);
    setDesigns(prev => prev.map(d => d.id === designId ? { ...d, quantity: clamped } : d));
    if (!design) return;

    // Keep fabric object count in sync with quantity.
    const existing = canvas.getObjects().filter(o => (o as any).data?.designId === designId) as FabricImage[];
    console.log('[gangsheet] quantity', { designId, clamped, existingCount: existing.length });
    if (existing.length === clamped) return;

    if (existing.length > clamped) {
      for (let i = existing.length - 1; i >= clamped; i--) {
        canvas.remove(existing[i]!);
      }
      canvas.renderAll();
      checkFit();
      recalculateSheet();
      return;
    }

    // Too few: create additional copies from the same image URL so CORS-tainted
    // canvases don't break clone().
    const template = existing[0];
    if (!template) return;
    // Use the LAST existing copy as our starting anchor so we don't overlap
    // copies that were already placed in previous quantity bumps.
    const anchor = existing[existing.length - 1] ?? template;
    const need = clamped - existing.length;
    const scale = (template.scaleX as number) || 1;
    const copyW = (template.getScaledWidth?.() || inchesToPx(design.printWidthInches));
    const copyH = (template.getScaledHeight?.() || inchesToPx(design.printHeightInches));

    // Start one slot to the right of the last existing copy; if that'd overflow
    // the sheet width, wrap to the next row.
    let cursorX = (anchor.left || EDGE_PADDING_PX) + copyW + DESIGN_SPACING_PX;
    let cursorY = (anchor.top || EDGE_PADDING_PX);
    if (cursorX + copyW > SHEET_WIDTH_PX - EDGE_PADDING_PX) {
      cursorX = EDGE_PADDING_PX;
      cursorY += copyH + DESIGN_SPACING_PX;
    }
    for (let i = 0; i < need; i++) {
      // eslint-disable-next-line no-await-in-loop
      const img = await loadFabricImage(design.imageUrl);
      img.set({
        left: cursorX,
        top: cursorY,
        scaleX: scale,
        scaleY: scale,
        data: { designId } as any,
      });
      canvas.add(img);
      cursorX += copyW + DESIGN_SPACING_PX;
      if (cursorX + copyW > SHEET_WIDTH_PX - EDGE_PADDING_PX) {
        cursorX = EDGE_PADDING_PX;
        cursorY += copyH + DESIGN_SPACING_PX;
      }
    }
    canvas.renderAll();
    resolveOverlaps();
    checkFit();
    recalculateSheet();
  }

  // Check whether all graphics fit inside the user's chosen sheet length.
  // If they overflow, the canvas is grown VISUALLY so you can see the extra
  // rows, but `sheetLengthFt` (the price/save length) is NOT changed — an
  // error banner tells you to bump the length manually.
  function checkFit() {
    const canvas = fabricRef.current;
    if (!canvas) {
      setFitError(null);
      return true;
    }
    const objects = canvas.getObjects().filter((o) => !(o as any).data?.isGrid);
    let maxY = 0;
    let overWidth = false;
    for (const obj of objects) {
      const right = (obj.left || 0) + (obj.getScaledWidth?.() || 0);
      const bottom = (obj.top || 0) + (obj.getScaledHeight?.() || 0);
      if (right > SHEET_WIDTH_PX + 1) overWidth = true;
      if (bottom > maxY) maxY = bottom;
    }
    const declaredSheetPx = feetToPx(sheetLengthFt);
    const neededPx = Math.max(declaredSheetPx, maxY + DESIGN_SPACING_PX);
    const currentBitmapHeight = canvas.getHeight();
    const currentSheetPxHeight = currentBitmapHeight / (zoom || 1);
    // Grow canvas visually if needed so all copies are visible.
    if (Math.abs(neededPx - currentSheetPxHeight) > 1) {
      canvas.setDimensions({
        width: SHEET_WIDTH_PX * zoom,
        height: neededPx * zoom,
      });
      drawGrid(canvas, neededPx);
      canvas.renderAll();
    }
    if (overWidth) {
      setFitError(`Graphic is wider than the 22" sheet. Reduce the width.`);
      return false;
    }
    if (maxY > declaredSheetPx + 1) {
      // Auto-bump the declared sheet length so pricing matches what fits.
      const neededFt = Math.ceil(pxToFeet(maxY + DESIGN_SPACING_PX));
      if (neededFt > MAX_SHEET_LENGTH_FT) {
        setSheetLengthFt(MAX_SHEET_LENGTH_FT);
        setFitError(`Designs need ${neededFt} ft but the max sheet length is ${MAX_SHEET_LENGTH_FT} ft. Split into two sheets, or reduce size/quantity.`);
        return false;
      }
      setSheetLengthFt(neededFt);
    }
    setFitError(null);
    return true;
  }

  // Trim fully-transparent pixels around the image so the subject fills the
  // bounding box. Used after Remove BG to reclaim the empty space the
  // background occupied.
  async function autoCropTransparent(dataUrl: string, alphaThreshold = 8): Promise<string> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    const sctx = src.getContext('2d');
    if (!sctx) return dataUrl;
    sctx.drawImage(img, 0, 0);
    const data = sctx.getImageData(0, 0, w, h).data;

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = data[(y * w + x) * 4 + 3];
        if (a !== undefined && a > alphaThreshold) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return dataUrl; // fully transparent — nothing to crop
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    if (cropW === w && cropH === h) return dataUrl; // already tight
    const out = document.createElement('canvas');
    out.width = cropW;
    out.height = cropH;
    const octx = out.getContext('2d');
    if (!octx) return dataUrl;
    octx.drawImage(src, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    return out.toDataURL('image/png');
  }

  async function uploadDataUrlToSpaces(dataUrl: string, filename: string): Promise<string> {
    try {
      const res = await fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ imageBase64: dataUrl, filename, customerEmail: 'admin-gangsheet' }),
      });
      if (!res.ok) return dataUrl; // fall back to dataUrl if upload fails
      const data = await res.json();
      return data.url || dataUrl;
    } catch {
      return dataUrl;
    }
  }

  async function applyProcessedImage(designId: string, dataUrl: string, shrinkToNewDims = false) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    // Measure new dims
    const dims = await getImageDimensions(dataUrl);
    const design = designs.find((d) => d.id === designId);
    if (!design) return;

    // If the processed image was cropped (e.g. background removed + trimmed),
    // shrink the print width proportionally so the subject stays at its
    // original physical size — reclaiming the empty background space on
    // the gang sheet instead of stretching the subject to fill it.
    let printW = design.printWidthInches;
    if (shrinkToNewDims && design.naturalWidth > 0) {
      const widthRatio = dims.width / design.naturalWidth;
      printW = Math.max(0.5, design.printWidthInches * widthRatio);
    }
    const printH = printW * (dims.height / dims.width);
    const newDpi = calculateDPI(dims.width, printW);

    // Upload the processed image to Spaces so future AI calls can pass a URL
    // instead of a giant base64 body (which causes 413 Payload Too Large).
    const uploadedUrl = await uploadDataUrlToSpaces(dataUrl, `${design.name || 'design'}-processed.png`);

    setDesigns((prev) => prev.map((d) => (d.id === designId ? {
      ...d,
      imageUrl: uploadedUrl,
      naturalWidth: dims.width,
      naturalHeight: dims.height,
      printWidthInches: printW,
      printHeightInches: printH,
      dpi: newDpi,
    } : d)));

    // Replace all fabric objects tied to this design
    const oldObjs = canvas.getObjects().filter((o) => (o as any).data?.designId === designId);
    for (const old of oldObjs) {
      const img = await loadFabricImage(dataUrl);
      const scale = inchesToPx(printW) / dims.width;
      img.set({
        left: old.left || 0,
        top: old.top || 0,
        scaleX: scale,
        scaleY: scale,
        data: { designId, natW: dims.width } as any,
      });
      canvas.remove(old);
      canvas.add(img);
    }
    canvas.renderAll();
    resolveOverlaps();
    checkFit();
    recalculateSheet();
  }

  async function handleRemoveBg(designId: string) {
    const design = designs.find((d) => d.id === designId);
    if (!design || aiBusyId) return;
    setAiBusyId(designId);
    try {
      const body = design.imageUrl.startsWith('data:')
        ? { imageBase64: design.imageUrl }
        : { imageUrl: design.imageUrl };
      const res = await fetch('/api/design/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `remove-bg request failed (${res.status})`);
      if (!data.imageBase64) throw new Error('no image returned');
      // Trim the now-transparent background space so the subject fills the image,
      // and pass shrinkToNewDims so the print width shrinks proportionally
      // (reclaiming gang-sheet space instead of stretching the subject).
      const trimmed = await autoCropTransparent(data.imageBase64);
      await applyProcessedImage(designId, trimmed, true);
    } catch (err: any) {
      console.error(err);
      alert(`Background removal failed: ${err?.message || err}`);
    } finally {
      setAiBusyId(null);
    }
  }

  async function handleFixDpi(designId: string) {
    const design = designs.find((d) => d.id === designId);
    if (!design || aiBusyId) return;
    setAiBusyId(designId);
    try {
      const body = design.imageUrl.startsWith('data:')
        ? { imageBase64: design.imageUrl, scale: 4 }
        : { imageUrl: design.imageUrl, scale: 4 };
      const res = await fetch('/api/design/upscale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `upscale request failed (${res.status})`);
      if (!data.imageBase64) throw new Error('no image returned');
      await applyProcessedImage(designId, data.imageBase64);
    } catch (err: any) {
      console.error(err);
      alert(`Upscaling failed: ${err?.message || err}`);
    } finally {
      setAiBusyId(null);
    }
  }

  function updateDesignSize(designId: string, widthInches: number) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const clampedW = Math.max(0.5, Math.min(22, widthInches));
    const target = designs.find((d) => d.id === designId);
    if (!target) return;
    const heightInches = clampedW * (target.naturalHeight / target.naturalWidth);
    const dpi = calculateDPI(target.naturalWidth, clampedW);
    setDesigns((prev) => prev.map((d) => (d.id === designId ? { ...d, printWidthInches: clampedW, printHeightInches: heightInches, dpi } : d)));
    const objs = canvas.getObjects().filter((o) => (o as any).data?.designId === designId);
    const targetPx = inchesToPx(clampedW);
    for (const obj of objs) {
      const img = obj as FabricImage;
      const el = img.getElement?.() as HTMLImageElement | undefined;
      const natW = el?.naturalWidth || (obj as any).data?.natW || target.naturalWidth;
      const scale = targetPx / natW;
      img.set({ scaleX: scale, scaleY: scale });
      img.setCoords();
      console.log('[gangsheet] resize', {
        designId,
        clampedW,
        targetPx,
        natW,
        scale,
        renderedCanvasPx: natW * scale,
        pctOfSheet: `${((natW * scale) / SHEET_WIDTH_PX * 100).toFixed(1)}%`,
      });
    }
    canvas.renderAll();
    resolveOverlaps();
    checkFit();
    recalculateSheet();
  }

  // After a size change, if any two objects overlap, bin-pack everything so
  // nobody's stacked on top of each other.
  function resolveOverlaps() {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const objects = canvas.getObjects().filter(o => !(o as any).data?.isGrid);
    if (objects.length < 2) return;
    const rects = objects.map((o) => ({
      obj: o,
      left: o.left || 0,
      top: o.top || 0,
      right: (o.left || 0) + (o.getScaledWidth?.() || 0),
      bottom: (o.top || 0) + (o.getScaledHeight?.() || 0),
    }));
    let hasOverlap = false;
    outer: for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i]!;
        const b = rects[j]!;
        if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
          hasOverlap = true;
          break outer;
        }
      }
    }
    if (!hasOverlap) return;

    // Build pack items (one per fabric object so packer knows about all copies)
    const items: PackItem[] = [];
    for (const d of designs) {
      const copies = objects.filter((o) => (o as any).data?.designId === d.id);
      for (let i = 0; i < copies.length; i++) {
        items.push({
          id: d.id + '#' + i,
          width: inchesToPx(d.printWidthInches),
          height: inchesToPx(d.printHeightInches),
          quantity: 1,
        });
      }
    }
    const result = packDesigns(items);

    // Map placements back to fabric objects
    const byDesign: Record<string, any[]> = {};
    for (const d of designs) {
      byDesign[d.id] = objects.filter((o) => (o as any).data?.designId === d.id);
    }
    const cursors: Record<string, number> = {};
    for (const placement of result.placements) {
      const designId = placement.id.split('#')[0]!;
      cursors[designId] = (cursors[designId] ?? -1) + 1;
      const list = byDesign[designId] ?? [];
      const obj = list[cursors[designId]!];
      if (obj) {
        obj.set({ left: placement.x, top: placement.y });
        obj.setCoords();
      }
    }
    canvas.renderAll();
  }

  function updateSheetLength(ft: number) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const newFt = Math.max(1, Math.min(MAX_SHEET_LENGTH_FT, Math.round(ft)));
    const newHeight = feetToPx(newFt);
    // Resize both bitmap and CSS so the zoom factor alone governs display scale
    canvas.setDimensions({
      width: SHEET_WIDTH_PX * zoom,
      height: newHeight * zoom,
    });
    drawGrid(canvas, newHeight);
    canvas.renderAll();
    setSheetLengthFt(newFt);
    checkFit();
  }

  // ─── Auto Layout ────────────────────────────────────────────────────────

  function autoLayout() {
    const canvas = fabricRef.current;
    if (!canvas || designs.length === 0) return;

    const items: PackItem[] = designs.map(d => ({
      id: d.id,
      width: inchesToPx(d.printWidthInches),
      height: inchesToPx(d.printHeightInches),
      quantity: d.quantity,
    }));

    const result = packDesigns(items);

    // Reposition all objects. Canvas grows visually via checkFit(); the
    // user's declared sheet length (sheetLengthFt) is NOT changed — if the
    // packed layout overflows that length, the banner tells them to bump it.
    for (const placement of result.placements) {
      const objs = canvas.getObjects().filter(o => (o as any).data?.designId === placement.id);
      const obj = objs[placement.instanceIndex] || objs[0];
      if (obj) {
        obj.set({ left: placement.x, top: placement.y });
        obj.setCoords();
      }
    }

    canvas.renderAll();
    checkFit();
    recalculateSheet();
  }

  // ─── Sheet Calculations ─────────────────────────────────────────────────

  function recalculateSheet() {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const objects = canvas.getObjects().filter(o => !(o as any).data?.isGrid);
    let maxY = 0;
    let count = 0;
    for (const obj of objects) {
      const bottom = (obj.top || 0) + (obj.getScaledHeight?.() || 0);
      if (bottom > maxY) maxY = bottom;
      count++;
    }

    const ft = Math.max(1, Math.ceil(pxToFeet(maxY + DESIGN_SPACING_PX)));
    setSheetLengthFt(ft);
    setDesignCount(count);
  }

  const totalCost = calculateSheetCost(sheetLengthFt, pricingTier);
  const costPerDesign = designCount > 0 ? totalCost / designCount : 0;

  // ─── Zoom Controls ──────────────────────────────────────────────────────

  function handleZoom(delta: number) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const newZoom = Math.max(0.05, Math.min(1, zoom + delta));
    // Figure out the sheet's native height from the current canvas bitmap.
    // canvas.getHeight() returns the bitmap height which we want to keep
    // proportional to newZoom.
    const currentBitmapHeight = canvas.getHeight();
    const currentZoom = zoom || 1;
    const sheetPxHeight = currentBitmapHeight / currentZoom;
    canvas.setZoom(newZoom);
    canvas.setDimensions({
      width: SHEET_WIDTH_PX * newZoom,
      height: sheetPxHeight * newZoom,
    });
    setZoom(newZoom);
  }

  function fitToWidth() {
    const container = containerRef.current;
    if (!container) return;
    const scale = (container.clientWidth - 40) / SHEET_WIDTH_PX;
    handleZoom(scale - zoom);
  }

  // ─── Export ─────────────────────────────────────────────────────────────

  async function handleExport() {
    const canvas = fabricRef.current;
    if (!canvas) return;

    setExporting(true);
    try {
      // Hide grid
      canvas.getObjects().forEach(obj => {
        if ((obj as any).data?.isGrid) obj.set('visible', false);
      });

      // Calculate used height
      const objects = canvas.getObjects().filter(o => !(o as any).data?.isGrid);
      let maxY = 0;
      for (const obj of objects) {
        const bottom = (obj.top || 0) + (obj.getScaledHeight?.() || 0);
        if (bottom > maxY) maxY = bottom;
      }
      const exportHeight = Math.max(PX_PER_FOOT, maxY + DESIGN_SPACING_PX);

      // Export at full resolution
      const savedZoom = canvas.getZoom();
      canvas.setZoom(1);
      canvas.setDimensions({ width: SHEET_WIDTH_PX, height: exportHeight }, { cssOnly: false });

      const dataUrl = canvas.toDataURL({
        format: 'png',
        multiplier: 1,
        left: 0,
        top: 0,
        width: SHEET_WIDTH_PX,
        height: exportHeight,
      });

      // Restore zoom
      canvas.setZoom(savedZoom);
      canvas.setDimensions({
        width: SHEET_WIDTH_PX * savedZoom,
        height: exportHeight * savedZoom,
      });

      // Restore grid
      canvas.getObjects().forEach(obj => {
        if ((obj as any).data?.isGrid) obj.set('visible', true);
      });
      canvas.renderAll();

      // Download
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `gangsheet-${sheetName.replace(/\s+/g, '-')}-${SHEET_WIDTH_PX}x${Math.round(exportHeight)}px-300dpi.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Try again.');
    } finally {
      setExporting(false);
    }
  }

  // ─── Save / Load ───────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const body = {
        name: sheetName,
        sheet_length_ft: sheetLengthFt,
        pricing_tier: pricingTier,
        total_cost: totalCost,
        designs: designs,
        status: 'draft',
      };

      if (dbId) {
        await fetch(`/api/admin/gangsheets/${dbId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
      } else {
        const res = await fetch('/api/admin/gangsheets', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: sheetName }) });
        const data = await res.json();
        setDbId(data.id);
        await fetch(`/api/admin/gangsheets/${data.id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
      }
    } catch { alert('Save failed'); }
    finally { setSaving(false); }
  }

  async function loadSheet() {
    if (!sheetId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/gangsheets/${sheetId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      setSheetName(data.name);
      setPricingTier(data.pricing_tier || 'standard');
      if (data.designs && Array.isArray(data.designs)) {
        setDesigns(data.designs);
        // Re-add designs to canvas
        for (const d of data.designs) {
          await addDesignToCanvas(d.imageUrl, d.name, d.printWidthInches);
        }
      }
    } catch { alert('Failed to load sheet'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (sheetId && fabricRef.current) loadSheet();
  }, [sheetId]);

  // ─── File Upload ────────────────────────────────────────────────────────

  async function handleFileUpload(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        // Upload to DO Spaces
        try {
          const uploadRes = await fetch('/api/quotes/upload-design', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
              imageBase64: dataUrl,
              filename: file.name,
              customerEmail: 'admin-gangsheet',
            }),
          });
          if (uploadRes.ok) {
            const { url } = await uploadRes.json();
            await addDesignToCanvas(url, file.name.replace(/\.[^.]+$/, ''));
          } else {
            // Use data URL directly as fallback
            await addDesignToCanvas(dataUrl, file.name.replace(/\.[^.]+$/, ''));
          }
        } catch {
          await addDesignToCanvas(dataUrl, file.name.replace(/\.[^.]+$/, ''));
        }
      };
      reader.readAsDataURL(file);
    }
  }

  // ─── Library Fetch ──────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/admin/designs-library', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setLibraryDesigns)
      .catch(() => {});

    fetch('/api/quotes', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.json() : [])
      .then((quotes: { id: number; customer_name: string; design_url: string | null; product_name: string; status: string }[]) => {
        setQuoteDesigns(quotes.filter(q => q.design_url && (q.status === 'accepted' || q.status === 'quoted')).map(q => ({
          id: q.id,
          customer_name: q.customer_name,
          design_url: q.design_url!,
          product_name: q.product_name,
        })));
      })
      .catch(() => {});
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 flex-shrink-0 z-10">
        <button onClick={() => navigate('/admin')} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm">
          <ArrowLeft className="w-4 h-4" /> Admin
        </button>
        <div className="w-px h-6 bg-gray-200" />

        {/* Sheet name */}
        <input
          type="text" value={sheetName}
          onChange={e => setSheetName(e.target.value)}
          className="text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-orange-500 focus:outline-none px-1 py-0.5 w-40 sm:w-56"
          style={{ fontSize: '16px' }}
        />

        <div className="flex-1" />

        {/* Zoom */}
        <div className="hidden sm:flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
          <button onClick={() => handleZoom(-0.02)} className="p-1 hover:bg-gray-200 rounded"><Minus className="w-3 h-3" /></button>
          <span className="text-xs font-mono w-10 text-center">{Math.round(zoom * 100 / DISPLAY_SCALE)}%</span>
          <button onClick={() => handleZoom(0.02)} className="p-1 hover:bg-gray-200 rounded"><Plus className="w-3 h-3" /></button>
          <button onClick={fitToWidth} className="p-1 hover:bg-gray-200 rounded" title="Fit to width"><Maximize className="w-3 h-3" /></button>
        </div>

        {/* Auto layout */}
        <button onClick={autoLayout} className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100">
          <Layout className="w-3 h-3" /> Auto Layout
        </button>

        {/* Info badges */}
        <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
          <span>{designCount} designs</span>
          <span>{sheetLengthFt}ft</span>
          <span className="font-bold text-green-700">${totalCost.toFixed(2)}</span>
        </div>

        <div className="w-px h-6 bg-gray-200" />

        {/* Actions */}
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
          <Save className="w-3 h-3" /> {saving ? '...' : 'Save'}
        </button>
        <button onClick={handleExport} disabled={exporting} className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50">
          <Download className="w-3 h-3" /> {exporting ? '...' : 'Export PNG'}
        </button>
      </header>

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Canvas Area ──────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {fitError && (
            <div className="bg-red-50 border-b border-red-200 text-red-800 text-sm px-4 py-2 flex items-center gap-2 flex-shrink-0">
              <span className="font-semibold">⚠ Doesn't fit:</span>
              <span className="flex-1">{fitError}</span>
              <button onClick={() => setFitError(null)} className="text-red-500 hover:text-red-700 text-xs">Dismiss</button>
            </div>
          )}
          <div
            ref={containerRef}
            className="flex-1 overflow-auto bg-gray-200 p-5 flex justify-center"
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
            onDrop={e => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
          >
            <div className="inline-block shadow-2xl">
              <canvas ref={canvasRef} />
            </div>
          </div>
        </div>

        {/* ── Sidebar (desktop right-side / mobile bottom drawer) ────── */}
        {mobilePanelOpen && (
          <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setMobilePanelOpen(false)} />
        )}
        <div className={`
          bg-white border-gray-200 flex flex-col overflow-hidden flex-shrink-0
          md:w-80 md:border-l md:static md:flex md:translate-y-0
          fixed bottom-0 left-0 right-0 z-40 rounded-t-2xl border-t max-h-[80vh] transition-transform
          ${mobilePanelOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
        `}>
          {/* Mobile drawer handle + close */}
          <div className="flex items-center justify-between px-3 pt-2 md:hidden">
            <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto" />
            <button onClick={() => setMobilePanelOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 absolute right-2 top-2">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {([
              { key: 'upload', icon: Upload, label: 'Upload' },
              { key: 'library', icon: FolderOpen, label: 'Library' },
              { key: 'pricing', icon: DollarSign, label: 'Cost' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActivePanel(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-xs font-medium transition ${
                  activePanel === tab.key ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Upload Panel */}
            {activePanel === 'upload' && (
              <div className="space-y-4">
                <label className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-200 rounded-xl p-6 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition">
                  <Upload className="w-8 h-8 text-gray-300" />
                  <span className="text-sm font-medium text-gray-500">Drop designs here or click to upload</span>
                  <span className="text-[10px] text-gray-400">PNG, JPG, SVG · 300 DPI recommended</span>
                  <input type="file" multiple accept=".png,.jpg,.jpeg,.svg,.webp,.tiff" className="hidden"
                    onChange={e => handleFileUpload(e.target.files)} />
                </label>

                {/* Sheet size controls */}
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase">Sheet Size</p>
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-600">Length (ft)</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => updateSheetLength(sheetLengthFt - 1)} className="w-6 h-6 rounded bg-white border border-gray-200 text-gray-600 flex items-center justify-center text-xs hover:bg-gray-100">−</button>
                      <input
                        type="number"
                        min={1}
                        max={MAX_SHEET_LENGTH_FT}
                        value={sheetLengthFt}
                        onChange={(e) => updateSheetLength(parseInt(e.target.value) || 1)}
                        className="w-14 px-2 py-1 text-xs text-center border border-gray-200 rounded focus:outline-none focus:border-orange-500"
                      />
                      <button onClick={() => updateSheetLength(sheetLengthFt + 1)} className="w-6 h-6 rounded bg-white border border-gray-200 text-gray-600 flex items-center justify-center text-xs hover:bg-gray-100">+</button>
                    </div>
                  </label>
                  <p className="text-[10px] text-gray-400">Width fixed at 22". Set the length manually — if your graphics don't fit you'll get a warning.</p>
                </div>

                {/* Design list */}
                {designs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Designs on Sheet ({designs.length})</p>
                    {designs.map(d => {
                      const status = getDPIStatus(d.dpi);
                      const colors = DPI_COLORS[status];
                      return (
                        <div key={d.id} className={`p-2 rounded-lg border ${selectedDesign === d.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
                          <div className="flex items-center gap-2">
                            <img src={d.imageUrl} alt="" className="w-10 h-10 object-contain rounded bg-gray-50 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">{d.name}</p>
                              <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${colors.bg} ${colors.text}`}>
                                {d.dpi} DPI · {colors.label}
                              </span>
                            </div>
                            <button onClick={() => removeDesign(d.id)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-gray-500 font-medium">Width (in)</span>
                              <input
                                type="number"
                                min={0.5}
                                max={22}
                                step={0.25}
                                value={d.printWidthInches.toFixed(2)}
                                onChange={(e) => updateDesignSize(d.id, parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-orange-500"
                              />
                            </label>
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-gray-500 font-medium">Quantity</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => updateDesignQuantity(d.id, d.quantity - 1)} className="w-6 h-6 rounded bg-gray-100 text-gray-600 flex items-center justify-center text-xs hover:bg-gray-200">−</button>
                                <input
                                  type="number"
                                  min={1}
                                  value={d.quantity}
                                  onChange={(e) => updateDesignQuantity(d.id, parseInt(e.target.value) || 1)}
                                  className="flex-1 min-w-0 px-1 py-1 text-xs text-center border border-gray-200 rounded focus:outline-none focus:border-orange-500"
                                />
                                <button onClick={() => updateDesignQuantity(d.id, d.quantity + 1)} className="w-6 h-6 rounded bg-gray-100 text-gray-600 flex items-center justify-center text-xs hover:bg-gray-200">+</button>
                              </div>
                            </label>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">Height: {d.printHeightInches.toFixed(2)}"</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {SIZE_PRESETS.map((p) => (
                              <button
                                key={p.label}
                                onClick={() => updateDesignSize(d.id, p.width)}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-orange-100 hover:text-orange-700 transition"
                                title={`${p.width}" × ~${p.height}"`}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleRemoveBg(d.id)}
                              disabled={aiBusyId === d.id}
                              className="flex-1 flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-lg bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50"
                              title="Use AI to remove the background"
                            >
                              {aiBusyId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eraser className="w-3 h-3" />}
                              Remove BG
                            </button>
                            <button
                              onClick={() => handleFixDpi(d.id)}
                              disabled={aiBusyId === d.id}
                              className="flex-1 flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                              title="Use AI to upscale 4× and fix low DPI"
                            >
                              {aiBusyId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                              Fix DPI
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Library Panel */}
            {activePanel === 'library' && (() => {
              // Group Design Lab items by category (alphabetical; 'general'/empty last)
              const grouped: Record<string, typeof libraryDesigns> = {};
              for (const d of libraryDesigns) {
                const cat = (d.category || 'general').toLowerCase();
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(d);
              }
              const categoryKeys = Object.keys(grouped).sort((a, b) => {
                if (a === 'general') return 1;
                if (b === 'general') return -1;
                return a.localeCompare(b);
              });
              const catLabel = (key: string) => key.replace(/\b\w/g, (c) => c.toUpperCase());

              return (
                <div className="space-y-4">
                  {/* Customer / user graphics first */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">User Graphics ({quoteDesigns.length})</p>
                    {quoteDesigns.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No customer designs</p>
                    ) : (
                      <div className="space-y-2">
                        {quoteDesigns.map(q => (
                          <button key={q.id} onClick={async () => { await addDesignToCanvas(q.design_url, `${q.customer_name} - ${q.product_name}`); setActivePanel('upload'); setMobilePanelOpen(false); }}
                            className="w-full flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:border-orange-400 transition text-left">
                            <img src={q.design_url} alt="" className="w-10 h-10 object-contain rounded bg-gray-50 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">{q.customer_name}</p>
                              <p className="text-[10px] text-gray-400 truncate">{q.product_name}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Design Lab grouped by category */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Design Lab ({libraryDesigns.length})</p>
                    {libraryDesigns.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No saved designs</p>
                    ) : (
                      <div className="space-y-3">
                        {categoryKeys.map((cat) => {
                          const items = grouped[cat] ?? [];
                          return (
                            <div key={cat}>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">{catLabel(cat)} ({items.length})</p>
                              <div className="grid grid-cols-3 gap-2">
                                {items.map((d) => (
                                  <button key={d.id} onClick={async () => { await addDesignToCanvas(d.image_url, d.name); setActivePanel('upload'); setMobilePanelOpen(false); }}
                                    className="aspect-square bg-gray-50 rounded-lg border border-gray-200 overflow-hidden hover:border-orange-400 hover:shadow-md transition p-1"
                                    title={d.name}>
                                    <img src={d.image_url} alt={d.name} className="w-full h-full object-contain" />
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Pricing Panel */}
            {activePanel === 'pricing' && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase">KolorMatrix Pricing</p>

                {/* Tier selector */}
                <div className="space-y-2">
                  {(Object.entries(PRICING) as [PricingTier, typeof PRICING[PricingTier]][]).map(([key, tier]) => (
                    <button key={key} onClick={() => setPricingTier(key)}
                      className={`w-full text-left p-3 rounded-xl border-2 transition ${
                        pricingTier === key ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                      }`}>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-900">{tier.label}</span>
                        <span className="text-sm font-bold text-orange-600">${tier.rate}/ft</span>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-0.5">{tier.desc}</p>
                    </button>
                  ))}
                </div>

                {/* Cost breakdown */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Sheet Length</span>
                    <span className="font-bold text-gray-900">{sheetLengthFt} ft</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Rate</span>
                    <span className="text-gray-900">${PRICING[pricingTier].rate}/ft</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Designs</span>
                    <span className="text-gray-900">{designCount}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between">
                    <span className="text-sm font-semibold text-gray-900">Total Cost</span>
                    <span className="text-lg font-black text-green-700">${totalCost.toFixed(2)}</span>
                  </div>
                  {designCount > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Cost per design</span>
                      <span className="font-semibold">${costPerDesign.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Sheet dimensions */}
                <div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">
                  <p className="font-semibold mb-1"><Info className="w-3 h-3 inline mr-1" />Sheet Specs</p>
                  <p>Width: 22" (6,600px at 300 DPI)</p>
                  <p>Length: {sheetLengthFt}ft ({(sheetLengthFt * 12).toFixed(0)}" / {(sheetLengthFt * PX_PER_FOOT).toLocaleString()}px)</p>
                  <p>Resolution: 300 DPI (print-ready)</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile Bottom Bar ──────────────────────────────────────────── */}
      <div className="md:hidden bg-white border-t border-gray-200 px-3 py-2 flex items-center gap-2 overflow-x-auto flex-shrink-0">
        <button
          onClick={() => { setActivePanel('upload'); setMobilePanelOpen(true); }}
          className="flex items-center gap-1 px-3 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg whitespace-nowrap"
        >
          <Plus className="w-3 h-3" /> Add Graphics
        </button>
        <button onClick={autoLayout} className="flex items-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg whitespace-nowrap">
          <Layout className="w-3 h-3" /> Layout
        </button>
        <span className="text-xs text-gray-500 whitespace-nowrap">{designCount} · {sheetLengthFt}ft</span>
        <span className="text-xs font-bold text-green-700 whitespace-nowrap">${totalCost.toFixed(2)}</span>
        <div className="flex-1" />
        <button onClick={handleExport} disabled={exporting} className="px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap">
          {exporting ? '...' : 'Export'}
        </button>
      </div>
    </div>
  );
}
