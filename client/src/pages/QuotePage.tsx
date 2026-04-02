import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
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

const PRINT_AREAS: { id: string; label: string; price: string; cost: number }[] = [
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

async function fetchProductColors(ssId: string): Promise<SSColor[]> {
  const res = await fetch(`/api/products/colors/${ssId}`);
  if (!res.ok) return [];
  const data = (await res.json()) as ColorsResponse;
  return data.colors ?? [];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function QuotePage() {
  const [currentStep, setCurrentStep] = useState(1);
  const stepContentRef = useRef<HTMLDivElement>(null);

  // Scroll to step content area on step change
  useEffect(() => {
    stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [currentStep]);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
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
    if (currentStep === 2) return formData.color !== null && totalQty > 0;
    if (currentStep === 3) return formData.printAreas.length > 0;
    if (currentStep === 4) return true;
    if (currentStep === 5) {
      return !!(formData.customerName && formData.customerEmail && formData.customerPhone);
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
      await submitQuote({
        productId: formData.product?.id,
        productName: formData.product?.name,
        brand: formData.product?.brand,
        color: formData.color?.name,
        sizes: sizeEntries,
        quantity: totalQty,
        printAreas: formData.printAreas,
        hasDesign: !!formData.designPreview,
        designNotes: formData.designNotes,
        designIdea: formData.designIdea,
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        notes: formData.notes,
      });
      setSubmitted(true);
    } catch {
      // error handling could go here
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
        Search our catalog of real products from S&S Activewear
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

      {/* Selected product summary */}
      {formData.product && (
        <div className="mt-4 flex items-center gap-4 rounded-xl border-2 border-red-600 bg-red-50 p-4">
          {formData.product.image_url && (
            <img
              src={formData.product.image_url}
              alt={formData.product.name}
              className="h-16 w-16 rounded-lg bg-white object-contain"
            />
          )}
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
          <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
            {allProducts.map((product) => {
              const isSelected = formData.product?.id === product.id;
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => update({ product, color: null })}
                  className={`flex flex-col items-start overflow-hidden rounded-xl border text-left transition hover:shadow-md ${
                    isSelected
                      ? 'ring-2 ring-red-600 border-transparent'
                      : 'border-brand-gray-200'
                  }`}
                >
                  <div className="flex h-40 w-full items-center justify-center bg-brand-gray-50 p-2">
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

  const { data: colors = [], isLoading: colorsLoading } = useQuery({
    queryKey: ['product-colors', productStyleId],
    queryFn: () => fetchProductColors(productStyleId),
    enabled: !!productStyleId && currentStep === 2,
  });

  const renderStep2 = () => (
    <div>
      {/* Product summary */}
      {formData.product && (
        <div className="mb-6 flex items-center gap-4 rounded-xl bg-brand-gray-50 p-4">
          {formData.product.image_url && (
            <img
              src={formData.product.image_url}
              alt={formData.product.name}
              className="h-14 w-14 rounded-lg bg-white object-contain"
            />
          )}
          <div>
            <p className="font-display font-bold">{formData.product.name}</p>
            <p className="text-sm text-brand-gray-500">{formData.product.brand}</p>
          </div>
        </div>
      )}

      <h2 className="font-display text-2xl font-bold">Select color and sizes</h2>

      {/* Color picker */}
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
                onClick={() => update({ color: c })}
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

      {/* Sizes */}
      <p className="mt-8 font-medium text-brand-gray-700">Quantity per size</p>
      <div className="mt-3 grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-9">
        {SIZES.map((size) => (
          <div key={size} className="flex flex-col items-center gap-1">
            <label className="text-sm font-semibold text-brand-gray-600">{size}</label>
            <input
              type="number"
              min={0}
              value={formData.sizes[size] ?? 0}
              onChange={(e) =>
                update({
                  sizes: {
                    ...formData.sizes,
                    [size]: Math.max(0, parseInt(e.target.value) || 0),
                  },
                })
              }
              className="w-full rounded-lg border border-brand-gray-200 px-2 py-2 text-center focus:outline-none focus:ring-2 focus:ring-red"
            />
          </div>
        ))}
      </div>
      {totalQty > 0 && (
        <p className="mt-3 text-sm font-semibold text-brand-gray-600">
          Total quantity: <span className="text-red-600">{totalQty}</span>
        </p>
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

    const TshirtSVG = ({ side }: { side: 'front' | 'back' }) => (
      <svg viewBox="0 0 200 260" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* T-shirt outline */}
        <path
          d="M60 30 L30 50 L10 100 L40 110 L40 240 L160 240 L160 110 L190 100 L170 50 L140 30 C135 15 120 5 100 5 C80 5 65 15 60 30Z"
          stroke="#d1d5db"
          strokeWidth="2"
          fill="#f9fafb"
        />
        {/* Collar */}
        <path d="M60 30 C75 45 125 45 140 30" stroke="#d1d5db" strokeWidth="2" fill="none" />
        {/* Sleeve seams */}
        <path d="M40 110 L40 55" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 3" />
        <path d="M160 110 L160 55" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 3" />

        {/* Print area highlights */}
        {side === 'front' && formData.printAreas.includes('Full Front') && (
          <rect x="55" y="70" width="90" height="100" rx="6" fill="#ea580c" fillOpacity="0.15" stroke="#ea580c" strokeWidth="1.5" strokeDasharray="5 3" />
        )}
        {side === 'front' && formData.printAreas.includes('Left Chest') && (
          <rect x="58" y="55" width="35" height="30" rx="4" fill="#ea580c" fillOpacity="0.2" stroke="#ea580c" strokeWidth="1.5" />
        )}
        {side === 'back' && formData.printAreas.includes('Full Back') && (
          <rect x="55" y="60" width="90" height="110" rx="6" fill="#ea580c" fillOpacity="0.15" stroke="#ea580c" strokeWidth="1.5" strokeDasharray="5 3" />
        )}
        {formData.printAreas.includes('Left Arm') && (
          <rect x="12" y="60" width="25" height="40" rx="4" fill="#ea580c" fillOpacity="0.2" stroke="#ea580c" strokeWidth="1.5" />
        )}
        {formData.printAreas.includes('Right Arm') && (
          <rect x="163" y="60" width="25" height="40" rx="4" fill="#ea580c" fillOpacity="0.2" stroke="#ea580c" strokeWidth="1.5" />
        )}

        {/* Labels */}
        {side === 'front' && formData.printAreas.includes('Full Front') && (
          <text x="100" y="125" textAnchor="middle" fontSize="10" fontWeight="700" fill="#ea580c">FULL FRONT</text>
        )}
        {side === 'front' && formData.printAreas.includes('Left Chest') && (
          <text x="75" y="73" textAnchor="middle" fontSize="7" fontWeight="700" fill="#ea580c">CHEST</text>
        )}
        {side === 'back' && formData.printAreas.includes('Full Back') && (
          <text x="100" y="120" textAnchor="middle" fontSize="10" fontWeight="700" fill="#ea580c">FULL BACK</text>
        )}
        {formData.printAreas.includes('Left Arm') && (
          <text x="24" y="83" textAnchor="middle" fontSize="6" fontWeight="700" fill="#ea580c">L</text>
        )}
        {formData.printAreas.includes('Right Arm') && (
          <text x="176" y="83" textAnchor="middle" fontSize="6" fontWeight="700" fill="#ea580c">R</text>
        )}
      </svg>
    );

    return (
      <div>
        <h2 className="font-display text-2xl font-bold">Choose Print Areas</h2>
        <p className="mt-1 text-gray-500">Select where you want your design printed.</p>

        <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:gap-12">
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

          {/* Visual t-shirt outlines */}
          <div className="flex flex-1 items-start justify-center gap-6">
            <div className="flex flex-col items-center gap-2 w-44">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Front</span>
              <div className="w-full"><TshirtSVG side="front" /></div>
            </div>
            <div className="flex flex-col items-center gap-2 w-44">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Back</span>
              <div className="w-full"><TshirtSVG side="back" /></div>
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
      <h2 className="font-display text-2xl font-bold">Upload your design</h2>
      <p className="mt-1 text-brand-gray-500">
        Upload artwork or describe your design idea. This step is optional.
      </p>

      {/* Drag & drop zone */}
      <div className="mt-6">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand-gray-300 bg-brand-gray-50 p-12 text-center transition hover:border-red-600"
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
              className="h-48 w-48 rounded-xl border border-brand-gray-200 object-contain"
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
        <h2 className="font-display text-2xl font-bold">Review your quote</h2>

        {/* Summary card */}
        <div className="mt-6 space-y-4 rounded-2xl border border-brand-gray-200 bg-brand-gray-50 p-6">
          <div className="flex flex-wrap gap-6">
            {/* Product image */}
            {formData.product?.image_url && (
              <img
                src={formData.product.image_url}
                alt={formData.product.name}
                className="h-28 w-28 rounded-xl border border-brand-gray-200 bg-white object-contain"
              />
            )}

            <div className="flex-1 space-y-3 text-sm">
              {/* Product */}
              <div>
                <span className="font-semibold text-brand-gray-500">Product</span>
                <p className="font-bold">{formData.product?.name}</p>
                <p className="text-brand-gray-500">{formData.product?.brand}</p>
              </div>

              {/* Color */}
              <div className="flex items-center gap-2">
                <span className="font-semibold text-brand-gray-500">Color:</span>
                {formData.color && (
                  <>
                    <span
                      className="inline-block h-4 w-4 rounded-full border border-brand-gray-300"
                      style={{ backgroundColor: formData.color.hex }}
                    />
                    <span className="font-medium">{formData.color.name}</span>
                  </>
                )}
              </div>

              {/* Print areas */}
              <div>
                <span className="font-semibold text-brand-gray-500">Print Areas:</span>{' '}
                <span className="font-medium">{formData.printAreas.join(', ')}</span>
              </div>
            </div>

            {/* Design preview */}
            {formData.designPreview && (
              <img
                src={formData.designPreview}
                alt="Design"
                className="h-28 w-28 rounded-xl border border-brand-gray-200 object-contain"
              />
            )}
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
          <h3 className="font-display text-lg font-bold">Your information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-gray-600">
                Full name <span className="text-red-600">*</span>
              </label>
              <input
                placeholder="John Doe"
                value={formData.customerName}
                onChange={(e) => update({ customerName: e.target.value })}
                className="w-full rounded-lg border border-brand-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red"
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
                className="w-full rounded-lg border border-brand-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red"
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
                className="w-full rounded-lg border border-brand-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red"
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

        {/* Submit */}
        <button
          type="button"
          disabled={submitting || !canAdvance()}
          onClick={() => void handleSubmit()}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-8 py-3 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
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

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Layout>
      <section className="container py-12 md:py-16">
        {/* Top bar: title + next button (sticky) */}
        {!submitted && (
          <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4 px-4 py-4 flex items-center justify-between mb-2 border-b border-gray-100">
            <h1 className="font-display text-2xl md:text-3xl font-bold">Get Your Quote</h1>
            <div className="flex items-center gap-3">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              )}
              {currentStep < 5 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((s) => Math.min(5, s + 1))}
                  disabled={!canAdvance()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="mb-10">
          <div className="flex items-center justify-between">
            {STEPS.map((step, i) => {
              const stepNum = i + 1;
              const done = currentStep > stepNum;
              const active = currentStep === stepNum;
              const Icon = step.icon;
              return (
                <div key={step.label} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold transition ${
                      done
                        ? 'bg-red-600 text-white'
                        : active
                          ? 'bg-red-600 text-white ring-4 ring-red-200'
                          : 'bg-brand-gray-200 text-brand-gray-500'
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={`hidden text-center text-xs sm:block ${
                      active
                        ? 'font-semibold text-brand-gray-800'
                        : done
                          ? 'font-medium text-red-600'
                          : 'text-brand-gray-400'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
          {/* Connector lines */}
          <div className="relative mt-[-34px] flex px-[20px]">
            {STEPS.slice(1).map((_, i) => (
              <div
                key={i}
                className={`h-0.5 flex-1 ${currentStep > i + 1 ? 'bg-red-600' : 'bg-brand-gray-200'}`}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div ref={stepContentRef} className="min-h-[400px] scroll-mt-4">{stepRenderers[currentStep - 1]?.()}</div>

        {/* Navigation */}
        {!submitted && (
          <div className="mt-10 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
              disabled={currentStep === 1}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-gray-200 px-5 py-2.5 font-semibold text-brand-gray-600 transition hover:bg-brand-gray-50 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>

            {currentStep < 5 && (
              <button
                type="button"
                onClick={() => setCurrentStep((s) => Math.min(5, s + 1))}
                disabled={!canAdvance()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-6 py-2.5 font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </section>
    </Layout>
  );
}
