import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Canvas as FabricCanvas, FabricImage, Line, FabricText, Rect } from 'fabric';
import {
  ArrowLeft, Maximize, Layout, Download, Save, Upload,
  FolderOpen, Trash2, Loader2, Plus, Minus,
  DollarSign, Info, X, Wand2, Eraser, RotateCw, Undo2
} from 'lucide-react';
import {
  SHEET_WIDTH_PX, PX_PER_FOOT, DISPLAY_SCALE, MAX_SHEET_LENGTH_FT, MIN_SHEET_LENGTH_FT,
  DESIGN_SPACING_PX, EDGE_PADDING_PX, PRICING, GRID_COLOR_MAJOR, GRID_COLOR_MINOR, GRID_LABEL_COLOR,
  SIZE_PRESETS,
  pxToInches, pxToFeet, inchesToPx, feetToPx,
  type PricingTier
} from '@/lib/gangsheet/constants';
import { calculateDPI, getDPIStatus, getImageDimensions, DPI_COLORS } from '@/lib/gangsheet/dpiUtils';
import { packDesigns, type PackItem } from '@/lib/gangsheet/binPacking';
import { loadFabricImage } from '@tshirtbrothers/design-studio';

// Types
interface DesignSnapshot {
  imageUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  printWidthInches: number;
  printHeightInches: number;
  dpi: number;
}

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
  rotation?: number; // degrees, 0/90/180/270
  history?: DesignSnapshot[]; // stack of previous states for undo
}

function getToken() { return localStorage.getItem('tsb_token') || ''; }
const authHeaders = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

// Umami custom event, if the tracker loaded (adblock / script failure = no-op).
// Copied idiom from DtfStorePage.tsx rather than imported — page/component
// modules in this app don't import helpers from each other.
function trackEvent(event: string, data?: Record<string, unknown>): void {
  const w = window as unknown as {
    umami?: { track: (e: string, d?: Record<string, unknown>) => void };
  };
  try { w.umami?.track(event, data); } catch { /* analytics must never break the page */ }
}

// sessionStorage stash DtfStorePage restores on mount — key + shape must
// match DtfStorePage.tsx's UPLOAD_STASH_KEY / UploadedFile exactly (see
// that file's comment on why it survives a Stripe back-button trip).
const DTF_UPLOAD_STASH_KEY = 'dtf_upload_stash';

// Mirrors server/routes/gangsheetStore.js's SHEET_CAP so the "x of 20
// sheets" copy in the My Sheets panel matches what the server enforces.
const CUSTOMER_SHEET_CAP = 20;

