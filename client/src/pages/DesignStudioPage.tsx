import { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import {
  Type,
  Upload,
  MapPin,
  Trash2,
  Plus,
  ChevronDown,
  Save,
  ShoppingCart,
  Search,
  Loader2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface TextElement {
  id: string;
  text: string;
  fontSize: number;
  color: string;
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

const PLACEMENTS = ['Full Center', 'Left Chest', 'Full Back', 'Right Chest'];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DesignStudioPage() {
  const [searchParams] = useSearchParams();
  const initialProduct = searchParams.get('product') || '';

  /* Product selection */
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductPicker, setShowProductPicker] = useState(!initialProduct);

  /* Color - from selected product or default */
  const [selectedColorIdx, setSelectedColorIdx] = useState(0);

  /* View */
  const [currentView, setCurrentView] = useState<'front' | 'back'>('front');

  /* Text tool */
  const [textInput, setTextInput] = useState('');
  const [textFontSize, setTextFontSize] = useState(24);
  const [textColor, setTextColor] = useState('#FFFFFF');
  const [textElements, setTextElements] = useState<TextElement[]>([]);

  /* Upload tool */
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Placement */
  const [designPosition, setDesignPosition] = useState('Full Center');

  /* Accordion */
  const [openSection, setOpenSection] = useState<'text' | 'upload' | 'placement'>('upload');

  /* Fetch products for picker */
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

  const products = productsData?.products || [];

  /* If a product ID was passed in URL, select it */
  useEffect(() => {
    if (initialProduct && products.length > 0) {
      const match = products.find(p => p.ss_id === initialProduct);
      if (match) {
        setSelectedProduct(match);
        setShowProductPicker(false);
      }
    }
  }, [initialProduct, products]);

  /* Get current product image */
  const productImage = selectedProduct?.image_url || null;
  const productColors = selectedProduct?.colors || [];
  const selectedColorImage = productColors[selectedColorIdx]?.image;
  const displayImage = selectedColorImage || productImage;

  /* helpers */
  const addText = () => {
    if (!textInput.trim()) return;
    setTextElements(prev => [
      ...prev,
      { id: Date.now().toString(), text: textInput.trim(), fontSize: textFontSize, color: textColor },
    ]);
    setTextInput('');
  };

  const removeText = (id: string) => setTextElements(prev => prev.filter(t => t.id !== id));

  const handleFile = (file: File) => setUploadedImage(URL.createObjectURL(file));

  const hasDesign = textElements.length > 0 || uploadedImage;

  /* ---------------------------------------------------------------- */
  /*  Product Picker                                                   */
  /* ---------------------------------------------------------------- */

  const productPicker = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col">
        <div className="p-5 border-b">
          <h2 className="font-display text-xl font-bold mb-3">Choose a Product</h2>
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
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {productsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : products.length === 0 ? (
            <p className="text-center text-gray-500 py-20">No products found</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {products.map(product => (
                <button
                  key={product.ss_id}
                  type="button"
                  onClick={() => {
                    setSelectedProduct(product);
                    setSelectedColorIdx(0);
                    setShowProductPicker(false);
                  }}
                  className="rounded-xl border border-gray-200 overflow-hidden text-left hover:shadow-md hover:border-gray-400 transition group"
                >
                  <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-contain p-2"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-gray-400 text-xs">{product.category}</span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400">{product.brand}</p>
                    <p className="text-xs font-semibold text-gray-900 truncate">{product.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedProduct && (
          <div className="p-4 border-t">
            <button
              type="button"
              onClick={() => setShowProductPicker(false)}
              className="w-full rounded-lg bg-gray-900 text-white py-2.5 text-sm font-semibold hover:bg-gray-800 transition"
            >
              Continue with {selectedProduct.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Sidebar                                                          */
  /* ---------------------------------------------------------------- */

  const sidebar = (
    <aside className="w-full space-y-5 overflow-y-auto border-r border-gray-200 bg-white p-5 lg:w-80">
      <h2 className="font-display text-xl font-bold">Design Studio</h2>

      {/* Selected product */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
          Product
        </label>
        <button
          type="button"
          onClick={() => setShowProductPicker(true)}
          className="w-full flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-left hover:bg-gray-50 transition"
        >
          {selectedProduct ? (
            <>
              <div className="h-12 w-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0">
                {selectedProduct.image_url && (
                  <img src={selectedProduct.image_url} alt="" className="w-full h-full object-contain" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{selectedProduct.name}</p>
                <p className="text-xs text-gray-500">{selectedProduct.brand}</p>
              </div>
              <span className="text-xs text-red-600 font-medium">Change</span>
            </>
          ) : (
            <span className="text-sm text-gray-500">Select a product to customize...</span>
          )}
        </button>
      </div>

      {/* Color selector (from product) */}
      {productColors.length > 0 && (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Color ({productColors[selectedColorIdx]?.name || ''})
          </label>
          <div className="flex flex-wrap gap-2">
            {productColors.map((c, i) => (
              <button
                key={i}
                type="button"
                title={c.name}
                onClick={() => setSelectedColorIdx(i)}
                className={`h-7 w-7 rounded-full border transition ${
                  selectedColorIdx === i ? 'ring-2 ring-red-500 ring-offset-2' : 'border-gray-200'
                }`}
                style={{ backgroundColor: c.hex || '#ccc' }}
              />
            ))}
          </div>
        </div>
      )}

      {/* View toggle */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
          View
        </label>
        <div className="flex gap-2">
          {(['front', 'back'] as const).map(view => (
            <button
              key={view}
              type="button"
              onClick={() => setCurrentView(view)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${
                currentView === view
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* ------- Design Tools ------- */}
      <div className="space-y-2">
        {/* Upload section */}
        <div className="rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setOpenSection('upload')}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700"
          >
            <Upload className="h-4 w-4" />
            <span className="flex-1">Upload Design</span>
            <ChevronDown className={`h-4 w-4 transition ${openSection === 'upload' ? 'rotate-180' : ''}`} />
          </button>
          {openSection === 'upload' && (
            <div className="border-t border-gray-100 px-4 pb-4 pt-3">
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 text-center transition hover:border-red-500"
              >
                <Upload className="h-8 w-8 text-gray-400" />
                <p className="text-xs text-gray-500">Drag & drop or click to upload</p>
                <p className="text-[10px] text-gray-400">PNG, JPG, SVG</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              {uploadedImage && (
                <div className="mt-3 flex items-center gap-3">
                  <img src={uploadedImage} alt="Uploaded" className="h-14 w-14 rounded-lg border border-gray-200 object-contain" />
                  <button type="button" onClick={() => setUploadedImage(null)} className="text-xs text-gray-400 hover:text-red-600 transition">
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Text section */}
        <div className="rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setOpenSection('text')}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700"
          >
            <Type className="h-4 w-4" />
            <span className="flex-1">Add Text</span>
            <ChevronDown className={`h-4 w-4 transition ${openSection === 'text' ? 'rotate-180' : ''}`} />
          </button>
          {openSection === 'text' && (
            <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3">
              <div className="flex gap-2">
                <input
                  placeholder="Enter text..."
                  value={textInput}
                  onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addText()}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button type="button" onClick={addText} className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 transition">
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>
              <div>
                <label className="text-xs text-gray-500">Font size: {textFontSize}px</label>
                <input type="range" min={12} max={72} value={textFontSize} onChange={e => setTextFontSize(Number(e.target.value))} className="w-full accent-red-600" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Color:</label>
                <input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="h-7 w-7 cursor-pointer rounded border-none" />
              </div>
              {textElements.length > 0 && (
                <div className="space-y-1">
                  {textElements.map(el => (
                    <div key={el.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                      <span className="flex-1 truncate font-medium" style={{ color: el.color }}>{el.text}</span>
                      <span className="text-xs text-gray-400">{el.fontSize}px</span>
                      <button type="button" onClick={() => removeText(el.id)} className="text-gray-400 hover:text-red-600 transition">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Placement section */}
        <div className="rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setOpenSection('placement')}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700"
          >
            <MapPin className="h-4 w-4" />
            <span className="flex-1">Placement</span>
            <ChevronDown className={`h-4 w-4 transition ${openSection === 'placement' ? 'rotate-180' : ''}`} />
          </button>
          {openSection === 'placement' && (
            <div className="space-y-2 border-t border-gray-100 px-4 pb-4 pt-3">
              {PLACEMENTS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDesignPosition(p)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    designPosition === p ? 'bg-red-50 font-semibold text-red-600' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons (desktop) */}
      <div className="hidden space-y-2 lg:block">
        <button type="button" className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
          <Save className="h-4 w-4" /> Save Design
        </button>
        <Link to="/quote" className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition">
          <ShoppingCart className="h-4 w-4" /> Get Quote
        </Link>
      </div>
    </aside>
  );

  /* ---------------------------------------------------------------- */
  /*  Preview panel                                                    */
  /* ---------------------------------------------------------------- */

  const preview = (
    <div className="flex flex-1 flex-col items-center justify-center bg-gray-100 p-6 lg:p-10">
      {/* Product image with design overlay */}
      <div className="relative w-full max-w-lg">
        <div className="aspect-square bg-white rounded-2xl shadow-sm overflow-hidden flex items-center justify-center">
          {displayImage ? (
            <img
              src={displayImage}
              alt={selectedProduct?.name || 'Product'}
              className="w-full h-full object-contain p-4"
            />
          ) : (
            <div className="text-center text-gray-400">
              <p className="text-lg font-semibold mb-2">No product selected</p>
              <button
                type="button"
                onClick={() => setShowProductPicker(true)}
                className="text-sm text-red-600 font-medium hover:underline"
              >
                Choose a product to start designing
              </button>
            </div>
          )}

          {/* Design overlay */}
          {displayImage && (
            <div
              className={`absolute flex flex-col items-center justify-center gap-1 pointer-events-none ${
                designPosition === 'Left Chest'
                  ? 'left-[22%] top-[28%] h-[18%] w-[18%]'
                  : designPosition === 'Right Chest'
                    ? 'right-[22%] top-[28%] h-[18%] w-[18%]'
                    : designPosition === 'Full Back'
                      ? 'left-1/2 top-[45%] h-[35%] w-[40%] -translate-x-1/2 -translate-y-1/2'
                      : 'left-1/2 top-[45%] h-[35%] w-[40%] -translate-x-1/2 -translate-y-1/2'
              }`}
            >
              {uploadedImage && (
                <img src={uploadedImage} alt="Design" className="max-h-full max-w-full object-contain drop-shadow-lg" />
              )}
              {textElements.map(el => (
                <span
                  key={el.id}
                  className="whitespace-nowrap font-display font-bold leading-tight drop-shadow-md"
                  style={{ fontSize: `${el.fontSize * 0.4}px`, color: el.color }}
                >
                  {el.text}
                </span>
              ))}
              {!hasDesign && displayImage && (
                <span className="text-xs font-semibold text-gray-400 bg-white/70 px-2 py-1 rounded">
                  YOUR DESIGN HERE
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Product info */}
      {selectedProduct && (
        <div className="mt-4 text-center">
          <p className="text-sm font-semibold text-gray-900">{selectedProduct.name}</p>
          <p className="text-xs text-gray-500">
            {selectedProduct.brand} &middot; {currentView} view
            {productColors[selectedColorIdx]?.name && ` · ${productColors[selectedColorIdx].name}`}
          </p>
        </div>
      )}

      {/* Mobile action buttons */}
      <div className="mt-6 flex gap-3 lg:hidden">
        <button type="button" className="flex items-center gap-2 rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">
          <Save className="h-4 w-4" /> Save
        </button>
        <Link to="/quote" className="flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition">
          <ShoppingCart className="h-4 w-4" /> Get Quote
        </Link>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-200px)] flex-col lg:flex-row">
        {sidebar}
        {preview}
      </div>
      {showProductPicker && productPicker}
    </Layout>
  );
}
