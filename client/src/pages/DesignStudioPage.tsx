import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Upload,
  Type,
  Image,
  Shirt,
  Trash2,
  Search,
  ChevronDown,
  Save,
  X,
  Loader2,
  Move,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DesignElement {
  id: string;
  type: 'image' | 'text';
  x: number; // percent
  y: number; // percent
  width: number; // percent
  content: string; // text string or image data URL
  fontSize?: number;
  color?: string;
}

interface ProductColor {
  name: string;
  hex: string;
  image?: string;
}

interface Product {
  ss_id: string;
  name: string;
  brand: string;
  image_url: string;
  colors: ProductColor[];
  category: string;
}

type ToolName = 'upload' | 'text' | 'art' | 'products' | null;
type ViewName = 'front' | 'back' | 'sleeve';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DesignStudioPage() {
  const [searchParams] = useSearchParams();
  const initialProductId = searchParams.get('product') || '';

  // --- Core state ---
  const [activeTool, setActiveTool] = useState<ToolName>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);
  const [currentView, setCurrentView] = useState<ViewName>('front');
  const [designElements, setDesignElements] = useState<DesignElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [designName, setDesignName] = useState('Untitled design');
  const [isEditingName, setIsEditingName] = useState(false);

  // --- Upload panel state ---
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // --- Text panel state ---
  const [textInput, setTextInput] = useState('');
  const [textFontSize, setTextFontSize] = useState(24);
  const [textColor, setTextColor] = useState('#FFFFFF');

  // --- Product panel state ---
  const [productSearch, setProductSearch] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);

  // --- Drag / resize state ---
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    elementId: string;
    mode: 'move' | 'resize';
    startMx: number;
    startMy: number;
    startX: number;
    startY: number;
    startWidth: number;
  } | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Product fetching                                                 */
  /* ---------------------------------------------------------------- */

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['design-products', productSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '24' });
      if (productSearch) params.set('search', productSearch);
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ products: Product[] }>;
    },
  });

  const products = productsData?.products ?? [];

  // Auto-select product from URL param
  useEffect(() => {
    if (initialProductId && products.length > 0 && !selectedProduct) {
      const match = products.find(p => p.ss_id === initialProductId);
      if (match) setSelectedProduct(match);
    }
  }, [initialProductId, products, selectedProduct]);

  const productColors = selectedProduct?.colors ?? [];
  const selectedColorImage = productColors[selectedColorIdx]?.image;
  const displayImage = selectedColorImage || selectedProduct?.image_url || null;

  /* ---------------------------------------------------------------- */
  /*  Toolbar toggle                                                   */
  /* ---------------------------------------------------------------- */

  const toggleTool = useCallback((tool: ToolName) => {
    setActiveTool(prev => (prev === tool ? null : tool));
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Design element helpers                                           */
  /* ---------------------------------------------------------------- */

  const addDesignElement = useCallback((el: Omit<DesignElement, 'id'>) => {
    const newEl: DesignElement = { ...el, id: Date.now().toString() + Math.random().toString(36).slice(2) };
    setDesignElements(prev => [...prev, newEl]);
    setSelectedElementId(newEl.id);
  }, []);

  const removeElement = useCallback((id: string) => {
    setDesignElements(prev => prev.filter(e => e.id !== id));
    setSelectedElementId(prev => (prev === id ? null : prev));
  }, []);

  /* ---------------------------------------------------------------- */
  /*  File upload handler                                              */
  /* ---------------------------------------------------------------- */

  const handleFile = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setUploadedImages(prev => [...prev, url]);
  }, []);

  const placeImageOnCanvas = useCallback((url: string) => {
    addDesignElement({ type: 'image', x: 25, y: 20, width: 30, content: url });
  }, [addDesignElement]);

  /* ---------------------------------------------------------------- */
  /*  Text handler                                                     */
  /* ---------------------------------------------------------------- */

  const addTextToCanvas = useCallback(() => {
    if (!textInput.trim()) return;
    addDesignElement({
      type: 'text',
      x: 30,
      y: 40,
      width: 40,
      content: textInput.trim(),
      fontSize: textFontSize,
      color: textColor,
    });
    setTextInput('');
  }, [textInput, textFontSize, textColor, addDesignElement]);

  /* ---------------------------------------------------------------- */
  /*  Drag / Resize handlers                                           */
  /* ---------------------------------------------------------------- */

  const handleElementMouseDown = useCallback((e: React.MouseEvent, elementId: string, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedElementId(elementId);
    const el = designElements.find(d => d.id === elementId);
    if (!el) return;
    setDragState({
      elementId,
      mode,
      startMx: e.clientX,
      startMy: e.clientY,
      startX: el.x,
      startY: el.y,
      startWidth: el.width,
    });
  }, [designElements]);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const { elementId, mode, startMx, startMy, startX, startY, startWidth } = dragState;

      if (mode === 'move') {
        const dx = ((e.clientX - startMx) / rect.width) * 100;
        const dy = ((e.clientY - startMy) / rect.height) * 100;
        setDesignElements(prev =>
          prev.map(el =>
            el.id === elementId
              ? { ...el, x: Math.max(0, Math.min(90, startX + dx)), y: Math.max(0, Math.min(90, startY + dy)) }
              : el,
          ),
        );
      } else {
        const dx = ((e.clientX - startMx) / rect.width) * 100;
        setDesignElements(prev =>
          prev.map(el =>
            el.id === elementId ? { ...el, width: Math.max(5, Math.min(80, startWidth + dx)) } : el,
          ),
        );
      }
    };

    const handleMouseUp = () => setDragState(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState]);

  /* ---------------------------------------------------------------- */
  /*  Tool definitions for the left toolbar                            */
  /* ---------------------------------------------------------------- */

  const tools: { name: ToolName; icon: typeof Upload; label: string }[] = [
    { name: 'upload', icon: Upload, label: 'Upload' },
    { name: 'text', icon: Type, label: 'Add Text' },
    { name: 'art', icon: Image, label: 'Add Art' },
    { name: 'products', icon: Shirt, label: 'Products' },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render: Top Header Bar                                           */
  /* ---------------------------------------------------------------- */

  const headerBar = (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      {/* Left */}
      <div className="flex items-center gap-3">
        <Link to="/" className="text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="text-lg font-bold text-red-600 hidden sm:inline">TShirt Brothers</span>
      </div>

      {/* Center: design name */}
      <div className="flex items-center">
        {isEditingName ? (
          <input
            autoFocus
            value={designName}
            onChange={e => setDesignName(e.target.value)}
            onBlur={() => setIsEditingName(false)}
            onKeyDown={e => { if (e.key === 'Enter') setIsEditingName(false); }}
            className="border-b-2 border-red-500 bg-transparent px-2 py-1 text-sm font-medium text-center focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditingName(true)}
            className="text-sm font-medium text-gray-700 hover:text-gray-900 transition px-2 py-1"
          >
            {designName}
          </button>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="hidden sm:flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          <Save className="h-4 w-4" /> Save
        </button>
        <Link
          to="/quote"
          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition"
        >
          Get Price
        </Link>
      </div>
    </header>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Left Toolbar (desktop)                                   */
  /* ---------------------------------------------------------------- */

  const leftToolbar = (
    <aside className="fixed left-0 top-14 bottom-0 z-40 hidden w-16 flex-col border-r border-gray-200 bg-white md:flex">
      {tools.map(tool => {
        const isActive = activeTool === tool.name;
        const Icon = tool.icon;
        return (
          <button
            key={tool.name}
            type="button"
            onClick={() => toggleTool(tool.name)}
            className={`relative flex w-full flex-col items-center py-3 transition ${
              isActive ? 'text-red-600 bg-red-50' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-600" />}
            <Icon className="h-5 w-5" />
            <span className="mt-1 text-[10px] leading-tight">{tool.label}</span>
          </button>
        );
      })}
    </aside>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Bottom Toolbar (mobile)                                  */
  /* ---------------------------------------------------------------- */

  const bottomToolbar = (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-gray-200 bg-white md:hidden">
      {tools.map(tool => {
        const isActive = activeTool === tool.name;
        const Icon = tool.icon;
        return (
          <button
            key={tool.name}
            type="button"
            onClick={() => toggleTool(tool.name)}
            className={`flex flex-1 flex-col items-center py-2 transition ${
              isActive ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {isActive && <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-600" />}
            <Icon className="h-5 w-5" />
            <span className="mt-0.5 text-[10px]">{tool.label}</span>
          </button>
        );
      })}
    </nav>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Tool Panels                                              */
  /* ---------------------------------------------------------------- */

  const panelBase = 'fixed z-30 bg-white shadow-xl overflow-y-auto';
  const desktopPanel = `${panelBase} top-14 bottom-0 left-16 w-80 border-r border-gray-200 hidden md:block`;
  const mobilePanel = `${panelBase} bottom-12 left-0 right-0 max-h-[60vh] rounded-t-2xl border-t border-gray-200 md:hidden`;

  const panelHeader = (title: string) => (
    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <button type="button" onClick={() => setActiveTool(null)} className="text-gray-400 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  // --- Upload Panel ---
  const uploadPanelContent = (
    <div className="p-4 space-y-4">
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center transition hover:border-red-500"
      >
        <Upload className="h-8 w-8 text-gray-400" />
        <p className="text-sm text-gray-600 font-medium">Drag & drop or click to upload</p>
        <p className="text-xs text-gray-400">PNG, JPG, SVG</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".png,.jpg,.jpeg,.svg"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {uploadedImages.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Uploaded</p>
          <div className="grid grid-cols-3 gap-2">
            {uploadedImages.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => placeImageOnCanvas(url)}
                className="aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden hover:border-red-400 transition"
              >
                <img src={url} alt="Uploaded" className="w-full h-full object-contain p-1" />
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Click an image to place it on the canvas</p>
        </div>
      )}
    </div>
  );

  // --- Text Panel ---
  const textPanelContent = (
    <div className="p-4 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Text</label>
        <input
          placeholder="Enter your text..."
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTextToCanvas(); }}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Font Size: {textFontSize}px
        </label>
        <input
          type="range"
          min={12}
          max={72}
          value={textFontSize}
          onChange={e => setTextFontSize(Number(e.target.value))}
          className="w-full accent-red-600"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</label>
        <input
          type="color"
          value={textColor}
          onChange={e => setTextColor(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border-none"
        />
        <span className="text-xs text-gray-400">{textColor}</span>
      </div>
      <button
        type="button"
        onClick={addTextToCanvas}
        disabled={!textInput.trim()}
        className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Add to Design
      </button>

      {/* List of text elements on canvas */}
      {designElements.filter(e => e.type === 'text').length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Text on canvas</p>
          <div className="space-y-1">
            {designElements
              .filter(e => e.type === 'text')
              .map(el => (
                <div
                  key={el.id}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="flex-1 truncate font-medium" style={{ color: el.color }}>
                    {el.content}
                  </span>
                  <span className="text-xs text-gray-400">{el.fontSize}px</span>
                  <button
                    type="button"
                    onClick={() => removeElement(el.id)}
                    className="text-gray-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );

  // --- Art Panel ---
  const artPanelContent = (
    <div className="p-4">
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Image className="h-12 w-12 text-gray-300 mb-3" />
        <p className="text-sm font-semibold text-gray-500">Coming Soon</p>
        <p className="text-xs text-gray-400 mt-1">Clipart and stock art will be available here</p>
        <div className="grid grid-cols-4 gap-3 mt-6 opacity-30">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-gray-200" />
          ))}
        </div>
      </div>
    </div>
  );

  // --- Products Panel ---
  const productsPanelContent = (
    <div className="p-4 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search t-shirts, hoodies, polos..."
          value={productSearch}
          onChange={e => setProductSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      {productsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : products.length === 0 ? (
        <p className="text-center text-gray-500 py-16 text-sm">No products found</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {products.map(product => (
            <button
              key={product.ss_id}
              type="button"
              onClick={() => {
                setSelectedProduct(product);
                setSelectedColorIdx(0);
              }}
              className={`rounded-lg border overflow-hidden text-left hover:shadow-md transition ${
                selectedProduct?.ss_id === product.ss_id
                  ? 'border-red-500 ring-1 ring-red-500'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-1" loading="lazy" />
                ) : (
                  <span className="text-gray-400 text-[10px]">{product.category}</span>
                )}
              </div>
              <div className="p-1.5">
                <p className="text-[9px] uppercase tracking-wider text-gray-400">{product.brand}</p>
                <p className="text-[11px] font-semibold text-gray-900 truncate">{product.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const panelContentMap: Record<string, { title: string; content: React.ReactNode }> = {
    upload: { title: 'Upload Design', content: uploadPanelContent },
    text: { title: 'Add Text', content: textPanelContent },
    art: { title: 'Add Art', content: artPanelContent },
    products: { title: 'Products', content: productsPanelContent },
  };

  const activePanel = activeTool ? panelContentMap[activeTool] : null;

  const toolPanel = activePanel ? (
    <>
      {/* Desktop panel */}
      <div className={desktopPanel}>
        {panelHeader(activePanel.title)}
        {activePanel.content}
      </div>
      {/* Mobile panel */}
      <div className={mobilePanel}>
        {panelHeader(activePanel.title)}
        {activePanel.content}
      </div>
    </>
  ) : null;

  /* ---------------------------------------------------------------- */
  /*  Render: Center Canvas                                            */
  /* ---------------------------------------------------------------- */

  const canvasLeftOffset = activeTool ? 'md:ml-80' : '';

  const canvas = (
    <main
      className={`flex-1 flex flex-col items-center justify-center bg-gray-100 pt-14 pb-14 md:pb-0 md:ml-16 ${canvasLeftOffset} transition-all duration-200`}
      onClick={() => setSelectedElementId(null)}
    >
      {/* Product image + overlay area */}
      <div className="relative w-full max-w-xl px-4" ref={canvasRef}>
        <div className="relative aspect-square bg-white rounded-2xl shadow-sm overflow-hidden flex items-center justify-center select-none">
          {displayImage ? (
            <img
              src={displayImage}
              alt={selectedProduct?.name ?? 'Product'}
              className="w-full h-full object-contain p-4 pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400">
              <Shirt className="h-16 w-16 mb-2" />
              <p className="text-sm font-medium">Select a product to start designing</p>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setActiveTool('products');
                }}
                className="mt-2 text-sm text-red-600 font-semibold hover:underline"
              >
                Browse Products
              </button>
            </div>
          )}

          {/* Design elements on canvas */}
          {designElements.map(el => {
            const isSelected = selectedElementId === el.id;
            return (
              <div
                key={el.id}
                onMouseDown={e => handleElementMouseDown(e, el.id, 'move')}
                onClick={e => {
                  e.stopPropagation();
                  setSelectedElementId(el.id);
                }}
                className={`absolute cursor-move ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                }}
              >
                {el.type === 'image' ? (
                  <img
                    src={el.content}
                    alt="Design element"
                    className="w-full object-contain pointer-events-none drop-shadow-lg"
                    draggable={false}
                  />
                ) : (
                  <span
                    className="block whitespace-pre-wrap font-bold leading-tight drop-shadow-md pointer-events-none"
                    style={{ fontSize: `${(el.fontSize ?? 24) * 0.5}px`, color: el.color ?? '#fff' }}
                  >
                    {el.content}
                  </span>
                )}

                {/* Selection handles */}
                {isSelected && (
                  <>
                    {/* Corner resize handles */}
                    {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map(corner => (
                      <div
                        key={corner}
                        onMouseDown={e => handleElementMouseDown(e, el.id, 'resize')}
                        className={`absolute w-3 h-3 bg-white border-2 border-blue-500 cursor-se-resize z-10 ${
                          corner === 'top-left'
                            ? '-top-1.5 -left-1.5'
                            : corner === 'top-right'
                              ? '-top-1.5 -right-1.5'
                              : corner === 'bottom-left'
                                ? '-bottom-1.5 -left-1.5'
                                : '-bottom-1.5 -right-1.5'
                        }`}
                      />
                    ))}
                    {/* Delete button */}
                    <button
                      type="button"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        removeElement(el.id);
                      }}
                      className="absolute -top-4 -right-4 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-700 transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {/* Placeholder when no elements */}
          {designElements.length === 0 && displayImage && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-dashed border-gray-300 rounded-lg px-8 py-6 flex flex-col items-center gap-1">
                <Move className="h-5 w-5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Your Design Here
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View Switcher */}
      {displayImage && (
        <div className="flex items-center gap-2 mt-4">
          {(['front', 'back', 'sleeve'] as const).map(view => (
            <button
              key={view}
              type="button"
              onClick={e => {
                e.stopPropagation();
                setCurrentView(view);
              }}
              className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 transition ${
                currentView === view
                  ? 'border-red-500 bg-red-50 text-red-600'
                  : 'border-gray-200 bg-white text-gray-500 hover:border-gray-400'
              }`}
            >
              <div className="h-10 w-10 rounded bg-gray-100 overflow-hidden flex items-center justify-center">
                {displayImage && (
                  <img src={displayImage} alt={view} className="h-full w-full object-contain p-0.5" />
                )}
              </div>
              <span className="text-[10px] font-semibold capitalize">{view}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Bottom-Right Product Card                                */
  /* ---------------------------------------------------------------- */

  const productCard = selectedProduct ? (
    <div
      className="fixed bottom-4 right-4 z-30 hidden md:flex items-center gap-3 rounded-xl bg-white p-4 shadow-lg border border-gray-100"
      onClick={e => e.stopPropagation()}
    >
      <div className="h-12 w-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
        {displayImage && (
          <img src={displayImage} alt="" className="w-full h-full object-contain" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate max-w-[140px]">{selectedProduct.name}</p>
        <p className="text-xs text-gray-500">{productColors[selectedColorIdx]?.name ?? 'Default'}</p>
      </div>
      <div className="flex flex-col gap-1 ml-2">
        <button
          type="button"
          onClick={() => {
            setActiveTool('products');
          }}
          className="text-[11px] font-medium text-red-600 hover:underline whitespace-nowrap"
        >
          Change Product
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColorPicker(prev => !prev)}
            className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700 whitespace-nowrap"
          >
            Change Color <ChevronDown className="h-3 w-3" />
          </button>
          {showColorPicker && productColors.length > 0 && (
            <div className="absolute bottom-full right-0 mb-2 rounded-lg bg-white border border-gray-200 shadow-lg p-3 min-w-[160px]">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Colors</p>
              <div className="flex flex-wrap gap-1.5">
                {productColors.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    title={c.name}
                    onClick={() => {
                      setSelectedColorIdx(i);
                      setShowColorPicker(false);
                    }}
                    className={`h-6 w-6 rounded-full border transition ${
                      selectedColorIdx === i ? 'ring-2 ring-red-500 ring-offset-1' : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: c.hex || '#ccc' }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  /* ---------------------------------------------------------------- */
  /*  Final Render                                                     */
  /* ---------------------------------------------------------------- */

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-100">
      {headerBar}
      {leftToolbar}
      {bottomToolbar}
      {toolPanel}
      {canvas}
      {productCard}
    </div>
  );
}
