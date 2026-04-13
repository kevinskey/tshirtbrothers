import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Canvas as FabricCanvas, FabricImage, Line, FabricText } from 'fabric';
import {
  ArrowLeft, Maximize, Layout, Download, Save, Upload,
  FolderOpen, Trash2, Loader2, Plus, Minus,
  DollarSign, Info
} from 'lucide-react';
import {
  SHEET_WIDTH_PX, PX_PER_FOOT, DISPLAY_SCALE,
  DESIGN_SPACING_PX, PRICING, GRID_COLOR_MAJOR, GRID_COLOR_MINOR, GRID_LABEL_COLOR,
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
  const [selectedDesign, setSelectedDesign] = useState<string | null>(null);
  const [sheetLengthFt, setSheetLengthFt] = useState(1);
  const [designCount, setDesignCount] = useState(0);

  // Library data
  const [libraryDesigns, setLibraryDesigns] = useState<{ id: number; name: string; image_url: string }[]>([]);
  const [quoteDesigns, setQuoteDesigns] = useState<{ id: number; customer_name: string; design_url: string; product_name: string }[]>([]);

  // ─── Canvas Initialization ──────────────────────────────────────────────

  const initCanvas = useCallback(() => {
    if (!canvasRef.current || fabricRef.current) return;

    const initialHeight = feetToPx(3); // Start with 3ft, will grow as designs are added
    const canvas = new FabricCanvas(canvasRef.current, {
      width: SHEET_WIDTH_PX,
      height: initialHeight,
      backgroundColor: '#ffffff',
      selection: true,
    });

    // Set initial zoom to fit viewport
    const container = containerRef.current;
    const viewportWidth = container ? container.clientWidth - 40 : 800;
    const scale = viewportWidth / SHEET_WIDTH_PX;
    canvas.setZoom(scale);
    canvas.setDimensions({
      width: SHEET_WIDTH_PX * scale,
      height: initialHeight * scale,
    }, { cssOnly: true });

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
      const printW = targetWidthInches || Math.min(maxWidth, 10);
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

      const img = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });
      const targetW = inchesToPx(printW);
      const scale = targetW / img.width!;
      img.set({
        left: DESIGN_SPACING_PX,
        top: DESIGN_SPACING_PX,
        scaleX: scale,
        scaleY: scale,
        data: { designId: id } as any,
      });

      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.renderAll();
      recalculateSheet();
    } catch (err) {
      console.error('Failed to add design:', err);
      alert('Failed to load image. Make sure it is accessible.');
    }
  }

  function removeDesign(designId: string) {
    const canvas = fabricRef.current;
    if (!canvas) return;

    const obj = canvas.getObjects().find(o => (o as any).data?.designId === designId);
    if (obj) canvas.remove(obj);

    setDesigns(prev => prev.filter(d => d.id !== designId));
    setSelectedDesign(null);
    recalculateSheet();
  }

  function updateDesignQuantity(designId: string, qty: number) {
    setDesigns(prev => prev.map(d => d.id === designId ? { ...d, quantity: Math.max(1, qty) } : d));
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

    // Resize canvas to fit
    const newHeight = Math.max(feetToPx(1), result.totalHeight + DESIGN_SPACING_PX);
    canvas.setHeight(newHeight);
    canvas.setDimensions({ height: newHeight * zoom }, { cssOnly: true });

    // Reposition all objects
    for (const placement of result.placements) {
      const objs = canvas.getObjects().filter(o => (o as any).data?.designId === placement.id);
      const obj = objs[placement.instanceIndex] || objs[0];
      if (obj) {
        obj.set({ left: placement.x, top: placement.y });
        obj.setCoords();
      }
    }

    drawGrid(canvas, newHeight);
    canvas.renderAll();
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
    canvas.setZoom(newZoom);
    canvas.setDimensions({
      width: SHEET_WIDTH_PX * newZoom,
      height: (canvas.height || feetToPx(3)) * newZoom,
    }, { cssOnly: true });
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
        height: (canvas.height || exportHeight) * savedZoom,
      }, { cssOnly: true });

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

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden flex-shrink-0 hidden md:flex">
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

                {/* Design list */}
                {designs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Designs on Sheet ({designs.length})</p>
                    {designs.map(d => {
                      const status = getDPIStatus(d.dpi);
                      const colors = DPI_COLORS[status];
                      return (
                        <div key={d.id} className={`flex items-center gap-2 p-2 rounded-lg border ${selectedDesign === d.id ? 'border-orange-500 bg-orange-50' : 'border-gray-200'}`}>
                          <img src={d.imageUrl} alt="" className="w-10 h-10 object-contain rounded bg-gray-50 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-900 truncate">{d.name}</p>
                            <p className="text-[10px] text-gray-400">{d.printWidthInches.toFixed(1)}" × {d.printHeightInches.toFixed(1)}"</p>
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                              {d.dpi} DPI · {colors.label}
                            </span>
                          </div>
                          <div className="flex flex-col items-center gap-1 flex-shrink-0">
                            <div className="flex items-center gap-0.5">
                              <button onClick={() => updateDesignQuantity(d.id, d.quantity - 1)} className="w-5 h-5 rounded bg-gray-100 text-gray-600 flex items-center justify-center text-xs hover:bg-gray-200">-</button>
                              <span className="text-xs font-bold w-5 text-center">{d.quantity}</span>
                              <button onClick={() => updateDesignQuantity(d.id, d.quantity + 1)} className="w-5 h-5 rounded bg-gray-100 text-gray-600 flex items-center justify-center text-xs hover:bg-gray-200">+</button>
                            </div>
                            <button onClick={() => removeDesign(d.id)} className="text-red-400 hover:text-red-600">
                              <Trash2 className="w-3 h-3" />
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
            {activePanel === 'library' && (
              <div className="space-y-4">
                {/* Design Lab designs */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Design Lab ({libraryDesigns.length})</p>
                  {libraryDesigns.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No saved designs</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {libraryDesigns.map(d => (
                        <button key={d.id} onClick={() => addDesignToCanvas(d.image_url, d.name)}
                          className="aspect-square bg-gray-50 rounded-lg border border-gray-200 overflow-hidden hover:border-orange-400 hover:shadow-md transition p-1">
                          <img src={d.image_url} alt={d.name} className="w-full h-full object-contain" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Customer quote designs */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Customer Designs ({quoteDesigns.length})</p>
                  {quoteDesigns.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No customer designs</p>
                  ) : (
                    <div className="space-y-2">
                      {quoteDesigns.map(q => (
                        <button key={q.id} onClick={() => addDesignToCanvas(q.design_url, `${q.customer_name} - ${q.product_name}`)}
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
              </div>
            )}

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
        <button onClick={autoLayout} className="flex items-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg whitespace-nowrap">
          <Layout className="w-3 h-3" /> Layout
        </button>
        <label className="flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg whitespace-nowrap cursor-pointer">
          <Upload className="w-3 h-3" /> Upload
          <input type="file" multiple accept=".png,.jpg,.jpeg,.svg" className="hidden" onChange={e => handleFileUpload(e.target.files)} />
        </label>
        <span className="text-xs text-gray-500 whitespace-nowrap">{designCount} designs · {sheetLengthFt}ft</span>
        <span className="text-xs font-bold text-green-700 whitespace-nowrap">${totalCost.toFixed(2)}</span>
        <div className="flex-1" />
        <button onClick={handleExport} disabled={exporting} className="px-3 py-2 bg-orange-500 text-white text-xs font-medium rounded-lg whitespace-nowrap">
          {exporting ? '...' : 'Export'}
        </button>
      </div>
    </div>
  );
}
