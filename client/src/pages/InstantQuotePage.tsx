import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import {
  Shirt,
  Layers,
  Palette,
  Printer,
  ChevronDown,
  Loader2,
  Check,
  Zap,
  Upload,
  X as XIcon,
  Plus,
  Trash2,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────── */
/*  Types — mirror server/routes/instantQuote.js                          */
/* ────────────────────────────────────────────────────────────────────── */

type Garment = { id: number; name: string; quality_tier: string; base_cost: number; image_url: string | null };
type PrintMethod = { id: number; name: string; charges_per_color: boolean };
type QuantityTier = { id: number; min_qty: number; max_qty: number | null; discount_pct: number };
type Settings = { markup_multiplier: number; rush_surcharge_pct: number; standard_turnaround: number; rush_turnaround: number; size_upcharges?: Record<string, number> };
type OptionsResponse = { garments: Garment[]; print_methods: PrintMethod[]; quantity_tiers: QuantityTier[]; settings: Settings };

type CalcResponse = {
  per_shirt: number;
  total: number;
  quantity: number;
  turnaround_days: number;
  breakdown: {
    garment_cost_per_piece: number;
    print_cost_per_piece: number;
    num_locations: number;
    colors_per_location: number;
    base: number;
    setup: number;
    quantity_discount: number;
    discount_pct: number;
    rush_surcharge: number;
    markup_multiplier: number;
    subtotal: number;
  };
};

type Inputs = {
  sizes: Array<{ size: string; quantity: number }>;
  color: string;
  garmentName: string;
  qualityTier: 'Standard' | 'Premium' | 'Ultra';
  methodName: 'Screen Print' | 'DTF' | 'DTG' | 'Embroidery';
  locations: { front: boolean; back: boolean; sleeve: boolean };
  colorsPerLocation: number;
  rush: boolean;
};

type CatalogProduct = {
  id?: number | string;
  ss_id?: string;
  name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  imageUrl?: string;
  base_price?: number | string | null;
  custom_price?: number | string | null;
};

// One line item the customer is configuring. A quote is an ordered list of
// these — the customer can add as many as they want before saving.
type ItemDraft = {
  id: string;
  inputs: Inputs;
  designs: Array<{ url: string; filename: string }>;
  pickedProduct: CatalogProduct | null;
};

const COLOR_OPTIONS: readonly string[] = [
  'Black', 'White', 'Navy', 'Heather Gray', 'Gray', 'Charcoal',
  'Red', 'Maroon', 'Royal', 'Forest', 'Kelly Green', 'Purple',
  'Orange', 'Yellow', 'Pink', 'Sand', 'Brown',
];

const DEFAULT_INPUTS: Inputs = {
  sizes: [
    { size: 'S', quantity: 0 }, { size: 'M', quantity: 0 },
    { size: 'L', quantity: 0 }, { size: 'XL', quantity: 0 },
    { size: '2XL', quantity: 0 }, { size: '3XL', quantity: 0 },
    { size: '4XL', quantity: 0 }, { size: '5XL', quantity: 0 },
  ],
  color: 'Black',
  garmentName: 'T-shirt',
  qualityTier: 'Standard',
  methodName: 'DTF',
  locations: { front: true, back: false, sleeve: false },
  colorsPerLocation: 1,
  rush: false,
};

function totalQuantity(sizes: Inputs['sizes']): number {
  return sizes.reduce((n, s) => n + (Number(s.quantity) || 0), 0);
}

function categoryToGarmentName(category?: string): Inputs['garmentName'] {
  const c = (category || '').toLowerCase();
  if (c.includes('hood')) return 'Hoodie';
  if (c.includes('sweatshirt') || c.includes('crewneck') || c.includes('fleece')) return 'Sweatshirt';
  if (c.includes('long sleeve') || c.includes('long-sleeve')) return 'Long-sleeve';
  if (c.includes('polo')) return 'Polo';
  if (c.includes('tank')) return 'Tank';
  if (c.includes('hat') || c.includes('cap') || c.includes('beanie') || c.includes('headwear')) return 'Hat';
  return 'T-shirt';
}

function genItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function newItem(initial?: Partial<Inputs>): ItemDraft {
  return {
    id: genItemId(),
    inputs: { ...DEFAULT_INPUTS, ...(initial || {}) },
    designs: [],
    pickedProduct: null,
  };
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Page                                                                   */
/* ────────────────────────────────────────────────────────────────────── */

export default function InstantQuotePage() {
  // ?service=dtf preselects the print method on the FIRST item only — so a
  // customer landing from "Get a DTF Quote" doesn't have to re-pick.
  const initialInputs = useMemo<Inputs>(() => {
    if (typeof window === 'undefined') return DEFAULT_INPUTS;
    const params = new URLSearchParams(window.location.search);
    const service = params.get('service');
    if (service === 'dtf') return { ...DEFAULT_INPUTS, methodName: 'DTF' };
    if (service === 'embroidery') return { ...DEFAULT_INPUTS, methodName: 'Embroidery' };
    if (service === 'screen-print') return { ...DEFAULT_INPUTS, methodName: 'Screen Print' };
    if (service === 'dtg') return { ...DEFAULT_INPUTS, methodName: 'DTG' };
    return DEFAULT_INPUTS;
  }, []);

  const [items, setItems] = useState<ItemDraft[]>(() => [newItem(initialInputs)]);
  const [productPickerItemId, setProductPickerItemId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState<false | 'save' | 'lock-in'>(false);
  const [uploadingByItem, setUploadingByItem] = useState<Record<string, number>>({});

  // ?product=<ss_id> arrives from the catalog "Get a Quote" CTA — applies
  // to the first item only.
  const productSsId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('product') || '';
  }, []);
  const { data: urlCatalogProduct } = useQuery<CatalogProduct | null>({
    queryKey: ['catalog-product', productSsId],
    queryFn: async () => {
      if (!productSsId) return null;
      let r = await fetch(`/api/products/by-ssid/${encodeURIComponent(productSsId)}`);
      let p = r.ok ? await r.json() : null;
      if (!p && /^\d+$/.test(productSsId)) {
        r = await fetch(`/api/products/${encodeURIComponent(productSsId)}`);
        p = r.ok ? await r.json() : null;
      }
      return p;
    },
    enabled: !!productSsId,
    staleTime: 60 * 60 * 1000,
  });

  // Once URL product resolves, snap first item's pickedProduct + garmentName
  // onto it — but only the first time, so a user who manually changes either
  // isn't reset.
  const [urlProductSyncDone, setUrlProductSyncDone] = useState(false);
  useEffect(() => {
    if (!urlProductSyncDone && urlCatalogProduct) {
      const mapped = categoryToGarmentName(urlCatalogProduct.category);
      setItems((prev) => prev.map((it, i) => i === 0
        ? { ...it, pickedProduct: urlCatalogProduct, inputs: { ...it.inputs, garmentName: mapped } }
        : it,
      ));
      setUrlProductSyncDone(true);
    }
  }, [urlCatalogProduct, urlProductSyncDone]);

  // Pricing options — fetched once.
  const { data: options } = useQuery<OptionsResponse>({
    queryKey: ['instant-quote', 'options'],
    queryFn: async () => {
      const r = await fetch('/api/quote/options');
      if (!r.ok) throw new Error('Failed to load pricing options');
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Debounce all items together. 200ms after any change, kick off N parallel
  // /calculate calls — react-query caches each independently.
  const [debouncedItems, setDebouncedItems] = useState(items);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedItems(items), 200);
    return () => clearTimeout(t);
  }, [items]);

  const calcQueries = useQueries({
    queries: debouncedItems.map((item) => {
      const numLocations = Object.values(item.inputs.locations).filter(Boolean).length;
      const qty = totalQuantity(item.inputs.sizes);
      const productSsId = item.pickedProduct?.ss_id || null;
      return {
        queryKey: ['instant-quote', 'calc-item', item.id, item.inputs, productSsId],
        queryFn: async (): Promise<CalcResponse> => {
          const r = await fetch('/api/quote/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sizes: item.inputs.sizes.filter((s) => s.quantity > 0),
              color: item.inputs.color,
              garmentName: item.inputs.garmentName,
              qualityTier: item.inputs.qualityTier,
              methodName: item.inputs.methodName,
              numLocations,
              colorsPerLocation: item.inputs.colorsPerLocation,
              rush: item.inputs.rush,
              productSsId,
            }),
          });
          const body = await r.json();
          if (!r.ok) throw new Error(body.error || 'Calculation failed');
          return body;
        },
        enabled: numLocations > 0 && qty > 0,
        placeholderData: (prev: CalcResponse | undefined) => prev,
      };
    }),
  });

  // Roll-ups across all items.
  const grandTotal = useMemo(
    () => calcQueries.reduce((sum, q) => sum + (q.data?.total || 0), 0),
    [calcQueries],
  );
  const grandQuantity = useMemo(
    () => items.reduce((sum, it) => sum + totalQuantity(it.inputs.sizes), 0),
    [items],
  );
  const grandTurnaroundDays = useMemo(() => {
    let m = 0;
    for (const q of calcQueries) {
      if (q.data?.turnaround_days && q.data.turnaround_days > m) m = q.data.turnaround_days;
    }
    return m || (options?.settings.standard_turnaround ?? 0);
  }, [calcQueries, options]);

  const anyCalcLoading = calcQueries.some((q) => q.isFetching);
  // A "valid" item has at least one location AND at least one shirt.
  const itemValidity = items.map(
    (it) => totalQuantity(it.inputs.sizes) > 0 && Object.values(it.inputs.locations).some(Boolean),
  );
  const allItemsValid = itemValidity.every(Boolean);
  const allCalcsReady = calcQueries.every((q, i) => !itemValidity[i] || q.data != null);
  const canSave = items.length > 0 && allItemsValid && allCalcsReady && grandTotal > 0;

  function patchInputs(itemId: string, patch: Partial<Inputs>) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, inputs: { ...it.inputs, ...patch } } : it)));
  }

  function patchItem(itemId: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, newItem()]);
    // Scroll the new card into view after the next paint.
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }, 50);
  }

  function removeItem(itemId: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.id !== itemId) : prev));
  }

  async function uploadDesignFile(itemId: string, file: File) {
    setUploadingByItem((m) => ({ ...m, [itemId]: (m[itemId] || 0) + 1 }));
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
      const r = await fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, filename: file.name }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Upload failed');
      setItems((prev) => prev.map((it) => it.id === itemId
        ? { ...it, designs: [...it.designs, { url: body.url, filename: file.name }] }
        : it,
      ));
    } catch (err: any) {
      toast.error(err.message || `${file.name} failed to upload`);
    } finally {
      setUploadingByItem((m) => ({ ...m, [itemId]: Math.max(0, (m[itemId] || 0) - 1) }));
    }
  }

  function handleItemFiles(itemId: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((f) => uploadDesignFile(itemId, f));
  }

  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gray-900 text-white py-12 sm:py-16 text-center">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold">Instant Quote</h1>
          <p className="mt-3 text-gray-400 max-w-xl mx-auto text-base sm:text-lg">
            Add as many products as you need — see the price update in real time.
          </p>
        </div>
      </section>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* ─── Sticky grand-total card ─── */}
        <PriceCard
          items={items}
          calcs={calcQueries.map((q) => q.data || null)}
          itemValidity={itemValidity}
          loading={anyCalcLoading}
          grandTotal={grandTotal}
          grandQuantity={grandQuantity}
          turnaroundDays={grandTurnaroundDays}
          allValid={allItemsValid}
        />

        {/* ─── Items ─── */}
        <div className="mt-6 space-y-6">
          {items.map((item, i) => (
            <ItemCard
              key={item.id}
              index={i}
              totalItems={items.length}
              item={item}
              options={options || null}
              calc={calcQueries[i]?.data || null}
              uploadingCount={uploadingByItem[item.id] || 0}
              onPatchInputs={(patch) => patchInputs(item.id, patch)}
              onClearProduct={() => patchItem(item.id, { pickedProduct: null })}
              onRemoveDesign={(idx) => patchItem(item.id, {
                designs: item.designs.filter((_, k) => k !== idx),
              })}
              onUploadFiles={(files) => handleItemFiles(item.id, files)}
              onOpenPicker={() => setProductPickerItemId(item.id)}
              onRemove={items.length > 1 ? () => removeItem(item.id) : null}
            />
          ))}
        </div>

        {/* ─── Add another product ─── */}
        <button
          type="button"
          onClick={addItem}
          className="mt-6 w-full rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50/40 px-6 py-5 text-base font-semibold text-orange-700 hover:bg-orange-50 hover:border-orange-400 inline-flex items-center justify-center gap-2 transition"
        >
          <Plus className="h-5 w-5" /> Add another product
        </button>

        {/* CTAs */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSaveOpen('save')}
            disabled={!canSave}
            className="w-full rounded-xl border-2 border-gray-300 px-6 py-4 text-base font-bold text-gray-700 hover:border-orange-400 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            Save Quote (email me)
          </button>
          <button
            type="button"
            onClick={() => setSaveOpen('lock-in')}
            disabled={!canSave}
            className="w-full rounded-xl bg-orange-600 px-6 py-4 text-base font-bold text-white hover:bg-orange-700 disabled:opacity-50 transition"
          >
            Lock In Order — 50% deposit
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Estimate only. Final price confirmed after we review your artwork. Tax + shipping calculated at checkout.
        </p>
      </main>

      {saveOpen && canSave && (
        <SaveQuoteModal
          items={items}
          intent={saveOpen}
          grandTotal={grandTotal}
          onClose={() => setSaveOpen(false)}
        />
      )}
      {productPickerItemId && (
        <ProductPickerModal
          onPick={(p) => {
            patchItem(productPickerItemId, { pickedProduct: p });
            setProductPickerItemId(null);
          }}
          onClose={() => setProductPickerItemId(null)}
        />
      )}
    </Layout>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  ItemCard — one product's worth of form                                 */
