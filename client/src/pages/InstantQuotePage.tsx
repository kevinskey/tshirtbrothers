import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
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
  // sizes drives both the total quantity (sum) and per-size upcharges.
  // `quantity` is kept as a convenience for downstream consumers but is
  // always derived from `sizes` on the page.
  sizes: Array<{ size: string; quantity: number }>;
  color: string;
  garmentName: string;
  qualityTier: 'Standard' | 'Premium' | 'Ultra';
  methodName: 'Screen Print' | 'DTF' | 'DTG' | 'Embroidery';
  locations: { front: boolean; back: boolean; sleeve: boolean };
  colorsPerLocation: number;
  rush: boolean;
};

const COLOR_OPTIONS: readonly string[] = [
  'Black', 'White', 'Navy', 'Heather Gray', 'Gray', 'Charcoal',
  'Red', 'Maroon', 'Royal', 'Forest', 'Kelly Green', 'Purple',
  'Orange', 'Yellow', 'Pink', 'Sand', 'Brown',
];

const DEFAULT_INPUTS: Inputs = {
  sizes: [
    { size: 'S', quantity: 0 }, { size: 'M', quantity: 10 },
    { size: 'L', quantity: 10 }, { size: 'XL', quantity: 5 },
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

// Catalog product attached via ?product=<ss_id> — kept light: just enough
// to render the "you're quoting THIS shirt" banner and stash a reference
// in the saved quote payload.
type CatalogProduct = {
  id?: number | string;
  ss_id?: string;
  name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  imageUrl?: string;
};

// Map a catalog product's category string onto one of the seven garment
// names the quote calculator knows about (T-shirt / Tank / Long-sleeve /
// Polo / Sweatshirt / Hoodie / Hat). Anything we can't classify falls
// through to T-shirt — the user can still pick another with one tap.
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

/* ────────────────────────────────────────────────────────────────────── */
/*  Page                                                                   */
/* ────────────────────────────────────────────────────────────────────── */

export default function InstantQuotePage() {
  // Preselect a print method when arrived from a Services-page CTA like
  // /quote?service=dtf — so customers landing from "Get a DTF Quote" don't
  // have to re-pick the method.
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

  const [inputs, setInputs] = useState<Inputs>(initialInputs);
  const [saveOpen, setSaveOpen] = useState<false | 'save' | 'lock-in'>(false);
  // Customer-uploaded design files. Stored as Spaces URLs once uploaded so
  // we can pass them straight through to /api/quote/save without re-upload.
  const [designs, setDesigns] = useState<Array<{ url: string; filename: string }>>([]);
  const [uploadingCount, setUploadingCount] = useState(0);

  // ?product=<ss_id> arrives from the catalog "Get a Quote" CTA. We fetch
  // the product so we can show "Quoting THIS shirt" above the form and
  // pre-select the garment type from its category.
  const productSsId = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('product') || '';
  }, []);
  const { data: catalogProduct } = useQuery<CatalogProduct | null>({
    queryKey: ['catalog-product', productSsId],
    queryFn: async () => {
      if (!productSsId) return null;
      // Try by-ssid first; if that 404s and the value looks like a DB
      // serial id (a stale catalog bundle could send that), fall back to
      // /products/:id so we still land on the right row.
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

  // Once the product resolves, snap garmentName onto its category — but only
  // the first time, so a user who manually changes the garment isn't reset.
  const [productSyncDone, setProductSyncDone] = useState(false);
  useEffect(() => {
    if (!productSyncDone && catalogProduct) {
      const mapped = categoryToGarmentName(catalogProduct.category);
      setInputs((prev) => ({ ...prev, garmentName: mapped }));
      setProductSyncDone(true);
    }
  }, [catalogProduct, productSyncDone]);

  async function uploadDesignFile(file: File) {
    setUploadingCount((n) => n + 1);
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
      setDesigns((prev) => [...prev, { url: body.url, filename: file.name }]);
    } catch (err: any) {
      toast.error(err.message || `${file.name} failed to upload`);
    } finally {
      setUploadingCount((n) => n - 1);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach(uploadDesignFile);
  }

  // 200ms debounce — calculator hits the API on every change otherwise.
  const [debouncedInputs, setDebouncedInputs] = useState(inputs);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedInputs(inputs), 200);
    return () => clearTimeout(t);
  }, [inputs]);

  // Pricing options — fetched once, cached forever (admin edits invalidate
  // server-side cache; user reload picks up changes).
  const { data: options } = useQuery<OptionsResponse>({
    queryKey: ['instant-quote', 'options'],
    queryFn: async () => {
      const r = await fetch('/api/quote/options');
      if (!r.ok) throw new Error('Failed to load pricing options');
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const numLocations = useMemo(
    () => Object.values(inputs.locations).filter(Boolean).length,
    [inputs.locations]
  );

  // Calculate query — runs against debouncedInputs so it doesn't fire on every keystroke.
  const debouncedTotalQty = totalQuantity(debouncedInputs.sizes);
  const calcEnabled = numLocations > 0 && debouncedTotalQty > 0;
  const { data: calc, isFetching: calcLoading } = useQuery<CalcResponse>({
    queryKey: ['instant-quote', 'calculate', debouncedInputs, numLocations],
    queryFn: async () => {
      const r = await fetch('/api/quote/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sizes: debouncedInputs.sizes.filter((s) => s.quantity > 0),
          color: debouncedInputs.color,
          garmentName: debouncedInputs.garmentName,
          qualityTier: debouncedInputs.qualityTier,
          methodName: debouncedInputs.methodName,
          numLocations: Object.values(debouncedInputs.locations).filter(Boolean).length,
          colorsPerLocation: debouncedInputs.colorsPerLocation,
          rush: debouncedInputs.rush,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Calculation failed');
      return body;
    },
    enabled: calcEnabled,
    placeholderData: (prev) => prev, // keep showing last result while recalculating
  });

  const update = (patch: Partial<Inputs>) => setInputs((prev) => ({ ...prev, ...patch }));

  // Garment names (deduped from options, preserving first-seen order)
  const garmentNames = useMemo(() => {
    if (!options) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const g of options.garments) {
      if (!seen.has(g.name)) { seen.add(g.name); out.push(g.name); }
    }
    return out;
  }, [options]);

  const isScreenPrint = inputs.methodName === 'Screen Print';
  const liveTotalQty = totalQuantity(inputs.sizes);
  const currentTier = useMemo(() => {
    if (!options) return null;
    return options.quantity_tiers.find(
      (t) => liveTotalQty >= t.min_qty && (t.max_qty === null || liveTotalQty <= t.max_qty)
    ) || null;
  }, [options, liveTotalQty]);

  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gray-900 text-white py-12 sm:py-16 text-center">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold">Instant Quote</h1>
          <p className="mt-3 text-gray-400 max-w-xl mx-auto text-base sm:text-lg">
            Pick your garment, method, and quantity — see the price update in real time.
          </p>
        </div>
      </section>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* ─── Catalog product banner (when arrived from /shop) ─── */}
        {catalogProduct && (
          <SelectedProductBanner product={catalogProduct} />
        )}

        {/* ─── Sticky price card (above the fold on mobile) ─── */}
        <PriceCard
          calc={calc}
          quantity={debouncedTotalQty}
          loading={calcLoading}
          hasInputs={calcEnabled}
          numLocations={numLocations}
          tier={currentTier}
        />

        {/* ─── Form ─── */}
        <div className="mt-6 space-y-8">

          {/* Upload graphic — optional, but customers usually have art ready;
              accepting it now means we can quote artwork prep accurately and
              the file is waiting for us when they lock in the order. */}
          <Section icon={<Upload className="h-5 w-5" />} title="Upload your graphic">
            <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 px-4 py-8 text-sm text-gray-500 transition hover:border-red-400 hover:bg-gray-50">
              <Upload className="h-5 w-5" />
              <span>{uploadingCount > 0 ? `Uploading ${uploadingCount}…` : 'Click to add files (PNG, JPG, SVG, PDF)'}</span>
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.svg"
                className="hidden"
                onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
              />
            </label>
            <p className="mt-2 text-xs text-gray-500">Optional — but helps us quote artwork prep accurately and locks in your design when you order. PNG with transparent background works best.</p>

            {designs.length > 0 && (
              <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {designs.map((d, i) => (
                  <li key={d.url} className="relative rounded-lg border border-gray-200 bg-white p-2">
                    <img src={d.url} alt={d.filename} className="w-full h-24 object-contain rounded bg-gray-50" />
                    <p className="mt-1 truncate text-xs text-gray-700">{d.filename}</p>
                    <button
                      type="button"
                      onClick={() => setDesigns(designs.filter((_, idx) => idx !== i))}
                      className="absolute top-1 right-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-white border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 shadow-sm"
                      aria-label={`Remove ${d.filename}`}
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Sizes — per-size quantities; 2XL+ trigger upcharges */}
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
                        update({ sizes: next });
                      }}
                      placeholder="0"
                      className="w-full text-center rounded-lg border border-gray-300 px-2 py-2 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
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
              Total: <strong className="text-gray-900">{totalQuantity(inputs.sizes)}</strong>
              {currentTier && currentTier.discount_pct > 0 && (
                <span className="ml-2 text-xs text-green-700">
                  {Math.round(currentTier.discount_pct * 100)}% volume discount
                </span>
              )}
            </div>
          </Section>

          {/* Color */}
          <Section icon={<span className="text-xl">🎨</span>} title="Shirt color">
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {COLOR_OPTIONS.map((c) => (
                <Chip key={c} active={inputs.color === c} onClick={() => update({ color: c })}>
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
                <Chip key={name} active={inputs.garmentName === name} onClick={() => update({ garmentName: name })}>
                  {name}
                </Chip>
              ))}
            </div>
          </Section>

          {/* Quality tier */}
          <Section icon={<Layers className="h-5 w-5" />} title="Quality tier">
            <div className="grid grid-cols-3 gap-2">
              {(['Standard', 'Premium', 'Ultra'] as const).map((q) => {
                const garment = options?.garments.find((g) => g.name === inputs.garmentName && g.quality_tier === q);
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => update({ qualityTier: q })}
                    className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                      inputs.qualityTier === q ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
                    }`}
                  >
                    <div>{q}</div>
                    {garment && <div className="text-[10px] mt-0.5 text-gray-500">${garment.base_cost.toFixed(2)} cost</div>}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Print method */}
          <Section icon={<Printer className="h-5 w-5" />} title="Print method">
            <div className="grid grid-cols-2 gap-2">
              {options?.print_methods.map((m) => (
                <Chip
                  key={m.id}
                  active={inputs.methodName === m.name}
                  onClick={() => update({ methodName: m.name as Inputs['methodName'] })}
                >
                  {m.name}
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
                  onClick={() => update({ locations: { ...inputs.locations, [loc]: !inputs.locations[loc] } })}
                  className={`rounded-xl border-2 px-3 py-3 text-sm font-medium capitalize transition ${
                    inputs.locations[loc] ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
                  }`}
                >
                  {inputs.locations[loc] && <Check className="inline h-3.5 w-3.5 mr-1" />}
                  {loc}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">Front + Back = 2 locations. Pick any combination.</p>
          </Section>

          {/* Colors — only for screen print */}
          {isScreenPrint && (
            <Section icon={<Palette className="h-5 w-5" />} title="How many colors per location?">
              <div className="grid grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => update({ colorsPerLocation: n })}
                    className={`rounded-xl border-2 py-3 text-base font-bold transition ${
                      inputs.colorsPerLocation === n ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
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
                onClick={() => update({ rush: false })}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                  !inputs.rush ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
                }`}
              >
                <div>Standard</div>
                <div className="text-[10px] mt-0.5 text-gray-500">{options?.settings.standard_turnaround ?? 10} days</div>
              </button>
              <button
                type="button"
                onClick={() => update({ rush: true })}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                  inputs.rush ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
                }`}
              >
                <div>Rush</div>
                <div className="text-[10px] mt-0.5 text-gray-500">
                  {options?.settings.rush_turnaround ?? 5} days · +{Math.round((options?.settings.rush_surcharge_pct ?? 0.25) * 100)}%
                </div>
              </button>
            </div>
          </Section>
        </div>

        {/* CTAs — Save + Lock-in are wired in later phases. */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setSaveOpen('save')}
            disabled={!calc}
            className="w-full rounded-xl border-2 border-gray-300 px-6 py-4 text-base font-bold text-gray-700 hover:border-red-400 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            Save Quote (email me)
          </button>
          <button
            type="button"
            onClick={() => setSaveOpen('lock-in')}
            disabled={!calc}
            className="w-full rounded-xl bg-red-600 px-6 py-4 text-base font-bold text-white hover:bg-red-700 disabled:opacity-50 transition"
          >
            Lock In Order — 50% deposit
          </button>
        </div>

        {/* Disclaimer */}
        <p className="mt-6 text-center text-xs text-gray-500">
          Estimate only. Final price confirmed after we review your artwork. Tax + shipping calculated at checkout.
        </p>
      </main>

      {saveOpen && calc && (
        <SaveQuoteModal
          inputs={inputs}
          numLocations={numLocations}
          intent={saveOpen}
          calcTotal={calc.total}
          designUrls={designs.map((d) => d.url)}
          catalogProduct={catalogProduct ?? null}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </Layout>
  );
}

function SaveQuoteModal({
  inputs, numLocations, intent, calcTotal, designUrls, catalogProduct, onClose,
}: {
  inputs: Inputs;
  numLocations: number;
  intent: 'save' | 'lock-in';
  calcTotal: number;
  designUrls: string[];
  catalogProduct: CatalogProduct | null;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isLockIn = intent === 'lock-in';
  const depositAmount = calcTotal / 2;

  async function submit() {
    if (!email || !/.+@.+\..+/.test(email)) {
      toast.error('Enter a valid email');
      return;
    }
    setSaving(true);
    try {
      // Step 1: persist the quote (same call as the save flow). Always run
      // this even on lock-in so we have a permanent record + the customer
      // gets the saved-quote email.
      const saveRes = await fetch('/api/quote/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name || null,
          customer_email: email,
          notes: notes || null,
          // First uploaded URL (if any) becomes design_url for backwards
          // compatibility with admin renderers; the rest go into
          // extra_design_urls (JSONB array) on the quote row.
          design_url: designUrls[0] || null,
          extra_design_urls: designUrls.slice(1),
          inputs: {
            sizes: inputs.sizes.filter((s) => s.quantity > 0),
            color: inputs.color,
            garmentName: inputs.garmentName,
            qualityTier: inputs.qualityTier,
            methodName: inputs.methodName,
            numLocations,
            colorsPerLocation: inputs.colorsPerLocation,
            rush: inputs.rush,
            // Non-API fields, included so the email can show 'Front + Sleeve' etc.
            locations: inputs.locations,
            // When the customer arrived from the catalog, stash the product
            // reference so admin can see exactly which catalog item they
            // were quoting (the calculator only knows abstract categories).
            ...(catalogProduct ? {
              catalog_product: {
                ss_id: catalogProduct.ss_id,
                name: catalogProduct.name,
                brand: catalogProduct.brand,
                category: catalogProduct.category,
                image_url: catalogProduct.image_url || catalogProduct.imageUrl,
              },
            } : {}),
          },
        }),
      });
      const saveBody = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveBody.error || 'Save failed');

      if (!isLockIn) {
        toast.success(`Quote #${saveBody.id} saved — check your email.`);
        onClose();
        return;
      }

      // Step 2 (lock-in only): create Stripe Checkout Session and redirect.
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
            ? `We'll save your quote, then take you to Stripe for the 50% deposit ($${depositAmount.toFixed(2)}). Balance due before pickup or shipment.`
            : `We'll email you the breakdown so you have it on file.`}
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
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">Notes for the shop</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional — special requirements, deadline notes, etc."
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
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
            className="rounded-lg bg-red-600 px-6 py-3 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
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

function SelectedProductBanner({ product }: { product: CatalogProduct }) {
  const img = product.image_url || product.imageUrl;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white p-3">
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50">
        {img ? (
          <img src={img} alt={product.name} className="h-full w-full object-contain p-1" loading="lazy" />
        ) : (
          <Shirt className="h-6 w-6 text-gray-400" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
          Quoting · {product.brand || 'Catalog item'}
        </p>
        <p className="font-display text-sm font-semibold text-gray-900 truncate">{product.name}</p>
        {product.category && (
          <p className="text-xs text-gray-500 truncate">{product.category}</p>
        )}
      </div>
      <Link
        to="/shop"
        className="flex-shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        Change
      </Link>
    </div>
  );
}

function PriceCard({
  calc, quantity, loading, hasInputs, numLocations, tier,
}: {
  calc?: CalcResponse;
  quantity: number;
  loading: boolean;
  hasInputs: boolean;
  numLocations: number;
  tier: QuantityTier | null;
}) {
  if (!hasInputs) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-300 p-6 text-center text-gray-500">
        {numLocations === 0
          ? 'Pick at least one print location to see your quote.'
          : 'Fill in the form to see your quote.'}
      </div>
    );
  }
  if (!calc) {
    return (
      <div className="rounded-2xl border-2 border-gray-200 p-6 flex items-center justify-center gap-2 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Calculating...
      </div>
    );
  }
  return (
    <div className="rounded-2xl bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-red-700/70">Per shirt</div>
          <div className="font-display text-3xl sm:text-4xl font-bold text-gray-900">
            ${calc.per_shirt.toFixed(2)}
            {loading && <Loader2 className="inline ml-2 h-4 w-4 animate-spin text-red-400" />}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-red-700/70">Total</div>
          <div className="font-display text-2xl sm:text-3xl font-bold text-gray-900">
            ${calc.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 text-sm">
        <span className="rounded-full bg-white px-3 py-1 text-gray-700 border border-red-200">
          {calc.turnaround_days} day turnaround
        </span>
        {tier && tier.discount_pct > 0 && (
          <span className="rounded-full bg-white px-3 py-1 text-gray-700 border border-red-200">
            {Math.round(tier.discount_pct * 100)}% volume discount
          </span>
        )}
      </div>

      {/* Collapsible breakdown */}
      <details className="mt-4 group">
        <summary className="flex items-center gap-1 text-sm text-red-700 hover:text-red-800 cursor-pointer select-none list-none">
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
          {calc.breakdown.rush_surcharge > 0 && <Row label="Rush surcharge (+25%)" value={calc.breakdown.rush_surcharge} />}
          <Row label={`Subtotal × ${calc.breakdown.markup_multiplier} markup`} value={calc.total} bold />
        </dl>
      </details>
    </div>
  );
}

function Row({ label, sub, value, negative, bold }: { label: string; sub?: string; value: number; negative?: boolean; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${bold ? 'pt-2 border-t border-red-200 font-bold text-gray-900' : ''}`}>
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
        active ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-400'
      }`}
    >
      {children}
    </button>
  );
}
