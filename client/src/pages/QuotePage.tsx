import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import { submitQuote } from '@/lib/api';
import {
  Search,
  ChevronRight,
  ChevronLeft,
  Check,
  Upload,
  X,
  Shirt,
  Palette,
  Printer,
  Image,
  ClipboardCheck,
  Loader2,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

// Load Google Fonts for design elements carried over from the Design Studio
const loadedFonts = new Set<string>();
const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Courier New', 'Verdana', 'Impact', 'Comic Sans MS'];
function loadGoogleFont(fontName: string): Promise<void> {
  if (!fontName || SYSTEM_FONTS.includes(fontName) || loadedFonts.has(fontName)) return Promise.resolve();
  loadedFonts.add(fontName);
  return new Promise<void>((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;700&display=swap`;
    link.onload = () => { document.fonts.ready.then(() => resolve()); };
    link.onerror = () => resolve();
    document.head.appendChild(link);
  });
}

interface SSProduct {
  id: string;
  ss_id?: string;
  style_id?: string;
  name: string;
  brand: string;
  category: string;
  image_url?: string;
  price?: number;
}

interface SSColor {
  name: string;
  hex: string;
  image: string | null;
  backImage: string | null;
}

interface ProductsResponse {
  products: SSProduct[];
  total: number;
  page: number;
  totalPages: number;
}

interface ColorsResponse {
  colors: SSColor[];
  sizes?: string[];
}

interface FormData {
  product: SSProduct | null;
  color: SSColor | null;
  sizes: Record<string, number>;
  printAreas: string[];
  designFile: File | null;
  designPreview: string | null;
  designNotes: string;
  designIdea: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
  shippingMethod: 'pickup' | 'ship';
  shippingStreet: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  dateNeeded: string;
}

const INITIAL_FORM: FormData = {
  product: null,
  color: null,
  sizes: { XS: 0, S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0, '4XL': 0, '5XL': 0 },
  printAreas: ['Full Front'],
  designFile: null,
  designPreview: null,
  designNotes: '',
  designIdea: '',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  notes: '',
  shippingMethod: 'pickup',
  shippingStreet: '',
  shippingCity: '',
  shippingState: '',
  shippingZip: '',
  dateNeeded: '',
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  { label: 'Choose Product', icon: Shirt },
  { label: 'Color & Sizes', icon: Palette },
  { label: 'Print Areas', icon: Printer },
  { label: 'Upload Design', icon: Image },
  { label: 'Review & Submit', icon: ClipboardCheck },
];

const SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

const PRINT_AREAS: { id: string; label: string }[] = [
  { id: 'Full Front', label: 'Full Front' },
  { id: 'Full Back', label: 'Full Back' },
  { id: 'Left Chest', label: 'Left Chest' },
  { id: 'Left Arm', label: 'Left Sleeve' },
  { id: 'Right Arm', label: 'Right Sleeve' },
];

const PRODUCTS_PER_PAGE = 12;

/* ------------------------------------------------------------------ */
/*  API helpers                                                        */
/* ------------------------------------------------------------------ */

async function fetchProductsPage({ search, page }: { search: string; page: number }): Promise<ProductsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(PRODUCTS_PER_PAGE),
  });
  if (search) params.set('search', search);
  const res = await fetch(`/api/products?${params.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json() as Promise<ProductsResponse>;
}

async function fetchProductDetails(ssId: string): Promise<{ colors: SSColor[]; sizes: string[] }> {
  const res = await fetch(`/api/products/colors/${ssId}`);
  if (!res.ok) return { colors: [], sizes: [] };
  const data = (await res.json()) as ColorsResponse;
  return { colors: data.colors ?? [], sizes: data.sizes ?? [] };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function QuotePage() {
  const location = useLocation();
  // Auth gate — require login before quoting
  const nav = useNavigate();
  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) {
      nav('/auth?redirect=/quote&reason=quote');
    }
  }, [nav]);


  interface DesignElement { id: string; type: string; x: number; y: number; width: number; content: string; fontSize?: number; color?: string; fontFamily?: string; rotation?: number; textAlign?: string; letterSpacing?: number; outline?: boolean; }
  const designState = (location.state as { fromDesignStudio?: boolean; product?: SSProduct; color?: SSColor; colorIndex?: number; designImage?: string; designElements?: DesignElement[]; designView?: string; designSnapshot?: string | null } | null);
  const savedDesignElements = designState?.designElements || [];
  const fromStudio = !!designState?.fromDesignStudio;
  // Track the product image from the design studio (exact color the user designed on).
  // Cleared if the user picks a different color in step 2.
  const [studioProductImage, setStudioProductImage] = useState<string | null>(designState?.designImage || null);
  // Pixel-perfect snapshot of the full design (product + all elements rendered)
  const designSnapshot = designState?.designSnapshot || null;
  const studioColorApplied = useRef(false);

  // Load Google Fonts for any text elements from the Design Studio and force re-render when ready
  // fontsReady triggers a re-render once custom fonts finish loading so text renders correctly
  const [, setFontsReady] = useState(0);
  useEffect(() => {
    const fonts = savedDesignElements
      .filter(el => el.type === 'text' && el.fontFamily)
      .map(el => el.fontFamily!);
    if (fonts.length === 0) return;
    // Load all fonts and re-render when done
    Promise.all(fonts.map(f => loadGoogleFont(f))).then(() => {
      setFontsReady(n => n + 1);
    });
  }, [savedDesignElements]);

  // When coming from Design Studio: skip product selection (1), print areas (3), and upload design (4)
  // Only need: Color & Sizes (2) → Review & Submit (5)
  const [currentStep, setCurrentStep] = useState(fromStudio ? 2 : 1);
  // Step 2 sub-step: first pick color, then pick sizes
  const [step2Sub, setStep2Sub] = useState<'color' | 'sizes'>(fromStudio ? 'sizes' : 'color');
  const stepContentRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);

  // Scroll to top of page on step change (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [currentStep]);
  const [formData, setFormData] = useState<FormData>(() => {
    if (designState?.fromDesignStudio) {
      // Auto-determine print area from the design view
      const printArea = designState.designView === 'back' ? 'Full Back' : 'Full Front';
      return {
        ...INITIAL_FORM,
        product: designState.product || null,
        color: designState.color || null,
        printAreas: [printArea],
        designPreview: designState.designImage || null,
      };
    }
    return INITIAL_FORM;
  });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* helpers */
  const update = useCallback(
    (patch: Partial<FormData>) => setFormData((prev) => ({ ...prev, ...patch })),
    [],
  );

  const totalQty = useMemo(
    () => Object.values(formData.sizes).reduce((a, b) => a + b, 0),
    [formData.sizes],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(value);
    }, 400);
  }, []);

  const canAdvance = (): boolean => {
    if (currentStep === 1) return formData.product !== null;
    if (currentStep === 2) {
      if (step2Sub === 'color') return fromStudio || formData.color !== null;
      return totalQty > 0;
    }
    if (currentStep === 3) return formData.printAreas.length > 0;
    if (currentStep === 4) return true;
    if (currentStep === 5) {
      return !!(formData.customerName && formData.customerEmail && formData.customerPhone && formData.dateNeeded);
    }
    return true;
  };

  /* file handling */
  const handleFile = (file: File) => {
    update({ designFile: file, designPreview: URL.createObjectURL(file) });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  /* submit */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const sizeEntries = Object.fromEntries(
        Object.entries(formData.sizes).filter(([, v]) => v > 0),
      );

      // Upload design file or design studio snapshot to server
      let designUrl: string | null = null;
      
      // If from Design Studio with a product image, use that as the design preview
      if (!designSnapshot && fromStudio && studioProductImage) {
        try {
          const uploadRes = await fetch('/api/quotes/upload-design', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: studioProductImage,
              filename: 'design-studio-preview.png',
              customerEmail: formData.customerEmail,
            }),
          });
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            designUrl = uploadData.url;
          }
        } catch {}
      }
      
      if (designSnapshot) {
        // Upload the Design Studio snapshot (data URL)
        const uploadRes = await fetch('/api/quotes/upload-design', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: designSnapshot,
            filename: `design-studio-${Date.now()}.png`,
            customerEmail: formData.customerEmail,
          }),
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          designUrl = uploadData.url;
        }
      } else if (formData.designPreview && formData.designFile) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(formData.designFile!);
        });
        const uploadRes = await fetch('/api/quotes/upload-design', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            filename: formData.designFile.name,
            customerEmail: formData.customerEmail,
          }),
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          designUrl = uploadData.url;
        }
      }

      await submitQuote({
        product_id: null,
        product_name: formData.product?.name,
        color: formData.color?.name,
        sizes: sizeEntries,
        quantity: totalQty,
        print_areas: formData.printAreas,
        design_type: savedDesignElements.length > 0 ? 'design-studio' : designUrl ? 'upload' : formData.designIdea ? 'description' : null,
        design_url: designUrl || null,
        customer_name: formData.customerName,
        customer_email: formData.customerEmail,
        customer_phone: formData.customerPhone,
        notes: [formData.designNotes, formData.designIdea, formData.notes].filter(Boolean).join('\n'),
        shipping_method: formData.shippingMethod,
        shipping_address: formData.shippingMethod === 'ship' ? {
          street1: formData.shippingStreet,
          city: formData.shippingCity,
          state: formData.shippingState,
          zip: formData.shippingZip,
        } : null,
        date_needed: formData.dateNeeded || null,
      });
      setSubmitted(true);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to submit quote. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Step 1: Choose Product                                           */
  /* ---------------------------------------------------------------- */

  const {
    data: productsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: productsLoading,
  } = useInfiniteQuery({
    queryKey: ['quote-products', debouncedSearch],
    queryFn: ({ pageParam }) =>
      fetchProductsPage({ search: debouncedSearch, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
  });

  const allProducts = useMemo(
    () => productsData?.pages.flatMap((p) => p.products) ?? [],
    [productsData],
  );

  const renderStep1 = () => (
    <div>
      <h2 className="font-display text-2xl font-bold">Choose your product</h2>
      <p className="mt-1 text-brand-gray-500">
        Search our products
      </p>

      {/* Search */}
      <div className="relative mt-6">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-gray-400" />
        <input
          type="text"
          placeholder="Search products (e.g. Gildan, hoodie, polo)..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full rounded-xl border border-brand-gray-200 py-3 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-red"
        />
      </div>

      {/* Selected product summary — hidden when from studio (design hero shows it) */}
      {!fromStudio && formData.product && (
        <div className="mt-4 flex items-center gap-4 rounded-xl border-2 border-red-600 bg-red-50 p-4">
          <div className="relative h-16 w-16 rounded-lg bg-white overflow-hidden flex-shrink-0 flex items-center justify-center">
            <DesignPreview size="sm" padding="p-1" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase text-red-600">Selected</p>
            <p className="font-display font-bold">{formData.product.name}</p>
            <p className="text-sm text-brand-gray-500">{formData.product.brand}</p>
          </div>
          <button
            type="button"
            onClick={() => update({ product: null, color: null })}
            className="rounded-full p-1 hover:bg-red-100"
          >
            <X className="h-5 w-5 text-red-600" />
          </button>
        </div>
      )}

      {/* Product grid */}
      {productsLoading ? (
        <div className="mt-10 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-gray-400" />
        </div>
      ) : (
        <>
          <div className="mt-4 md:mt-6 grid grid-cols-2 gap-3 md:gap-4 md:grid-cols-3">
            {allProducts.map((product) => {
              const isSelected = formData.product?.id === product.id;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => { update({ product, color: null }); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className={`flex flex-col items-start overflow-hidden rounded-xl border text-left transition hover:shadow-md ${
                    isSelected
                      ? 'ring-2 ring-red-600 border-transparent'
                      : 'border-brand-gray-200'
                  }`}
                >
                  <div className="flex h-32 md:h-40 w-full items-center justify-center bg-brand-gray-50 p-2">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-full w-full object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <Shirt className="h-16 w-16 text-brand-gray-300" />
                    )}
                  </div>
                  <div className="w-full p-3">
                    <p className="text-xs font-semibold uppercase text-brand-gray-400">
                      {product.brand}
                    </p>
                    <p className="mt-0.5 text-sm font-bold leading-tight line-clamp-2">
                      {product.name}
                    </p>
                    <p className="mt-1 text-xs text-brand-gray-500">{product.category}</p>
                  </div>
                  {isSelected && (
                    <div className="flex w-full items-center justify-center bg-red-600 py-1.5 text-xs font-bold text-white">
                      <Check className="mr-1 h-3 w-3" /> Selected
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {allProducts.length === 0 && !productsLoading && (
            <p className="mt-10 text-center text-brand-gray-400">
              No products found. Try a different search term.
            </p>
          )}

          {hasNextPage && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className="inline-flex items-center gap-2 rounded-lg border border-brand-gray-200 px-6 py-2.5 font-semibold text-brand-gray-600 transition hover:bg-brand-gray-50 disabled:opacity-50"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                  </>
                ) : (
                  'Load More'
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Step 2: Color & Sizes                                            */
  /* ---------------------------------------------------------------- */

  const productStyleId = formData.product?.ss_id ?? formData.product?.style_id ?? formData.product?.id ?? '';

  const { data: productDetails, isLoading: colorsLoading } = useQuery({
    queryKey: ['product-details', productStyleId],
    queryFn: () => fetchProductDetails(productStyleId),
    enabled: !!productStyleId,
    staleTime: 1000 * 60 * 30,
  });
  const colors = productDetails?.colors ?? [];
  const productSizes = productDetails?.sizes && productDetails.sizes.length > 0 ? productDetails.sizes : (colorsLoading ? [] : SIZES);

  // When colors load from API, auto-select the matching color from the design studio
  useEffect(() => {
    if (!designState?.fromDesignStudio || studioColorApplied.current || colors.length === 0) return;
    studioColorApplied.current = true;
    // Match by color name first, then fall back to colorIndex
    if (designState.color?.name) {
      const match = colors.find(c => c.name === designState.color?.name);
      if (match) {
        update({ color: match });
        return;
      }
    }
    if (typeof designState.colorIndex === 'number' && colors[designState.colorIndex]) {
      update({ color: colors[designState.colorIndex] });
    }
  }, [colors, designState, update]);

  // Reusable design preview: shows snapshot if available, otherwise product image + HTML element overlay
  const DesignPreview = ({ size, padding }: { size?: string; padding?: string }) => {
    const productImgUrl = studioProductImage || formData.color?.image || formData.product?.image_url;
    if (designSnapshot) {
      return <img src={designSnapshot} alt="Your design" className="w-full h-full object-contain" />;
    }
    return (
      <>
        {productImgUrl && <img src={productImgUrl} alt="" className={`w-full h-full object-contain ${padding || 'p-2'}`} />}
        {savedDesignElements.length > 0 && (
          <div className="absolute inset-0">
            {savedDesignElements.map(el => (
              <div
                key={el.id}
                className="absolute"
                style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.width}%`, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}
              >
                {el.type === 'image' ? (
                  <img src={el.content} alt="" className="w-full object-contain drop-shadow-md" />
                ) : (
                  <span className="block font-bold leading-tight" style={{
                    fontSize: `${(el.fontSize ?? 24) * (size === 'lg' ? 0.5 : size === 'sm' ? 0.2 : 0.3)}px`,
                    color: el.color ?? '#fff',
                    fontFamily: el.fontFamily ?? 'Inter',
                    fontWeight: 700,
                    textAlign: (el.textAlign as CanvasTextDrawingStyles['textAlign']) ?? 'center',
                    letterSpacing: el.letterSpacing ? `${el.letterSpacing}em` : undefined,
                    textShadow: el.outline
                      ? '-1px -1px 0 rgba(0,0,0,0.5), 1px -1px 0 rgba(0,0,0,0.5), -1px 1px 0 rgba(0,0,0,0.5), 1px 1px 0 rgba(0,0,0,0.5)'
                      : '0 1px 3px rgba(0,0,0,0.3)',
                  }}>{el.content}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  // Order summary sidebar component
  const _orderSummary = formData.product ? (
    <div className="sticky top-20 bg-white border border-gray-200 rounded-xl p-5 space-y-4">
      <h3 className="font-display font-bold text-gray-900">Order Summary</h3>
      {/* Design preview */}
      <div className="relative bg-gray-50 rounded-xl overflow-hidden aspect-square flex items-center justify-center">
        <DesignPreview size="md" />
        {(designSnapshot || savedDesignElements.length > 0) && (
          <div className="absolute top-1 right-1 bg-orange-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">DESIGNED</div>
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{formData.product.name}</p>
        <p className="text-xs text-gray-500">{formData.product.brand}</p>
      </div>
      {formData.color && (
        <div className="flex items-center gap-2 text-sm">
          <span className="w-4 h-4 rounded-full border" style={{ backgroundColor: formData.color.hex }} />
          <span className="text-gray-600">{formData.color.name}</span>
        </div>
      )}
      {totalQty > 0 && (
        <div className="text-sm space-y-1">
          <div className="flex justify-between text-gray-600">
            <span>Quantity</span>
            <span className="font-semibold text-gray-900">{totalQty} items</span>
          </div>
          {Object.entries(formData.sizes).filter(([,v]) => v > 0).map(([size, qty]) => (
            <div key={size} className="flex justify-between text-xs text-gray-400 pl-2">
              <span>{size}</span>
              <span>{qty}</span>
            </div>
          ))}
        </div>
      )}
      {formData.printAreas.length > 0 && (
        <div className="text-sm">
          <span className="text-gray-600">Print: </span>
          <span className="text-gray-900">{formData.printAreas.join(', ')}</span>
        </div>
      )}
      <div className="border-t pt-3">
        <p className="text-xs text-gray-500 text-center">We'll send you a detailed quote with pricing after review.</p>
      </div>
    </div>
  ) : null;

  const renderStep2 = () => (
    <div>
      {/* Product summary — only show when NOT from design studio (design hero already visible) */}
      {!fromStudio && formData.product && (
        <div className="mb-6 flex items-center gap-4 rounded-xl bg-brand-gray-50 p-4">
          <div className="relative h-14 w-14 rounded-lg bg-white overflow-hidden flex-shrink-0 flex items-center justify-center">
            <DesignPreview size="sm" padding="p-1" />
          </div>
          <div>
            <p className="font-display font-bold">{formData.product.name}</p>
            <p className="text-sm text-brand-gray-500">{formData.product.brand}</p>
          </div>
        </div>
      )}

      <h2 className="font-display text-lg md:text-2xl font-bold">
        {fromStudio
          ? 'Select sizes and quantities'
          : step2Sub === 'color' ? 'Choose a color' : 'Select sizes and quantities'}
      </h2>

      {/* Color picker screen — hidden when coming from Design Studio */}
      {!fromStudio && step2Sub === 'color' && (
        <>
          <p className="mt-6 font-medium text-brand-gray-700">Color</p>
          {colorsLoading ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-brand-gray-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading colors...
            </div>
          ) : colors.length > 0 ? (
            <>
              <div className="mt-3 flex flex-wrap gap-3">
                {colors.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    onClick={() => {
                      update({ color: c });
                      if (studioProductImage && c.name !== designState?.color?.name) {
                        setStudioProductImage(null);
                      }
                    }}
                    className={`h-10 w-10 rounded-full border-2 transition ${
                      formData.color?.name === c.name
                        ? 'ring-2 ring-red-600 ring-offset-2 border-brand-gray-300'
                        : 'border-brand-gray-200 hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>
              {formData.color && (
                <p className="mt-2 text-sm text-brand-gray-500">
                  Selected: <span className="font-semibold text-brand-gray-700">{formData.color.name}</span>
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-brand-gray-400">
              No color data available for this product. Please select any preferred color below.
            </p>
          )}

          {/* Color image preview */}
          {formData.color?.image && (
            <div className="mt-4">
              <img
                src={formData.color.image}
                alt={formData.color.name}
                className="h-32 w-32 rounded-lg border border-brand-gray-200 object-contain"
              />
            </div>
          )}
        </>
      )}

      {/* Sizes screen */}
      {(step2Sub === 'sizes' || fromStudio) && (
        <>
          {!fromStudio && formData.color && (
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="w-5 h-5 rounded-full border" style={{ backgroundColor: formData.color.hex }} />
              <span className="text-brand-gray-600">Color: <span className="font-semibold text-brand-gray-800">{formData.color.name}</span></span>
            </div>
          )}
          <p className="mt-4 md:mt-8 font-medium text-sm md:text-base text-brand-gray-700">Quantity per size</p>
          <div
            className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-5 lg:grid-cols-9"
            onBlur={(e) => {
              // When focus leaves the sizes group entirely, dismiss keyboard and scroll to top
              const currentTarget = e.currentTarget;
              setTimeout(() => {
                if (!currentTarget.contains(document.activeElement)) {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }, 100);
            }}
          >
            {productSizes.map((size) => (
              <div key={size} className="flex flex-col items-center gap-1">
                <label className="text-xs md:text-sm font-semibold text-brand-gray-600">{size}</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder="0"
                  value={formData.sizes[size] ? String(formData.sizes[size]) : ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const parsed = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                    update({
                      sizes: {
                        ...formData.sizes,
                        [size]: parsed,
                      },
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="w-full rounded-lg border border-brand-gray-200 px-1 py-2 text-base text-center focus:outline-none focus:ring-2 focus:ring-red"
                  style={{ fontSize: '16px' }}
                />
              </div>
            ))}
          </div>
          {totalQty > 0 && (
            <p className="mt-3 text-sm font-semibold text-brand-gray-600">
              Total quantity: <span className="text-red-600">{totalQty}</span>
            </p>
          )}
        </>
      )}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Step 3: Print Areas                                              */
  /* ---------------------------------------------------------------- */

  const renderStep3 = () => {
    const toggle = (area: string) => {
      update({
        printAreas: formData.printAreas.includes(area)
          ? formData.printAreas.filter((a) => a !== area)
          : [...formData.printAreas, area],
      });
    };

    const frontImg = studioProductImage || formData.color?.image || formData.product?.image_url;
    const backImg = formData.color?.backImage || null;

    return (
      <div>
        <h2 className="font-display text-xl md:text-2xl font-bold">Choose Print Areas</h2>
        <p className="mt-1 text-sm md:text-base text-gray-500">Select where you want your design printed.</p>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:gap-12">
          {/* Checkboxes */}
          <div className="flex-1 space-y-3">
            {PRINT_AREAS.map((pa) => (
              <label
                key={pa.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition hover:bg-gray-50 ${
                  formData.printAreas.includes(pa.id)
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={formData.printAreas.includes(pa.id)}
                  onChange={() => toggle(pa.id)}
                  className="h-5 w-5 rounded border-gray-300 text-orange-600 accent-orange-600"
                />
                <span className="flex-1 font-medium text-gray-900">{pa.label}</span>
                {formData.printAreas.includes(pa.id) && (
                  <Check className="h-5 w-5 text-orange-600" />
                )}
              </label>
            ))}
            <p className="text-xs text-gray-400 mt-2">Pricing will be included in your quote.</p>
          </div>

          {/* Front + Back product images with overlays */}
          <div className="flex flex-1 items-start justify-center gap-4">
            {/* Front */}
            <div className="w-[45%] max-w-[176px]">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 text-center mb-2">Front</span>
              <div className="relative bg-gray-50 rounded-xl overflow-hidden">
                {frontImg ? (
                  <img src={frontImg} alt="Front" className="w-full object-contain p-3" />
                ) : (
                  <div className="aspect-square flex items-center justify-center text-gray-300"><Shirt className="h-20 w-20" /></div>
                )}
                {formData.printAreas.includes('Full Front') && (
                  <div className="absolute top-[25%] left-[18%] right-[18%] bottom-[30%] border-2 border-dashed border-orange-500 bg-orange-500/10 rounded-lg flex items-center justify-center">
                    <span className="text-[9px] font-bold text-orange-600 bg-white/80 px-1.5 py-0.5 rounded">FULL FRONT</span>
                  </div>
                )}
                {formData.printAreas.includes('Left Chest') && (
                  <div className="absolute top-[22%] right-[16%] w-[24%] h-[16%] border-2 border-orange-500 bg-orange-500/15 rounded flex items-center justify-center">
                    <span className="text-[6px] font-bold text-orange-600">CHEST</span>
                  </div>
                )}
                {formData.printAreas.includes('Left Arm') && (
                  <div className="absolute top-[18%] left-[1%] w-[15%] h-[20%] border-2 border-orange-500 bg-orange-500/15 rounded flex items-center justify-center">
                    <span className="text-[6px] font-bold text-orange-600">L</span>
                  </div>
                )}
                {formData.printAreas.includes('Right Arm') && (
                  <div className="absolute top-[18%] right-[1%] w-[15%] h-[20%] border-2 border-orange-500 bg-orange-500/15 rounded flex items-center justify-center">
                    <span className="text-[6px] font-bold text-orange-600">R</span>
                  </div>
                )}
              </div>
            </div>

            {/* Back */}
            <div className="w-[45%] max-w-[176px]">
              <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 text-center mb-2">Back</span>
              <div className="relative bg-gray-50 rounded-xl overflow-hidden">
                {backImg ? (
                  <img src={backImg} alt="Back" className="w-full object-contain p-3" />
                ) : frontImg ? (
                  <img src={frontImg} alt="Back" className="w-full object-contain p-3 opacity-60" />
                ) : (
                  <div className="aspect-square flex items-center justify-center text-gray-300"><Shirt className="h-20 w-20" /></div>
                )}
                {formData.printAreas.includes('Full Back') && (
                  <div className="absolute top-[20%] left-[18%] right-[18%] bottom-[25%] border-2 border-dashed border-orange-500 bg-orange-500/10 rounded-lg flex items-center justify-center">
                    <span className="text-[9px] font-bold text-orange-600 bg-white/80 px-1.5 py-0.5 rounded">FULL BACK</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Step 4: Upload Design                                            */
  /* ---------------------------------------------------------------- */

  const renderStep4 = () => (
    <div>
      <h2 className="font-display text-xl md:text-2xl font-bold">Upload your design</h2>
      <p className="mt-1 text-sm md:text-base text-brand-gray-500">
        Upload artwork or describe your design idea. This step is optional.
      </p>

      {/* Drag & drop zone */}
      <div className="mt-6">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand-gray-300 bg-brand-gray-50 p-6 md:p-12 text-center transition hover:border-red-600"
        >
          <Upload className="h-10 w-10 text-brand-gray-400" />
          <p className="font-medium text-brand-gray-600">
            Drag & drop your file here, or click to browse
          </p>
          <p className="text-sm text-brand-gray-400">PNG, JPG, or SVG accepted</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".png,.jpg,.jpeg,.svg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>

      {/* Preview */}
      {formData.designPreview && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-medium text-brand-gray-600">Preview</p>
          <div className="relative inline-block">
            <img
              src={formData.designPreview}
              alt="Design preview"
              className="h-36 w-36 md:h-48 md:w-48 rounded-xl border border-brand-gray-200 object-contain"
            />
            <button
              type="button"
              onClick={() => update({ designFile: null, designPreview: null })}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-gray-800 text-white transition hover:bg-red-600"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Text notes */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-brand-gray-700">
          Notes about your design
        </label>
        <textarea
          rows={2}
          placeholder="Any specific instructions about colors, placement, size..."
          value={formData.designNotes}
          onChange={(e) => update({ designNotes: e.target.value })}
          className="mt-2 w-full rounded-xl border border-brand-gray-200 p-4 focus:outline-none focus:ring-2 focus:ring-red"
        />
      </div>

      {/* Design idea */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-brand-gray-700">
          Or describe your design idea
        </label>
        <textarea
          rows={4}
          placeholder="Don't have artwork yet? Describe what you want and we'll help create it..."
          value={formData.designIdea}
          onChange={(e) => update({ designIdea: e.target.value })}
          className="mt-2 w-full rounded-xl border border-brand-gray-200 p-4 focus:outline-none focus:ring-2 focus:ring-red"
        />
      </div>

      {/* Design Studio link */}
      <div className="mt-6 rounded-xl bg-brand-gray-50 p-4">
        <p className="text-sm text-brand-gray-600">
          Want to create your design?{' '}
          <Link to="/design-studio" className="font-semibold text-red-600 underline hover:text-red-700">
            Use our Design Studio
          </Link>
        </p>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Step 5: Review & Submit                                          */
  /* ---------------------------------------------------------------- */

  const renderStep5 = () => {
    if (submitted) {
      return (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <Check className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="mt-6 font-display text-3xl font-bold">Quote submitted!</h2>
          <p className="mt-3 text-lg text-brand-gray-500">
            We&apos;ll respond within 24 hours.
          </p>
          <Link
            to="/"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700"
          >
            Back to Home
          </Link>
        </div>
      );
    }

    const sizeEntries = Object.entries(formData.sizes).filter(([, v]) => v > 0);

    return (
      <div>
        <h2 className="font-display text-xl md:text-2xl font-bold">Review your quote</h2>

        {/* Summary card */}
        <div className="mt-6 space-y-4 rounded-2xl border border-brand-gray-200 bg-brand-gray-50 p-4 md:p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Design / Product preview */}
            {(formData.designPreview || designSnapshot || savedDesignElements.length > 0 || formData.product?.image_url || formData.color?.image) && (
              <div className="relative w-full sm:w-40 flex-shrink-0">
                <div className="relative bg-white border border-brand-gray-200 rounded-xl overflow-hidden aspect-square flex items-center justify-center">
                  {formData.designPreview ? (
                    <img src={formData.designPreview} alt="Your design" className="w-full h-full object-contain p-2" />
                  ) : (
                    <DesignPreview size="md" />
                  )}
                </div>
              </div>
            )}

            <div className="flex-1 space-y-3 text-sm">
              {/* Product */}
              <div>
                <span className="font-semibold text-brand-gray-500">Product</span>
                <p className="font-bold break-words">{formData.product?.name}</p>
                <p className="text-brand-gray-500">{formData.product?.brand}</p>
              </div>

              {/* Color */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-brand-gray-500">Color:</span>
                {formData.color && (
                  <>
                    <span
                      className="inline-block h-4 w-4 rounded-full border border-brand-gray-300 flex-shrink-0"
                      style={{ backgroundColor: formData.color.hex }}
                    />
                    <span className="font-medium">{formData.color.name}</span>
                  </>
                )}
              </div>

              {/* Print areas */}
              <div>
                <span className="font-semibold text-brand-gray-500">Print Areas:</span>{' '}
                <span className="font-medium">{formData.printAreas.join(', ') || '—'}</span>
              </div>
            </div>
          </div>

          {/* Sizes table */}
          {sizeEntries.length > 0 && (
            <div className="border-t border-brand-gray-200 pt-4">
              <p className="mb-2 text-sm font-semibold text-brand-gray-500">Sizes & Quantities</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-brand-gray-200">
                      <th className="pb-2 text-left font-semibold text-brand-gray-500">Size</th>
                      <th className="pb-2 text-right font-semibold text-brand-gray-500">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sizeEntries.map(([size, qty]) => (
                      <tr key={size} className="border-b border-brand-gray-100">
                        <td className="py-1.5 font-medium">{size}</td>
                        <td className="py-1.5 text-right">{qty}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="pt-2">Total</td>
                      <td className="pt-2 text-right text-red-600">{totalQty}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Customer info form */}
        <div className="mt-8 space-y-4">
          <h3 className="font-display text-base md:text-lg font-bold">Your information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-gray-600">
                Full name <span className="text-red-600">*</span>
              </label>
              <input
                placeholder="John Doe"
                value={formData.customerName}
                onChange={(e) => update({ customerName: e.target.value })}
                className="w-full rounded-lg border border-brand-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-gray-600">
                Email <span className="text-red-600">*</span>
              </label>
              <input
                type="email"
                placeholder="john@example.com"
                value={formData.customerEmail}
                onChange={(e) => update({ customerEmail: e.target.value })}
                className="w-full rounded-lg border border-brand-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-gray-600">
                Phone <span className="text-red-600">*</span>
              </label>
              <input
                type="tel"
                placeholder="(555) 123-4567"
                value={formData.customerPhone}
                onChange={(e) => update({ customerPhone: e.target.value })}
                className="w-full rounded-lg border border-brand-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-brand-gray-600">
              Additional notes
            </label>
            <textarea
              rows={3}
              placeholder="Any other details about your order..."
              value={formData.notes}
              onChange={(e) => update({ notes: e.target.value })}
              className="w-full rounded-lg border border-brand-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red"
            />
          </div>
        </div>

        {/* Date needed */}
        <div className="mt-8 space-y-4">
          <h3 className="font-display text-base md:text-lg font-bold">When do you need it?</h3>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-600">Date needed <span className="text-red-600">*</span></label>
            <input
              type="date"
              value={formData.dateNeeded}
              onChange={(e) => update({ dateNeeded: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        {/* Shipping */}
        <div className="mt-8 space-y-4">
          <h3 className="font-display text-base md:text-lg font-bold">Delivery method</h3>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => update({ shippingMethod: 'pickup' })}
              className={`flex-1 rounded-xl border p-4 text-center transition ${
                formData.shippingMethod === 'pickup' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <p className="font-semibold text-gray-900">Local Pickup</p>
              <p className="text-xs text-gray-500 mt-1">Fairburn, GA • Free</p>
            </button>
            <button
              type="button"
              onClick={() => update({ shippingMethod: 'ship' })}
              className={`flex-1 rounded-xl border p-4 text-center transition ${
                formData.shippingMethod === 'ship' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:bg-gray-50'
              }`}
            >
              <p className="font-semibold text-gray-900">Ship to Me</p>
              <p className="text-xs text-gray-500 mt-1">USPS / UPS / FedEx</p>
            </button>
          </div>

          {formData.shippingMethod === 'ship' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-600">Street address</label>
                <input
                  placeholder="123 Main St"
                  value={formData.shippingStreet}
                  onChange={(e) => update({ shippingStreet: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">City</label>
                <input
                  placeholder="Atlanta"
                  value={formData.shippingCity}
                  onChange={(e) => update({ shippingCity: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">State</label>
                  <input
                    placeholder="GA"
                    value={formData.shippingState}
                    onChange={(e) => update({ shippingState: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-600">ZIP</label>
                  <input
                    placeholder="30213"
                    value={formData.shippingZip}
                    onChange={(e) => update({ shippingZip: e.target.value })}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          type="button"
          disabled={submitting || !canAdvance()}
          onClick={() => void handleSubmit()}
          className="mt-6 w-full md:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-8 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
            </>
          ) : (
            'Submit Quote Request'
          )}
        </button>
      </div>
    );
  };

  /* ---------------------------------------------------------------- */
  /*  Step dispatcher                                                  */
  /* ---------------------------------------------------------------- */

  const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

  // When from Design Studio, only show steps 2 (Color & Sizes) and 5 (Review & Submit)
  const activeStepNums = fromStudio ? [2, 5] : [1, 2, 3, 4, 5];
  const activeStepIdx = activeStepNums.indexOf(currentStep);
  const goNext = () => {
    // Step 2 has two sub-screens: color then sizes
    if (currentStep === 2 && step2Sub === 'color') {
      setStep2Sub('sizes');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const nextIdx = activeStepIdx + 1;
    const next = activeStepNums[nextIdx];
    if (nextIdx < activeStepNums.length && next !== undefined) {
      // Reset sub-step when entering step 2 from step 1
      if (next === 2) setStep2Sub(fromStudio ? 'sizes' : 'color');
      setCurrentStep(next);
    }
  };
  const goBack = () => {
    // Step 2: if on sizes sub-screen, go back to color sub-screen
    if (currentStep === 2 && step2Sub === 'sizes' && !fromStudio) {
      setStep2Sub('color');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const prevIdx = activeStepIdx - 1;
    const prev = activeStepNums[prevIdx];
    if (prevIdx >= 0 && prev !== undefined) setCurrentStep(prev);
  };
  const isFirstStep = activeStepIdx === 0 && !(currentStep === 2 && step2Sub === 'sizes');
  const isLastStep = activeStepIdx === activeStepNums.length - 1;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Layout>
      <section className="container py-4 md:py-8">
        {/* Top bar: title + next button (sticky) */}
        {!submitted && (
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4 px-4 py-2 flex items-center justify-between mb-1">
            <h1 className="font-display text-xl md:text-3xl font-bold">Get Your Quote</h1>
            <div className="flex items-center gap-3">
              {!isFirstStep && (
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              )}
              {!isLastStep && (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canAdvance()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Progress bar — only show steps relevant to the flow */}
        <div className="mb-2 md:mb-10 relative z-10">
          {(() => {
            const visibleSteps = activeStepNums.map(n => STEPS[n - 1]!);
            return (
              <div className="flex items-center gap-1">
                {visibleSteps.map((step, i) => {
                  const stepNum = activeStepNums[i]!;
                  const done = activeStepIdx > i;
                  const active = currentStep === stepNum;
                  return (
                    <React.Fragment key={step.label}>
                      {i > 0 && <div className={`flex-1 h-0.5 ${done ? 'bg-red-600' : 'bg-gray-200'}`} />}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <div className={`flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full text-xs font-bold ${
                          done ? 'bg-red-600 text-white' : active ? 'bg-red-600 text-white ring-2 ring-red-200' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {done ? <Check className="h-3 w-3" /> : i + 1}
                        </div>
                        <span className={`text-[10px] md:text-xs whitespace-nowrap ${
                          active ? 'font-bold text-gray-900' : done ? 'font-medium text-red-600' : 'text-gray-400 hidden sm:inline'
                        }`}>{step.label}</span>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Design preview hero - shows designed product when coming from studio */}
        {fromStudio && (designSnapshot || savedDesignElements.length > 0) && (
          <div className="mb-2 md:mb-8 flex flex-col items-center">
            <div className="relative w-full max-w-[60vw] md:w-full md:max-w-xs aspect-[4/5] bg-white rounded-xl shadow-sm overflow-hidden flex items-center justify-center border border-gray-100">
              <DesignPreview size="lg" padding="p-4" />
              <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Your Design</div>
            </div>

          </div>
        )}

        {/* Step content */}
        <div ref={stepContentRef} className="scroll-mt-4">
          <div className="min-h-[400px]">{stepRenderers[currentStep - 1]?.()}</div>
        </div>


      </section>
    </Layout>
  );
}