/* ────────────────────────────────────────────────────────────────────── */

function ItemCard({
  index, totalItems, item, options, calc, uploadingCount,
  onPatchInputs, onClearProduct, onRemoveDesign, onUploadFiles, onOpenPicker, onRemove,
}: {
  index: number;
  totalItems: number;
  item: ItemDraft;
  options: OptionsResponse | null;
  calc: CalcResponse | null;
  uploadingCount: number;
  onPatchInputs: (patch: Partial<Inputs>) => void;
  onClearProduct: () => void;
  onRemoveDesign: (idx: number) => void;
  onUploadFiles: (files: FileList | null) => void;
  onOpenPicker: () => void;
  onRemove: (() => void) | null;
}) {
  const inputs = item.inputs;
  const isScreenPrint = inputs.methodName === 'Screen Print';
  const liveTotalQty = totalQuantity(inputs.sizes);
  const numLocations = Object.values(inputs.locations).filter(Boolean).length;

  const garmentNames = useMemo(() => {
    if (!options) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of options.garments) {
      if (!seen.has(g.name)) { seen.add(g.name); out.push(g.name); }
    }
    return out;
  }, [options]);

  const currentTier = useMemo(() => {
    if (!options) return null;
    return options.quantity_tiers.find(
      (t) => liveTotalQty >= t.min_qty && (t.max_qty === null || liveTotalQty <= t.max_qty),
    ) || null;
  }, [options, liveTotalQty]);

  return (
    <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-orange-100 px-2 text-sm font-bold text-orange-700">
            {index + 1}
          </span>
          <h2 className="font-display text-lg font-bold text-gray-900">
            Product {totalItems > 1 ? `${index + 1} of ${totalItems}` : ''}
          </h2>
          {calc && liveTotalQty > 0 && (
            <span className="ml-2 text-sm text-gray-500">
              · {liveTotalQty} × ${calc.per_shirt.toFixed(2)} = <strong className="text-gray-900">${calc.total.toFixed(2)}</strong>
            </span>
          )}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
            aria-label={`Remove product ${index + 1}`}
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>

      {/* Catalog product banner (manual pick or URL-loaded on item 0) */}
      {item.pickedProduct && (
        <SelectedProductBanner product={item.pickedProduct} onClear={onClearProduct} />
      )}

      <div className="space-y-6">
        {/* Optional product pick */}
        {!item.pickedProduct && (
          <div className="text-center">
            <button
              type="button"
              onClick={onOpenPicker}
              className="text-sm text-orange-700 hover:text-orange-800 hover:underline"
            >
              Quoting a specific shirt? <span className="underline">Browse the catalog</span>
            </button>
          </div>
        )}

        {/* Upload */}
        <Section icon={<Upload className="h-5 w-5" />} title="Upload your graphic">
          <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 px-4 py-8 text-sm text-gray-500 transition hover:border-orange-400 hover:bg-gray-50">
            <Upload className="h-5 w-5" />
            <span>{uploadingCount > 0 ? `Uploading ${uploadingCount}…` : 'Click to add files (PNG, JPG, SVG, PDF)'}</span>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.svg"
              className="hidden"
              onChange={(e) => { onUploadFiles(e.target.files); e.target.value = ''; }}
            />
          </label>
          <p className="mt-2 text-xs text-gray-500">Optional — but helps us quote artwork prep accurately and locks in your design when you order. PNG with transparent background works best.</p>

          {item.designs.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {item.designs.map((d, i) => (
                <li key={d.url} className="relative rounded-lg border border-gray-200 bg-white p-2">
                  <img src={d.url} alt={d.filename} className="w-full h-24 object-contain rounded bg-gray-50" />
                  <p className="mt-1 truncate text-xs text-gray-700">{d.filename}</p>
                  <button
                    type="button"
                    onClick={() => onRemoveDesign(i)}
                    className="absolute top-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 shadow-sm"
                    aria-label={`Remove ${d.filename}`}
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Sizes */}
        <Section icon={<span className="text-xl">#</span>} title="How many shirts? (per size)">
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            {inputs.sizes.map((row, i) => {
              const upcharge = Number(options?.settings.size_upcharges?.[row.size] || 0);
              return (
                <div key={row.size} className="flex flex-col items-center gap-1">
                  <label className="text-xs font-semibold text-gray-700">{row.size}</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={row.quantity || ''}
                    onChange={(e) => {
                      const next = inputs.sizes.slice();
                      next[i] = { ...row, quantity: Math.max(0, parseInt(e.target.value) || 0) };
                      onPatchInputs({ sizes: next });
                    }}
                    placeholder="0"
                    className="w-full text-center rounded-lg border border-gray-300 px-2 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
                    style={{ fontSize: '16px' }}
                  />
                  {upcharge > 0 && (
                    <span className="text-[10px] text-gray-500">+${upcharge.toFixed(0)}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-sm text-gray-600">
            Total: <strong className="text-gray-900">{liveTotalQty}</strong>
            {currentTier && currentTier.discount_pct > 0 && (
              <span className="ml-2 text-xs text-green-700">
                {Math.round(currentTier.discount_pct * 100)}% volume discount
              </span>
            )}
            {numLocations === 0 && (
              <span className="ml-2 text-xs text-amber-700">Pick at least one print location below.</span>
            )}
          </div>
        </Section>

        {/* Color */}
        <Section icon={<span className="text-xl">🎨</span>} title="Shirt color">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {COLOR_OPTIONS.map((c) => (
              <Chip key={c} active={inputs.color === c} onClick={() => onPatchInputs({ color: c })}>
                {c}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Other colors available — we'll match it on your final mockup.
          </p>
        </Section>

        {/* Garment */}
        <Section icon={<Shirt className="h-5 w-5" />} title="What kind of garment?">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {garmentNames.map((name) => (
              <Chip key={name} active={inputs.garmentName === name} onClick={() => onPatchInputs({ garmentName: name })}>
                {name}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Quality tier — hidden when a specific product is picked */}
        {!item.pickedProduct && (
          <Section icon={<Layers className="h-5 w-5" />} title="Quality tier">
            <div className="grid grid-cols-3 gap-2">
              {(['Standard', 'Premium', 'Ultra'] as const).map((q) => {
                const tshirtBrand: Record<typeof q, string> = {
                  Standard: 'Gildan',
                  Premium: 'Next Level',
                  Ultra: 'Comfort Colors',
                } as const;
                const brandHint = inputs.garmentName === 'T-shirt' ? tshirtBrand[q] : null;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onPatchInputs({ qualityTier: q })}
                    className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                      inputs.qualityTier === q ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-gray-200 hover:border-orange-400'
                    }`}
                  >
                    <div>{q}</div>
                    {brandHint && <div className="text-[10px] mt-0.5 text-gray-500">{brandHint}</div>}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Print method */}
        <Section icon={<Printer className="h-5 w-5" />} title="Print method">
          <div className="grid grid-cols-2 gap-2">
            {options?.print_methods.map((m) => (
              <Chip
                key={m.id}
                active={inputs.methodName === m.name}
                onClick={() => onPatchInputs({ methodName: m.name as Inputs['methodName'] })}
              >
                {m.name}
                {m.name === 'DTF' && (
                  <span className="ml-1 italic text-xs text-gray-500">(most popular)</span>
                )}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Print locations */}
        <Section icon={<Palette className="h-5 w-5" />} title="Where do you want it printed?">
          <div className="grid grid-cols-3 gap-2">
            {(['front', 'back', 'sleeve'] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => onPatchInputs({ locations: { ...inputs.locations, [loc]: !inputs.locations[loc] } })}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-medium capitalize transition ${
                  inputs.locations[loc] ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-gray-200 hover:border-orange-400'
                }`}
              >
                {inputs.locations[loc] && <Check className="inline h-3.5 w-3.5 mr-1" />}
                {loc}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">Front + Back = 2 locations. Pick any combination.</p>
        </Section>

        {/* Colors per location — only for screen print */}
        {isScreenPrint && (
          <Section icon={<Palette className="h-5 w-5" />} title="How many colors per location?">
            <div className="grid grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onPatchInputs({ colorsPerLocation: n })}
                  className={`rounded-xl border-2 py-3 text-base font-bold transition ${
                    inputs.colorsPerLocation === n ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-gray-200 hover:border-orange-400'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">More colors = higher screen-print setup fee.</p>
          </Section>
        )}

        {/* Turnaround */}
        <Section icon={<Zap className="h-5 w-5" />} title="When do you need it?">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onPatchInputs({ rush: false })}
              className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                !inputs.rush ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-gray-200 hover:border-orange-400'
              }`}
            >
              <div>Standard</div>
              <div className="text-[10px] mt-0.5 text-gray-500">{options?.settings.standard_turnaround ?? 10} days</div>
            </button>
            <button
              type="button"
              onClick={() => onPatchInputs({ rush: true })}
              className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                inputs.rush ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-gray-200 hover:border-orange-400'
              }`}
            >
              <div>Rush</div>
              <div className="text-[10px] mt-0.5 text-gray-500">
                1–{options?.settings.rush_turnaround ?? 2} day{(options?.settings.rush_turnaround ?? 2) === 1 ? '' : 's'} · +{Math.round((options?.settings.rush_surcharge_pct ?? 1) * 100)}%
              </div>
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  SaveQuoteModal — collects email and POSTs the multi-item payload      */
/* ────────────────────────────────────────────────────────────────────── */

function SaveQuoteModal({
  items, intent, grandTotal, onClose,
}: {
  items: ItemDraft[];
  intent: 'save' | 'lock-in';
  grandTotal: number;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isLockIn = intent === 'lock-in';
  const depositAmount = grandTotal / 2;

  async function submit() {
    if (!email || !/.+@.+\..+/.test(email)) {
      toast.error('Enter a valid email');
      return;
    }
    setSaving(true);
    try {
      const payloadItems = items.map((item) => {
        const numLocations = Object.values(item.inputs.locations).filter(Boolean).length;
        const designUrls = item.designs.map((d) => d.url);
        const cp = item.pickedProduct;
        return {
          design_url: designUrls[0] || null,
          extra_design_urls: designUrls.slice(1),
          inputs: {
            sizes: item.inputs.sizes.filter((s) => s.quantity > 0),
            color: item.inputs.color,
            garmentName: item.inputs.garmentName,
            qualityTier: item.inputs.qualityTier,
            methodName: item.inputs.methodName,
            numLocations,
            colorsPerLocation: item.inputs.colorsPerLocation,
            rush: item.inputs.rush,
            // Non-API fields, included so the email can show 'Front + Sleeve' etc.
            locations: item.inputs.locations,
            // Server uses productSsId to re-look up the price (custom_price
            // ?? base_price × 2) and override the tier-based garment_cost.
            ...(cp?.ss_id ? { productSsId: cp.ss_id } : {}),
            // Snapshot of the picked product for the saved-quote email + admin.
            ...(cp ? {
              catalog_product: {
                ss_id: cp.ss_id,
                name: cp.name,
                brand: cp.brand,
                category: cp.category,
                image_url: cp.image_url || cp.imageUrl,
              },
            } : {}),
          },
        };
      });

      const saveRes = await fetch('/api/quote/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name || null,
          customer_email: email,
          notes: notes || null,
          items: payloadItems,
        }),
      });
      const saveBody = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveBody.error || 'Save failed');

      if (!isLockIn) {
        toast.success(`Quote #${saveBody.id} saved — check your email.`);
        onClose();
        return;
      }

      // Lock-in: create Stripe Checkout Session and redirect.
      const lockRes = await fetch('/api/quote/lock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: saveBody.id }),
      });
      const lockBody = await lockRes.json();
      if (!lockRes.ok) throw new Error(lockBody.error || 'Could not start checkout');
      window.location.href = lockBody.url;
    } catch (err: any) {
      toast.error(err.message || 'Failed');
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 py-8"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="font-display text-xl font-bold text-gray-900">
          {isLockIn ? 'Lock in your order' : 'Save your quote'}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {isLockIn
            ? `${items.length} product${items.length === 1 ? '' : 's'} · we'll save your quote, then take you to Stripe for the 50% deposit ($${depositAmount.toFixed(2)}). Balance due before pickup or shipment.`
            : `${items.length} product${items.length === 1 ? '' : 's'} · we'll email you the breakdown so you have it on file.`}
        </p>

        <div className="mt-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">Email *</label>
            <input
              type="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">Notes for the shop</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional — special requirements, deadline notes, etc."
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-lg bg-orange-600 px-6 py-3 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isLockIn
              ? (saving ? 'Redirecting...' : `Continue to deposit ($${depositAmount.toFixed(2)})`)
              : (saving ? 'Saving...' : 'Save & email me')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Sub-components                                                         */
/* ────────────────────────────────────────────────────────────────────── */

function SelectedProductBanner({ product, onClear }: { product: CatalogProduct; onClear: () => void }) {
  const img = product.image_url || product.imageUrl;
  const wholesale = Number(product.base_price || 0);
  const yourPrice = product.custom_price != null && Number(product.custom_price) > 0
    ? Number(product.custom_price)
    : wholesale > 0 ? wholesale * 2 : null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-orange-300 bg-orange-50/50 p-3">
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white">
        {img ? (
          <img src={img} alt={product.name} className="h-full w-full object-contain p-1" loading="lazy" />
        ) : (
          <Shirt className="h-6 w-6 text-gray-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-orange-700/70 font-medium">
          Quoting · {product.brand || 'Catalog item'}
        </p>
        <p className="font-display text-sm font-semibold text-gray-900 truncate">{product.name}</p>
        {yourPrice != null && (
          <p className="text-xs text-gray-700 mt-0.5">Your price: <strong>${yourPrice.toFixed(2)}</strong> per shirt</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="flex-shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        Clear
      </button>
    </div>
  );
}

function ProductPickerModal({ onPick, onClose }: { onPick: (p: CatalogProduct) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery<{ products: CatalogProduct[] }>({
    queryKey: ['quote-product-search', debouncedQ],
    queryFn: async () => {
      const url = debouncedQ
        ? `/api/products?search=${encodeURIComponent(debouncedQ)}&limit=20`
        : '/api/products?limit=20';
      const r = await fetch(url);
      if (!r.ok) return { products: [] };
      return r.json();
    },
    staleTime: 60_000,
  });
  const results = data?.products || [];
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 pt-20" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by style number, name, or brand…"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
            style={{ fontSize: '16px' }}
          />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><XIcon className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto divide-y divide-gray-100">
          {isFetching && results.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">No products match "{debouncedQ}"</div>
          ) : (
            results.map((p) => {
              const img = p.image_url || p.imageUrl;
              const wholesale = Number(p.base_price || 0);
              const yourPrice = p.custom_price != null && Number(p.custom_price) > 0
                ? Number(p.custom_price)
                : wholesale > 0 ? wholesale * 2 : null;
              return (
                <button
                  key={p.ss_id || p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  className="w-full flex items-center gap-3 p-3 text-left hover:bg-orange-50"
                >
                  <div className="h-12 w-12 flex-shrink-0 bg-gray-50 rounded flex items-center justify-center overflow-hidden">
                    {img ? <img src={img} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : <Shirt className="h-5 w-5 text-gray-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{p.brand}</p>
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                  </div>
                  {yourPrice != null && (
                    <span className="text-sm font-semibold text-orange-700 whitespace-nowrap">${yourPrice.toFixed(2)}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function PriceCard({
  items, calcs, itemValidity, loading, grandTotal, grandQuantity, turnaroundDays, allValid,
}: {
  items: ItemDraft[];
  calcs: Array<CalcResponse | null>;
  itemValidity: boolean[];
  loading: boolean;
  grandTotal: number;
  grandQuantity: number;
  turnaroundDays: number;
  allValid: boolean;
}) {
  const hasAnyInputs = grandQuantity > 0 && itemValidity.some(Boolean);
  const perShirtAvg = grandQuantity > 0 ? grandTotal / grandQuantity : 0;

  if (!hasAnyInputs) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-orange-50 border-2 border-orange-200 p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-orange-700/70">Per shirt</div>
            <div className="font-display text-3xl sm:text-4xl font-bold text-gray-900">$0.00</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-orange-700/70">Total</div>
            <div className="font-display text-2xl sm:text-3xl font-bold text-gray-900">$0.00</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Enter quantities and pick at least one print location to see your price update live.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-orange-50 to-orange-50 border-2 border-orange-200 p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-orange-700/70">
            {items.length === 1 ? 'Per shirt' : `Avg per shirt · ${items.length} products`}
          </div>
          <div className="font-display text-3xl sm:text-4xl font-bold text-gray-900">
            ${perShirtAvg.toFixed(2)}
            {loading && <Loader2 className="inline ml-2 h-4 w-4 animate-spin text-orange-400" />}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-orange-700/70">Grand total</div>
          <div className="font-display text-2xl sm:text-3xl font-bold text-gray-900">
            ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-white px-3 py-1 text-gray-700 border border-orange-200">
          {turnaroundDays} day turnaround
        </span>
        <span className="rounded-full bg-white px-3 py-1 text-gray-700 border border-orange-200">
          {grandQuantity} pieces total
        </span>
        {!allValid && (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800 border border-amber-200">
            Some products need quantities + a location
          </span>
        )}
      </div>

      {/* Per-item breakdown when there's more than one item */}
      {items.length > 1 && (
        <details className="mt-4 group" open>
          <summary className="flex items-center gap-1 text-sm text-orange-700 hover:text-orange-800 cursor-pointer select-none list-none">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            Items
          </summary>
          <dl className="mt-3 space-y-1 text-sm">
            {items.map((it, i) => {
              const calc = calcs[i];
              const qty = totalQuantity(it.inputs.sizes);
              const label = `${i + 1}. ${it.pickedProduct?.name || `${it.inputs.qualityTier} ${it.inputs.garmentName}`}`;
              const sub = `${qty} pcs · ${it.inputs.color} · ${it.inputs.methodName}`;
              return (
                <Row key={it.id} label={label} sub={sub} value={calc?.total || 0} />
              );
            })}
            <Row label="Grand total" value={grandTotal} bold />
          </dl>
        </details>
      )}

      {/* Single-item breakdown — only show when exactly one item */}
      {items.length === 1 && calcs[0] && (
        <SingleItemBreakdown calc={calcs[0]} quantity={grandQuantity} />
      )}
    </div>
  );
}

function SingleItemBreakdown({ calc, quantity }: { calc: CalcResponse; quantity: number }) {
  return (
    <details className="mt-4 group">
      <summary className="flex items-center gap-1 text-sm text-orange-700 hover:text-orange-800 cursor-pointer select-none list-none">
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        Price breakdown
      </summary>
      <dl className="mt-3 space-y-1 text-sm">
        <Row
          label="Garment"
          sub={`$${calc.breakdown.garment_cost_per_piece.toFixed(2)} × ${quantity}`}
          value={calc.breakdown.garment_cost_per_piece * quantity}
        />
        <Row
          label="Print"
          sub={`$${calc.breakdown.print_cost_per_piece.toFixed(2)} × ${calc.breakdown.num_locations} location${calc.breakdown.num_locations === 1 ? '' : 's'} × ${quantity}`}
          value={calc.breakdown.print_cost_per_piece * calc.breakdown.num_locations * quantity}
        />
        {calc.breakdown.setup > 0 && <Row label="Setup" value={calc.breakdown.setup} />}
        {calc.breakdown.quantity_discount > 0 && (
          <Row label={`Volume discount (${Math.round(calc.breakdown.discount_pct * 100)}% off)`} value={-calc.breakdown.quantity_discount} negative />
        )}
        {calc.breakdown.rush_surcharge > 0 && (
          <Row
            label={`Rush surcharge (+${calc.breakdown.base > 0 ? Math.round((calc.breakdown.rush_surcharge / calc.breakdown.base) * 100) : 0}%)`}
            value={calc.breakdown.rush_surcharge}
          />
        )}
        <Row label={`Subtotal × ${calc.breakdown.markup_multiplier} markup`} value={calc.total} bold />
      </dl>
    </details>
  );
}

function Row({ label, sub, value, negative, bold }: { label: string; sub?: string; value: number; negative?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${bold ? 'pt-2 border-t border-orange-200 font-bold text-gray-900' : ''}`}>
      <div>
        <span className={negative ? 'text-green-700' : ''}>{label}</span>
        {sub && <span className="ml-1 text-xs text-gray-500">{sub}</span>}
      </div>
      <span className={`tabular-nums ${negative ? 'text-green-700' : ''}`}>
        {negative ? '−' : ''}${Math.abs(value).toFixed(2)}
      </span>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600">{icon}</span>
        <h2 className="font-display font-bold text-base sm:text-lg text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
        active ? 'border-orange-600 bg-orange-50 text-orange-700' : 'border-gray-200 hover:border-orange-400'
      }`}
    >
      {children}
    </button>
  );
}