interface GangSheetBuilderProps {
  // 'customer' points the sheet CRUD calls at /api/gangsheet-store/sheets
  // (own-sheets-only, enforced server-side), hides admin-only panels, and
  // enables the checkout handoff. Defaults to 'admin' so the existing
  // /admin/gangsheet route needs no changes.
  mode?: 'admin' | 'customer';
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function GangSheetBuilder({ mode = 'admin' }: GangSheetBuilderProps = {}) {
  const navigate = useNavigate();
  const { id: sheetId } = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const apiBase = mode === 'customer' ? '/api/gangsheet-store/sheets' : '/api/admin/gangsheets';

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
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // My Sheets panel (customer mode only) — list of the customer's own saved
  // sheets, fetched from the same /sheets endpoint persistSheet() writes to.
  const [mySheets, setMySheets] = useState<{ id: number; name: string; sheet_length_ft: number; status: string; updated_at: string }[]>([]);
  const [mySheetsOpen, setMySheetsOpen] = useState(false);
  const [mySheetsLoading, setMySheetsLoading] = useState(false);

  // Live min_ft/max_ft from the store's admin-editable settings, captured
  // alongside liveRates below. Falls back to the static constants until the
  // fetch resolves (or if it never does) — same fallback idiom as
  // effectiveRates just below.
  const [configLimits, setConfigLimits] = useState<{ minFt: number; maxFt: number }>({
    minFt: MIN_SHEET_LENGTH_FT,
    maxFt: MAX_SHEET_LENGTH_FT,
  });

  // Formerly capped at 11 ft for the CUSTOMER builder (Chrome's 2D canvas
  // area ceiling of ~268M px² made anything longer un-exportable in-browser
  // — see git history for the old "I3 recalibration" note). The customer
  // checkout handoff (handleCheckoutSheet) no longer runs canvas export at
  // all: it POSTs placement JSON to /api/gangsheet-store/compose and the
  // server renders the sheet with sharp, so the browser's canvas ceiling is
  // irrelevant to that path now. Both modes use the full store-configured
  // max_ft; the pre-checkout guard in handleCheckoutSheet still enforces it
  // (and /compose enforces it again server-side, authoritatively).
  // ADMIN mode's Export PNG button (handleExport) is UNCHANGED — it still
  // runs generateFullResExport() client-side, so its own 250M px² budget +
  // dataURL sanity check remain the real backstop for that path.
  const BUILDER_MAX_FT = configLimits.maxFt;

  // Live $/ft rates from the store's admin-editable settings — the PRICING
  // constants below are stale display copy (e.g. $6/$8/$12) that don't match
  // what /dtf actually charges (server-side rates.standard/rush/hot_rush,
  // in cents). null until the fetch resolves; effectiveRates (below) falls
  // back to PRICING only if the fetch never succeeds. Fetched in BOTH
  // modes — admin should see the true price too, since total_cost persists
  // into gang_sheets and surfaces in AdminPage's sheet list.
  const [liveRates, setLiveRates] = useState<Record<PricingTier, number> | null>(null);
  useEffect(() => {
    fetch('/api/gangsheet-store/config')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`config ${r.status}`))))
      .then((data: { rates?: { standard?: unknown; rush?: unknown; hot_rush?: unknown }; min_ft?: unknown; max_ft?: unknown }) => {
        const rates = data.rates;
        if (
          !rates || typeof rates.standard !== 'number' || typeof rates.rush !== 'number'
          || typeof rates.hot_rush !== 'number'
        ) {
          throw new Error('unexpected /config shape');
        }
        // Server cents -> display dollars; hot_rush (server) -> hotRush
        // (PricingTier) is the only key that doesn't map 1:1.
        setLiveRates({
          standard: rates.standard / 100,
          rush: rates.rush / 100,
          hotRush: rates.hot_rush / 100,
        });
        // min_ft/max_ft (I2) travel with the same response but are validated
        // separately — a malformed rates shape above already threw, so a bad
        // shape here just leaves configLimits at its static-constant default
        // instead of failing the whole fetch.
        if (typeof data.min_ft === 'number' && typeof data.max_ft === 'number') {
          setConfigLimits({ minFt: data.min_ft, maxFt: data.max_ft });
        }
      })
      .catch((err) => {
        console.error('[gangsheet] failed to load live store rates — falling back to static PRICING constants:', err);
      });
  }, []);
  const effectiveRates: Record<PricingTier, number> = liveRates ?? {
    standard: PRICING.standard.rate,
    rush: PRICING.rush.rate,
    hotRush: PRICING.hotRush.rate,
  };

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

  // Rotate the underlying image bitmap 90° clockwise and re-apply. This way
  // the fabric object's width/height actually reflects the new orientation
  // (important for bounding-box overlap detection and bin packing).
  async function rotateImage90(dataUrl: string): Promise<string> {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = () => {
        // CORS fallback: try again without crossOrigin
        const j = new Image();
        j.onload = () => resolve(j);
        j.onerror = reject;
        j.src = dataUrl;
      };
      i.src = dataUrl;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const out = document.createElement('canvas');
    out.width = h;
    out.height = w;
    const ctx = out.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.translate(h / 2, w / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -w / 2, -h / 2);
    return out.toDataURL('image/png');
  }

  async function undoDesign(designId: string) {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const design = designs.find((d) => d.id === designId);
    if (!design || !design.history || design.history.length === 0) return;

    const prev = design.history[design.history.length - 1]!;
    const remainingHistory = design.history.slice(0, -1);

    setDesigns((prevDesigns) => prevDesigns.map((d) => (d.id === designId ? {
      ...d,
      imageUrl: prev.imageUrl,
      naturalWidth: prev.naturalWidth,
      naturalHeight: prev.naturalHeight,
      printWidthInches: prev.printWidthInches,
      printHeightInches: prev.printHeightInches,
      dpi: prev.dpi,
      history: remainingHistory,
    } : d)));

    // Swap every fabric copy's image back to the previous one
    const oldObjs = canvas.getObjects().filter((o) => (o as any).data?.designId === designId);
    for (const old of oldObjs) {
      const img = await loadFabricImage(prev.imageUrl);
      const scale = inchesToPx(prev.printWidthInches) / prev.naturalWidth;
      img.set({
        left: old.left || 0,
        top: old.top || 0,
        scaleX: scale,
        scaleY: scale,
        data: { designId } as any,
      });
      canvas.remove(old);
      canvas.add(img);
    }
    canvas.renderAll();
    resolveOverlaps();
    checkFit();
    recalculateSheet();
  }

  async function rotateDesign(designId: string) {
    const design = designs.find((d) => d.id === designId);
    if (!design || aiBusyId) return;
    setAiBusyId(designId);
    try {
      const rotated = await rotateImage90(design.imageUrl);
      // Shrink proportionally so physical print size matches what was there
      // (rotated by 90°). Use shrinkToNewDims: old dims are WxH, new are HxW,
      // so the print width scales by (H/W).
      await applyProcessedImage(designId, rotated, true);
    } catch (err: any) {
      console.error(err);
      alert(`Rotate failed: ${err?.message || err}`);
    } finally {
      setAiBusyId(null);
    }
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
      if (neededFt > BUILDER_MAX_FT) {
        setSheetLengthFt(BUILDER_MAX_FT);
        setFitError(`Designs need ${neededFt} ft but the max sheet length is ${BUILDER_MAX_FT} ft. Split into two sheets, or reduce size/quantity.`);
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

    // Save current state to history so the user can undo this AI op
    const snapshot: DesignSnapshot = {
      imageUrl: design.imageUrl,
      naturalWidth: design.naturalWidth,
      naturalHeight: design.naturalHeight,
      printWidthInches: design.printWidthInches,
      printHeightInches: design.printHeightInches,
      dpi: design.dpi,
    };

    setDesigns((prev) => prev.map((d) => (d.id === designId ? {
      ...d,
      imageUrl: uploadedUrl,
      naturalWidth: dims.width,
      naturalHeight: dims.height,
      printWidthInches: printW,
      printHeightInches: printH,
      dpi: newDpi,
      history: [...(d.history || []), snapshot].slice(-10), // keep last 10
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
    const newFt = Math.max(configLimits.minFt, Math.min(BUILDER_MAX_FT, Math.round(ft)));
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

  // Mirrors constants.ts's calculateSheetCost() but reads the live rate
  // (effectiveRates) instead of the stale PRICING constant, so the ticker,
  // Cost tab, and the total_cost value persisted to gang_sheets all agree
  // with what /dtf actually charges.
  const totalCost = Math.max(MIN_SHEET_LENGTH_FT, Math.ceil(sheetLengthFt)) * effectiveRates[pricingTier];
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

  // Full-res render step used by the admin "Export PNG" download
  // (handleExport). The customer checkout handoff (handleCheckoutSheet) no
  // longer calls this — it POSTs placement JSON to
  // /api/gangsheet-store/compose instead, which renders server-side with
  // sharp (see that route's PLACEMENT CONTRACT comment). This function, its
  // 250M px² budget, and the TOO_LARGE machinery below remain exactly as
  // they were for the admin export path, which still runs client-side.
  // Wrapped in try/finally so a mid-render failure (e.g. a huge sheet
  // exhausting canvas memory on a weak device) still restores the on-screen
  // zoom/grid instead of leaving the builder stuck at full-res with the
  // grid hidden.
  async function generateFullResExport(): Promise<{ dataUrl: string; heightPx: number }> {
    const canvas = fabricRef.current;
    if (!canvas) throw new Error('Canvas not ready');

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

    // Conservative canvas-area budget (I3): a canvas bigger than this risks
    // exhausting memory or silently producing a corrupt/blank PNG on weaker
    // devices/browsers. Fail fast with a message the callers below map to
    // friendly copy, instead of letting toDataURL() hang or crash the tab.
    if (SHEET_WIDTH_PX * exportHeight > 250_000_000) {
      throw new Error('TOO_LARGE');
    }

    const savedZoom = canvas.getZoom();
    // C1: canvas.backgroundColor is opaque white (set at canvas init, ~:151)
    // so admin's on-screen editing view always has a visible page — but
    // Fabric renders that background color into toDataURL() like any other
    // pixel. DTF printing needs a transparent PNG (only the artwork prints;
    // a white rectangle behind it prints too, ruining sheets meant for dark
    // garments). Clear it for this render only; restored in the finally
    // below alongside zoom/grid so admin's on-screen view is unaffected.
    const savedBackgroundColor = canvas.backgroundColor;
    try {
      // Render at full resolution
      canvas.setZoom(1);
      canvas.setDimensions({ width: SHEET_WIDTH_PX, height: exportHeight }, { cssOnly: false });
      canvas.backgroundColor = '';

      const dataUrl = canvas.toDataURL({
        format: 'png',
        multiplier: 1,
        left: 0,
        top: 0,
        width: SHEET_WIDTH_PX,
        height: exportHeight,
      });
      // I3: a truncated/empty data URL means the render silently failed
      // (canvas too large for this device) rather than throwing — treat it
      // the same as the explicit size-budget check above.
      if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length < 1000) {
        throw new Error('TOO_LARGE');
      }
      return { dataUrl, heightPx: exportHeight };
    } finally {
      // Restore zoom + grid + background regardless of success or failure
      canvas.backgroundColor = savedBackgroundColor;
      canvas.setZoom(savedZoom);
      canvas.setDimensions({
        width: SHEET_WIDTH_PX * savedZoom,
        height: exportHeight * savedZoom,
      });
      canvas.getObjects().forEach(obj => {
        if ((obj as any).data?.isGrid) obj.set('visible', true);
      });
      canvas.renderAll();
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { dataUrl, heightPx } = await generateFullResExport();
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `gangsheet-${sheetName.replace(/\s+/g, '-')}-${SHEET_WIDTH_PX}x${Math.round(heightPx)}px-300dpi.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      console.error('Export failed:', err);
      alert(err?.message === 'TOO_LARGE'
        ? 'This sheet is too large to export in your browser — reduce the size/quantity of graphics, or split it into two sheets.'
        : 'Export failed. Try again.');
    } finally {
      setExporting(false);
    }
  }

  // ─── Checkout handoff (customer mode only) ─────────────────────────────
  // SERVER-SIDE COMPOSITION (iOS Safari fix): this used to run the same
  // full-res canvas export as the Export PNG download (generateFullResExport,
  // via canvas.toDataURL() at 6,600px x up to 39,600px = 250M+ px²), then
  // uploaded the resulting PNG. iOS Safari's canvas backing-store limit sits
  // well below that ceiling, so the export silently produced a blank/
  // truncated image on every iPhone — every iPhone checkout failed. Now the
  // phone sends WHERE each design goes (placement JSON), not pixels; the
  // server renders the sheet with sharp and returns a file_key exactly like
  // /upload did. Flow: build placements from the live canvas -> POST
  // /api/gangsheet-store/compose -> write the DtfStorePage upload stash
  // (same key/shape it reads on mount) -> navigate to /dtf so the customer
  // picks turnaround + checks out there.
  //
  // PLACEMENT CONTRACT — must match the server route's contract exactly
  // (documented in full on server/routes/gangsheetStore.js's POST /compose):
  //   Each placement's left/top/width/height is the design's FINAL on-sheet
  //   bounding box (post-rotation), rotation is 0/90/180/270 (default 0).
  //   This builder never applies a live fabric.js rotation transform — turns
  //   go through rotateImage90()/applyProcessedImage() above, which bake the
  //   turn into the image bitmap itself and re-upload it before the object
  //   ever lands on the canvas (no `.angle` use anywhere in this file) — so
  //   every placement built here always has rotation: 0.
  async function handleCheckoutSheet() {
    if (mode !== 'customer' || checkingOut) return;
    // I5: nothing to compose/checkout with an empty sheet.
    if (designs.length === 0) {
      setCheckoutError('Add at least one design first');
      return;
    }
    // I2: catch an over-length sheet BEFORE burning a round-trip on a compose
    // request that would just get rejected — checkFit() already keeps
    // sheetLengthFt in sync with what's actually placed, so this reuses that
    // same figure against the live store ceiling.
    if (Math.ceil(sheetLengthFt) > BUILDER_MAX_FT) {
      setCheckoutError(
        `Designs need ${Math.ceil(sheetLengthFt)} ft but the max sheet length is ${BUILDER_MAX_FT} ft. Split into two sheets, or reduce size/quantity.`
      );
      return;
    }
    const canvas = fabricRef.current;
    if (!canvas) {
      setCheckoutError('Canvas not ready — try again');
      return;
    }
    // handleFileUpload's upload-to-Spaces call can fail (network blip, the
    // /api/quotes/upload-design endpoint erroring) and fall back to using
    // the local data: URL directly so the design still shows on the canvas.
    // That design was never actually persisted anywhere the server can
    // fetch it from — /compose's SSRF allowlist correctly rejects non-https
    // URLs (see server/routes/gangsheetStore.js's isAllowedDesignImageUrl),
    // so catch it here first with guidance the customer can act on, instead
    // of a round-trip just to get the server's generic 400 back.
    const unfinishedUpload = designs.find((d) => d.imageUrl.startsWith('data:'));
    if (unfinishedUpload) {
      setCheckoutError(`"${unfinishedUpload.name}" didn't finish uploading — delete it and re-add it, then check out again.`);
      return;
    }
    setCheckingOut(true);
    setCheckoutError(null);
    trackEvent('dtf-builder-checkout');
    try {
      // Best-effort: persist the sheet as 'exported' up front so the layout
      // isn't lost if the compose call below fails partway through.
      // stampUrl: false — this can be the FIRST save of a brand-new sheet
      // (dbId still null), and persistSheet's URL-stamp navigate() would
      // otherwise remount the whole builder (DtfBuilderPage keys
      // GangSheetBuilder by the :id param) mid-checkout. The row still gets
      // its id via setDbId either way — only the URL/history write is
      // skipped.
      try {
        await persistSheet('exported', { stampUrl: false });
      } catch (err) {
        console.error('Sheet save before checkout failed (non-fatal):', err);
      }

      const designById = new Map(designs.map((d) => [d.id, d]));
      const placements = canvas.getObjects()
        .filter((obj) => !(obj as any).data?.isGrid)
        .map((obj) => {
          const designId = (obj as any).data?.designId as string | undefined;
          const design = designId ? designById.get(designId) : undefined;
          // An object with no matching design (shouldn't happen, but the
          // designId/data tagging is best-effort client state) is skipped
          // rather than failing the whole checkout — see the null filter
          // below.
          if (!design) return null;
          return {
            image_url: design.imageUrl,
            left: Math.round(obj.left || 0),
            top: Math.round(obj.top || 0),
            width: Math.round(obj.getScaledWidth?.() || 0),
            height: Math.round(obj.getScaledHeight?.() || 0),
            rotation: 0, // see PLACEMENT CONTRACT comment above
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);

      if (placements.length === 0) {
        throw new Error('Add at least one design first');
      }

      const composeRes = await fetch('/api/gangsheet-store/compose', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ placements }),
      });
      const composeData = await composeRes.json().catch(() => ({}));
      if (!composeRes.ok) throw new Error(composeData.error || 'Could not compose your sheet — try again');

      const stash = {
        file_key: composeData.file_key,
        width_px: composeData.width_px,
        height_px: composeData.height_px,
        fileName: `${sheetName || 'Untitled Sheet'}.png`,
        at: Date.now(),
      };
      // M2: if the stash write fails (private-mode sessionStorage etc.), the
      // handoff has nothing to hand off — surface it and stop here instead
      // of navigating to /dtf with no restorable upload.
      try {
        sessionStorage.setItem(DTF_UPLOAD_STASH_KEY, JSON.stringify(stash));
      } catch {
        throw new Error('Could not prepare checkout handoff — try again, or use the Upload lane on the DTF page with an exported PNG.');
      }

      navigate('/dtf?from=builder');
    } catch (err: any) {
      setCheckoutError(err?.message || 'Checkout failed. Try again.');
    } finally {
      setCheckingOut(false);
    }
  }

  // ─── Save / Load ───────────────────────────────────────────────────────

  // Shared create-or-update, used by both the Save button (status 'draft')
  // and the checkout handoff (status 'exported'). Throws with the server's
  // error message on failure (e.g. the customer 20-sheet cap) instead of
  // swallowing it, so callers can surface something more useful than
  // "Save failed".
  async function persistSheet(status: 'draft' | 'exported', { stampUrl = true }: { stampUrl?: boolean } = {}): Promise<void> {
    const body = {
      name: sheetName,
      sheet_length_ft: sheetLengthFt,
      pricing_tier: pricingTier,
      total_cost: totalCost,
      designs: designs,
      status,
    };

    if (dbId) {
      const res = await fetch(`${apiBase}/${dbId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
    } else {
      const res = await fetch(apiBase, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ name: sheetName }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setDbId(data.id);
      const res2 = await fetch(`${apiBase}/${data.id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) throw new Error(data2.error || 'Save failed');
      // I1: stamp the new row's id into the URL so a page refresh (or a
      // return visit) resolves sheetId -> dbId the same way any other saved
      // sheet does, instead of falling back to dbId === null and minting a
      // second row for what's really the same sheet. Customer-mode only —
      // the admin /admin/gangsheet route predates this fix and isn't in
      // scope for this pass. stampUrl: false (checkout's best-effort save)
      // skips this — see the call site's comment for why.
      if (mode === 'customer' && stampUrl) {
        navigate(`/dtf/builder/${data.id}`, { replace: true });
      }
    }
    if (mode === 'customer') refreshMySheets();
  }

  async function handleSave() {
    setSaving(true);
    try {
      await persistSheet('draft');
    } catch (err: any) { alert(err?.message || 'Save failed'); }
    finally { setSaving(false); }
  }

  async function loadSheet() {
    if (!sheetId) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/${sheetId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
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

  // ─── My Sheets (customer mode) ──────────────────────────────────────────

  async function refreshMySheets() {
    if (mode !== 'customer') return;
    setMySheetsLoading(true);
    try {
      const res = await fetch('/api/gangsheet-store/sheets', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setMySheets(await res.json());
    } catch {
      // Best-effort — the panel just keeps showing whatever it last had.
    } finally {
      setMySheetsLoading(false);
    }
  }

  useEffect(() => {
    refreshMySheets();
  }, []);

  async function handleDeleteSheet(id: number) {
    if (!confirm("Delete this sheet? This can't be undone.")) return;
    try {
      const res = await fetch(`/api/gangsheet-store/sheets/${id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.error || 'Delete failed'); return; }
      setMySheets((prev) => prev.filter((s) => s.id !== id));
      // Deleting the sheet currently open in the builder — send the user
      // back to a blank builder rather than leaving them editing a row that
      // no longer exists (the next Save would 404 against a stale dbId).
      if (dbId === id) navigate('/dtf/builder');
    } catch {
      alert('Delete failed');
    }
  }

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
    // Both endpoints below are admin-only server-side (403 for a customer
    // token) — the Design Lab library and the reprint-from-quotes list are
    // internal admin tooling, not something a customer account can see.
    if (mode === 'customer') return;

    fetch('/api/admin/designs-library', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setLibraryDesigns)
      .catch(() => {});

    fetch('/api/quotes', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.ok ? r.json() : [])
      .then((quotes: { id: number; customer_name: string; design_url: string | null; product_name: string; status: string }[]) => {
        // Show every quote that has uploaded artwork, regardless of status.
        // The previous filter (accepted/quoted only) hid customer designs as
        // soon as the quote moved to 'completed' — making them unavailable
        // for re-prints and reorders from the gangsheet builder.
        setQuoteDesigns(quotes.filter(q => q.design_url).map(q => ({
          id: q.id,
          customer_name: q.customer_name,
          design_url: q.design_url!,
          product_name: q.product_name,
        })));
      })
      .catch(() => {});
  }, [mode]);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="h-screen [height:100dvh] flex flex-col bg-gray-100">
      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 flex-shrink-0 z-10">
        <button onClick={() => navigate(mode === 'customer' ? '/dtf' : '/admin')} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm">
          <ArrowLeft className="w-4 h-4" /> <span className="hidden md:inline">{mode === 'customer' ? 'Back to shop' : 'Admin'}</span>
        </button>
        <div className="hidden md:block w-px h-6 bg-gray-200" />

        {/* Sheet name */}
        <input
          type="text" value={sheetName}
          onChange={e => setSheetName(e.target.value)}
          className="text-sm font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-orange-500 focus:outline-none px-1 py-0.5 flex-1 min-w-0 md:flex-none md:w-56"
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
          {/* M3: never show a fallback-priced dollar figure to a customer —
              only the live store rate, or '—' until it resolves. Admin may
              still see the static-fallback price if the live fetch fails. */}
          <span className="font-bold text-green-700">
            {mode === 'customer' && !liveRates ? '—' : `$${totalCost.toFixed(2)}`}
          </span>
        </div>

        <div className="hidden md:block w-px h-6 bg-gray-200" />

        {/* Actions */}
        <button onClick={handleSave} disabled={saving} className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50">
          <Save className="w-3 h-3" /> {saving ? '...' : 'Save'}
        </button>
        <button onClick={handleExport} disabled={exporting || checkingOut} className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white text-xs font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50">
          <Download className="w-3 h-3" /> {exporting ? '...' : 'Export PNG'}
        </button>
        {mode === 'customer' && (
          <button
            onClick={handleCheckoutSheet}
            disabled={checkingOut || exporting || !liveRates}
            className="hidden md:flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <DollarSign className="w-3 h-3" />
            {checkingOut ? 'Preparing…' : !liveRates ? 'Loading current pricing…' : 'Checkout this sheet'}
          </button>
        )}
      </header>

      {mode === 'customer' && (
        <div className="hidden sm:block bg-orange-50 border-b border-orange-100 text-orange-800 text-xs px-4 py-1.5 flex-shrink-0">
          Design your gang sheet — $/ft updates as you go
        </div>
      )}

      {/* ── My Sheets (customer mode only) ──────────────────────────────── */}
      {mode === 'customer' && (
        <div className="border-b border-gray-200 bg-white flex-shrink-0">
          <button
            onClick={() => setMySheetsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50"
          >
            <span className="flex items-center gap-1">
              <FolderOpen className="w-3.5 h-3.5" /> My sheets ({mySheets.length} of {CUSTOMER_SHEET_CAP})
            </span>
            <span>{mySheetsOpen ? '▲' : '▼'}</span>
          </button>
          {mySheetsOpen && (
            <div className="max-h-48 overflow-y-auto border-t border-gray-100 px-4 py-2">
              {mySheetsLoading && <p className="text-xs text-gray-400 py-2">Loading…</p>}
              {!mySheetsLoading && mySheets.length === 0 && (
                <p className="text-xs text-gray-400 py-2">No saved sheets yet.</p>
              )}
              {!mySheetsLoading && mySheets.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-gray-50 last:border-0">
                  <span className="truncate flex-1">
                    {s.name} · {s.sheet_length_ft}ft · {new Date(s.updated_at).toLocaleDateString()}
                  </span>
                  <button onClick={() => navigate(`/dtf/builder/${s.id}`)} className="font-semibold text-orange-600 hover:underline flex-shrink-0">
                    Open
                  </button>
                  <button onClick={() => handleDeleteSheet(s.id)} className="font-semibold text-red-500 hover:underline flex-shrink-0">
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
          {checkoutError && (
            <div className="bg-red-50 border-b border-red-200 text-red-800 text-sm px-4 py-2 flex items-center gap-2 flex-shrink-0">
              <span className="font-semibold">⚠ Checkout:</span>
              <span className="flex-1">{checkoutError}</span>
              <button onClick={() => setCheckoutError(null)} className="text-red-500 hover:text-red-700 text-xs">Dismiss</button>
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

          {/* Tabs — Library is admin-only (Design Lab + reprint-from-quotes
              both 403 on a customer token server-side), so it's simply not
              offered as a tab in customer mode. */}
          <div className="flex border-b border-gray-200">
            {[
              { key: 'upload' as const, icon: Upload, label: 'Upload' },
              ...(mode === 'admin' ? [{ key: 'library' as const, icon: FolderOpen, label: 'Library' }] : []),
              { key: 'pricing' as const, icon: DollarSign, label: 'Cost' },
            ].map(tab => (
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
                  <span className="text-[10px] text-gray-400">PNGs with transparent backgrounds print clean; JPGs print their full rectangle.</span>
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
                        min={configLimits.minFt}
                        max={BUILDER_MAX_FT}
                        value={sheetLengthFt}
                        onChange={(e) => updateSheetLength(parseInt(e.target.value) || configLimits.minFt)}
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
                            {/* I4: Remove BG / Fix DPI hit metered, unauthenticated
                                AI endpoints (/api/design/remove-bg, /upscale) —
                                admin only for this pass. The endpoints themselves
                                staying unauthenticated is a separate, pre-existing
                                ticket, not touched here. */}
                            {mode === 'admin' && (
                              <>
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
                              </>
                            )}
                            <button
                              onClick={() => rotateDesign(d.id)}
                              disabled={aiBusyId === d.id}
                              className="flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                              title="Rotate 90° (swap vertical/horizontal)"
                            >
                              {aiBusyId === d.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                            </button>
                            {(d.history?.length || 0) > 0 && (
                              <button
                                onClick={() => undoDesign(d.id)}
                                disabled={aiBusyId === d.id}
                                className="flex items-center justify-center gap-1 text-[11px] px-2 py-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                                title={`Undo last AI edit (${d.history?.length} available)`}
                              >
                                <Undo2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Library Panel — admin-only, see tab-list comment above */}
            {activePanel === 'library' && mode === 'admin' && (() => {
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

                {/* Tier selector — label/desc stay the static PRICING copy
                    (brief-approved: they don't map cleanly onto /config's
                    "promises" strings), but the $/ft figure is always the
                    live store rate. */}
                <div className="space-y-2">
                  {(Object.keys(PRICING) as PricingTier[]).map((key) => {
                    const tier = PRICING[key];
                    return (
                      <button key={key} onClick={() => setPricingTier(key)}
                        className={`w-full text-left p-3 rounded-xl border-2 transition ${
                          pricingTier === key ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                        }`}>
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold text-gray-900">{tier.label}</span>
                          <span className="text-sm font-bold text-orange-600">
                            {mode === 'customer' && !liveRates ? '—/ft' : `$${effectiveRates[key].toFixed(2)}/ft`}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5">{tier.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {/* Cost breakdown */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Sheet Length</span>
                    <span className="font-bold text-gray-900">{sheetLengthFt} ft</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Rate</span>
                    <span className="text-gray-900">
                      {mode === 'customer' && !liveRates ? '—/ft' : `$${effectiveRates[pricingTier].toFixed(2)}/ft`}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Designs</span>
                    <span className="text-gray-900">{designCount}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between">
                    <span className="text-sm font-semibold text-gray-900">Total Cost</span>
                    <span className="text-lg font-black text-green-700">
                      {mode === 'customer' && !liveRates ? '—' : `$${totalCost.toFixed(2)}`}
                    </span>
                  </div>
                  {designCount > 0 && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>Cost per design</span>
                      <span className="font-semibold">
                        {mode === 'customer' && !liveRates ? '—' : `$${costPerDesign.toFixed(2)}`}
                      </span>
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
      <div className="md:hidden bg-white border-t border-gray-200 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => { setActivePanel('upload'); setMobilePanelOpen(true); }}
          className="flex items-center gap-1 px-3 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg whitespace-nowrap flex-shrink-0"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
        <button onClick={autoLayout} className="flex items-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg whitespace-nowrap flex-shrink-0">
          <Layout className="w-3 h-3" /> Layout
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          aria-label="Save sheet"
          className="flex items-center justify-center p-2 bg-gray-900 text-white rounded-lg disabled:opacity-50 flex-shrink-0"
        >
          <Save className="w-3 h-3" />
        </button>
        <span className="flex-1 text-center text-xs font-bold text-green-700 whitespace-nowrap">
          {mode === 'customer' && !liveRates ? '—' : `$${totalCost.toFixed(2)}`}
        </span>
        {mode === 'customer' ? (
          <button
            onClick={handleCheckoutSheet}
            disabled={checkingOut || exporting || !liveRates}
            className="px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg whitespace-nowrap flex-shrink-0"
          >
            {checkingOut ? '...' : !liveRates ? 'Loading…' : 'Checkout'}
          </button>
        ) : (
          <button onClick={handleExport} disabled={exporting || checkingOut} className="px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-lg whitespace-nowrap flex-shrink-0">
            {exporting ? '...' : 'Export'}
          </button>
        )}
      </div>
    </div>
  );
}
