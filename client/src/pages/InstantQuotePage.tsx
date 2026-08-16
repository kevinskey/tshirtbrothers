import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import {
  Shirt,
  Palette,
  ChevronDown,
  Loader2,
  Check,
  Upload,
  X as XIcon,
  Plus,
  Trash2,
  PenSquare,
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

type CatalogColor = string | { hex?: string; name?: string; swatch?: string; image?: string };

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
  // products.colors / products.sizes from the DB — when present, the quote
  // form restricts its choices to what the picked product actually comes in.
  colors?: CatalogColor[];
  sizes?: string[];
};

// Fields collected when the customer is quoting something that isn't in our
// catalog — no size grid, no print method, just a free-form description +
// quantity that the admin will review and price manually.
// DTF pressing labor rate — auto-priced client-side for display. MUST match
// PRESS_ONLY_RATE in server/routes/instantQuote.js, which is what actually
// prices the saved quote (emails, admin, deposit).
const PRESS_ONLY_RATE = 3;

type CustomItemInputs = {
  description: string;
  quantity: string;
  notes: string;
  // 'press-only' = DTF pressing service: quantity × $3 auto-priced; any
  // transfer PRINTING is still priced manually after art review.
  service?: 'press-only';
};

// Auto-priced portion of a custom item (0 for everything except pressing).
function pressTotal(it: ItemDraft): number {
  if (it.kind !== 'custom' || it.custom.service !== 'press-only') return 0;
  return (parseInt(it.custom.quantity, 10) || 0) * PRESS_ONLY_RATE;
}

// Which shape of question set the item is currently in.
//   unset   — the five-card "what are you quoting?" picker
//   catalog — minimal priced form (garment preset by the picked card)
//   custom  — free-form describe-it form ("Other" card)
type ItemKind = 'unset' | 'catalog' | 'custom';

// One line item the customer is configuring. A quote is an ordered list of
// these — the customer can add as many as they want before saving.
type ItemDraft = {
  id: string;
  kind: ItemKind;
  inputs: Inputs;
  custom: CustomItemInputs;
  designs: Array<{ url: string; filename: string }>;
  pickedProduct: CatalogProduct | null;
  // Screenshot of the design canvas captured when the customer clicked
  // "Get Price" in the Design Studio. Shown as a large preview at the top
  // of the card so the mockup stays visible alongside the price. When the
  // design uses both sides, `mockupUrlBack` is set too and both render
  // side-by-side in the preview banner.
  mockupUrl?: string | null;
  mockupUrlBack?: string | null;
};

const COLOR_OPTIONS: readonly string[] = [
  'Black', 'White', 'Navy', 'Heather Gray', 'Gray', 'Charcoal',
  'Red', 'Maroon', 'Royal', 'Forest', 'Kelly Green', 'Purple',
  'Orange', 'Yellow', 'Pink', 'Sand', 'Brown',
];

// Hex fallbacks for the named palette when the catalog product doesn't
// supply hex values. Keys are lowercased color names.
const NAMED_COLOR_HEX: Record<string, string> = {
  black: '#1a1a1a',
  white: '#ffffff',
  navy: '#1c2841',
  'heather gray': '#a8a9ad',
  'heather grey': '#a8a9ad',
  gray: '#8e8e8e',
  grey: '#8e8e8e',
  charcoal: '#36454f',
  red: '#b22234',
  maroon: '#800000',
  royal: '#2945a3',
  'royal blue': '#2945a3',
  forest: '#1e5132',
  'forest green': '#1e5132',
  'kelly green': '#4cbb17',
  kelly: '#4cbb17',
  green: '#1e8449',
  purple: '#6b3fa0',
  orange: '#ed6d2f',
  yellow: '#f7d800',
  gold: '#d4af37',
  pink: '#f4a3b6',
  'hot pink': '#e91e63',
  sand: '#c2b280',
  natural: '#e8dcc4',
  brown: '#5d4037',
  tan: '#c19a6b',
  khaki: '#bdb76b',
  cream: '#f5f5dc',
  silver: '#c0c0c0',
};

function hexFor(name: string): string {
  const key = name.trim().toLowerCase();
  if (NAMED_COLOR_HEX[key]) return NAMED_COLOR_HEX[key];
  if (name.startsWith('#') && /^#[0-9a-f]{3,8}$/i.test(name)) return name;
  return '#cccccc';
}

// Decide whether the checkmark on a selected swatch should be dark or
// light for legibility. Uses the standard luminance formula.
function isLightHex(hex: string): boolean {
  const h = hex.replace('#', '');
  if (h.length < 6) return true;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 186;
}

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

// Umami custom event, if the tracker loaded (adblock / script failure = no-op).
function trackEvent(event: string, data?: Record<string, unknown>): void {
  const w = window as unknown as {
    umami?: { track: (e: string, d?: Record<string, unknown>) => void };
  };
  try { w.umami?.track(event, data); } catch { /* analytics must never break the page */ }
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

// Hats are one-size — the per-size grid doesn't apply. Detect from
// garmentName so the form can switch to a single quantity input.
function isOneSizeGarment(garmentName?: string): boolean {
  const n = (garmentName || '').toLowerCase();
  return n.includes('hat') || n.includes('cap') || n.includes('beanie');
}

// User-facing noun for "per shirt" / "per hat" / "Hat color" etc.
function garmentNoun(garmentName?: string): string {
  const n = (garmentName || '').toLowerCase();
  if (n.includes('hat') || n.includes('cap') || n.includes('beanie')) return 'hat';
  if (n.includes('hood')) return 'hoodie';
  if (n.includes('tank')) return 'tank';
  if (n.includes('polo')) return 'polo';
  if (n.includes('sweatshirt')) return 'sweatshirt';
  if (n.includes('long')) return 'long sleeve';
  return 'shirt';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STANDARD_SHIRT_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

// Pull the size list the form should offer for an item. When a catalog
// product is picked, restrict to that product's actual sizes; otherwise
// fall back to the standard shirt grid (or "One Size" for hats).
function availableSizesFor(
  product: CatalogProduct | null,
  garmentName: string,
): string[] {
  if (product?.sizes && Array.isArray(product.sizes) && product.sizes.length > 0) {
    return product.sizes.map(String);
  }
  if (isOneSizeGarment(garmentName)) return ['One Size'];
  return STANDARD_SHIRT_SIZES;
}

// Same idea for colors, but return name+hex+swatch tuples so the UI can
// render real fabric-swatch photos when SSActiveWear gives them, falling
// back to a flat hex circle otherwise. products.colors can arrive as:
//   ["Black",...]
//   ["#000",...]
//   [{ hex, name, swatch?, image? }, ...]
type ColorOption = { name: string; hex: string; swatch?: string };
function availableColorsFor(product: CatalogProduct | null): ColorOption[] {
  if (product?.colors && Array.isArray(product.colors) && product.colors.length > 0) {
    const list = product.colors
      .map((c): ColorOption | null => {
        if (typeof c === 'string') {
          if (!c.trim()) return null;
          return { name: c, hex: hexFor(c) };
        }
        const name = c?.name || c?.hex || '';
        if (!name) return null;
        return {
          name,
          hex: c?.hex || hexFor(name),
          // `swatch` is a fabric photo from SSActiveWear; `image` is the
          // front shot of the garment in that color — both work as a
          // realistic swatch source. Prefer the dedicated swatch when
          // present since it's tiny + tightly cropped.
          swatch: c?.swatch || c?.image,
        };
      })
      .filter((c): c is ColorOption => c !== null);
    if (list.length > 0) return list;
  }
  return COLOR_OPTIONS.map((name) => ({ name, hex: hexFor(name) }));
}

// Reshape the sizes array to match the target size list (from the picked
// product, or the default grid). Preserves quantities for sizes that
// survive; sums quantities for removed sizes into the first surviving row
// so a user who switches products doesn't lose their entered numbers.
function normalizeSizesForProduct(
  product: CatalogProduct | null,
  garmentName: string,
  sizes: Inputs['sizes'],
): Inputs['sizes'] {
  const target = availableSizesFor(product, garmentName);
  const qtyMap = new Map<string, number>();
  for (const s of sizes) {
    qtyMap.set(s.size, (qtyMap.get(s.size) || 0) + (Number(s.quantity) || 0));
  }
  let leftover = 0;
  for (const [sz, q] of qtyMap.entries()) {
    if (!target.includes(sz)) leftover += q;
  }
  return target.map((sz, i) => ({
    size: sz,
    quantity: (qtyMap.get(sz) || 0) + (i === 0 ? leftover : 0),
  }));
}

function genItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function newItem(initial?: Partial<Inputs>, kind: ItemKind = 'unset'): ItemDraft {
  return {
    id: genItemId(),
    kind,
    inputs: { ...DEFAULT_INPUTS, ...(initial || {}) },
    custom: { description: '', quantity: '', notes: '' },
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

  // First item: if the URL hints at a specific catalog product/service
  // (?service=dtf, ?product=<ss_id>), the customer clearly wants a catalog
  // quote — skip the type picker so their landing UX is unchanged. Otherwise
  // start at 'unset' so they see "Catalog or Custom?" first.
  const [items, setItems] = useState<ItemDraft[]>(() => {
    const params = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
    const hasCatalogHint = !!(params.get('service') || params.get('product'));
    return [newItem(initialInputs, hasCatalogHint ? 'catalog' : 'unset')];
  });
  const [productPickerItemId, setProductPickerItemId] = useState<string | null>(null);

  // Customer arrives from /design with their freshly designed mockup. Read
  // the navigation payload once and seed the first item: attach the catalog
  // product if one was picked, swap to the right color, surface the mockup
  // screenshot, and also drop it into designs[] so it ships with the quote.
  const location = useLocation();
  const [designStudioHandoffDone, setDesignStudioHandoffDone] = useState(false);
  useEffect(() => {
    if (designStudioHandoffDone) return;
    const state = location.state as
      | {
          fromDesignStudio?: boolean;
          product?: CatalogProduct;
          color?: { name?: string; hex?: string } | string | null;
          mockupUrl?: string | null;
          graphicUrl?: string | null;
          mockupUrlBack?: string | null;
          graphicUrlBack?: string | null;
        }
      | null;
    if (!state?.fromDesignStudio) return;
    setItems((prev) => prev.map((it, i) => {
      if (i !== 0) return it;
      const next: ItemDraft = { ...it, kind: 'catalog' };
      if (state.product) {
        next.pickedProduct = state.product;
        const mapped = categoryToGarmentName(state.product.category);
        const colors = availableColorsFor(state.product);
        const colorNames = colors.map((c) => c.name);
        const incomingColorName = typeof state.color === 'string' ? state.color : state.color?.name;
        const nextColor = (incomingColorName && colorNames.includes(incomingColorName))
          ? incomingColorName
          : (colorNames[0] || it.inputs.color);
        next.inputs = {
          ...it.inputs,
          garmentName: mapped,
          color: nextColor,
          sizes: normalizeSizesForProduct(state.product, mapped, it.inputs.sizes),
        };
      }
      // Mockups (front/back) are shown only in the "Your mockup" preview
      // banner — they're added to designs[] so they ship with the saved
      // quote, but the upload grid filters them out by URL to avoid
      // duplicate thumbnails. Graphics (design only, transparent BG) join
      // the upload list so the shop has the production-ready art files.
      const incomingDesigns: Array<{ url: string; filename: string }> = [];
      if (state.mockupUrl) {
        next.mockupUrl = state.mockupUrl;
        incomingDesigns.push({ url: state.mockupUrl, filename: 'mockup-front.png' });
      }
      if (state.mockupUrlBack) {
        next.mockupUrlBack = state.mockupUrlBack;
        incomingDesigns.push({ url: state.mockupUrlBack, filename: 'mockup-back.png' });
      }
      if (state.graphicUrl) {
        incomingDesigns.push({ url: state.graphicUrl, filename: 'graphic-front.png' });
      }
      if (state.graphicUrlBack) {
        incomingDesigns.push({ url: state.graphicUrlBack, filename: 'graphic-back.png' });
      }
      if (incomingDesigns.length > 0) {
        next.designs = [...incomingDesigns, ...it.designs];
      }
      // Mockup-driven handoff: derive print locations directly from
      // which sides were rendered. Studio already knows where the
      // design lives, so the customer shouldn't have to re-tick the
      // Front/Back boxes on the quote form.
      if (state.mockupUrl || state.mockupUrlBack) {
        next.inputs = {
          ...(next.inputs ?? it.inputs),
          locations: {
            front: !!state.mockupUrl,
            back: !!state.mockupUrlBack,
            sleeve: false,
          },
        };
      }
      return next;
    }));
    setDesignStudioHandoffDone(true);
    // Clear the navigation state so a refresh doesn't re-apply it.
    window.history.replaceState({}, document.title);
  }, [location.state, designStudioHandoffDone]);
  const [saveOpen, setSaveOpen] = useState<false | 'save' | 'lock-in'>(false);
  const [uploadingByItem, setUploadingByItem] = useState<Record<string, number>>({});
  // Only one item is expanded at a time — newly-added items auto-expand
  // and the previous one collapses to a summary card.
  const [expandedItemId, setExpandedItemId] = useState<string | null>(() => items[0]?.id || null);

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
  // onto it AND restrict sizes/colors to the product's actual options.
  // Only runs once, so a user who manually changes either isn't reset.
  const [urlProductSyncDone, setUrlProductSyncDone] = useState(false);
  useEffect(() => {
    if (!urlProductSyncDone && urlCatalogProduct) {
      const mapped = categoryToGarmentName(urlCatalogProduct.category);
      const colors = availableColorsFor(urlCatalogProduct);
      const colorNames = colors.map((c) => c.name);
      setItems((prev) => prev.map((it, i) => {
        if (i !== 0) return it;
        const nextColor = colorNames.includes(it.inputs.color) ? it.inputs.color : (colorNames[0] || it.inputs.color);
        return {
          ...it,
          kind: 'catalog',
          pickedProduct: urlCatalogProduct,
          inputs: {
            ...it.inputs,
            garmentName: mapped,
            color: nextColor,
            sizes: normalizeSizesForProduct(urlCatalogProduct, mapped, it.inputs.sizes),
          },
        };
      }));
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
        // Only catalog-kind items get live pricing. Custom items are
        // priced manually by the admin after review, so we skip the fetch.
        enabled: item.kind === 'catalog' && numLocations > 0 && qty > 0,
        placeholderData: (prev: CalcResponse | undefined) => prev,
      };
    }),
  });

  // Roll-ups across all items.
  const grandTotal = useMemo(
    () => calcQueries.reduce((sum, q) => sum + (q.data?.total || 0), 0)
      + items.reduce((sum, it) => sum + pressTotal(it), 0),
    [calcQueries, items],
  );
  const grandQuantity = useMemo(
    () => items.reduce((sum, it) => {
      if (it.kind === 'custom') return sum + (parseInt(it.custom.quantity, 10) || 0);
      return sum + totalQuantity(it.inputs.sizes);
    }, 0),
    [items],
  );
  const grandTurnaroundDays = useMemo(() => {
    let m = 0;
    for (const q of calcQueries) {
      if (q.data?.turnaround_days && q.data.turnaround_days > m) m = q.data.turnaround_days;
    }
    return m || (options?.settings.standard_turnaround ?? 0);
  }, [calcQueries, options]);

  // ─── Date needed → rush derivation ───
  // One date for the whole order. When it lands inside the standard
  // turnaround window, every item is priced with the rush surcharge —
  // the customer picks a date, never a "rush vs standard" jargon choice.
  const [dateNeeded, setDateNeeded] = useState<string>('');
  const standardDays = options?.settings.standard_turnaround ?? 10;
  const rushDays = options?.settings.rush_turnaround ?? 2;
  const rushPct = Math.round((options?.settings.rush_surcharge_pct ?? 0.25) * 100);
  const daysUntilNeeded = useMemo(() => {
    if (!dateNeeded) return null;
    const need = new Date(`${dateNeeded}T00:00:00`);
    if (Number.isNaN(need.getTime())) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((need.getTime() - today.getTime()) / 86_400_000);
  }, [dateNeeded]);
  const rushNeeded = daysUntilNeeded !== null && daysUntilNeeded < standardDays;
  useEffect(() => {
    setItems((prev) => prev.some((it) => it.inputs.rush !== rushNeeded)
      ? prev.map((it) => ({ ...it, inputs: { ...it.inputs, rush: rushNeeded } }))
      : prev);
  }, [rushNeeded]);

  const anyCalcLoading = calcQueries.some((q) => q.isFetching);
  // Surface the first calc failure (e.g. pricing service down, bad input
  // combo) in the price card instead of silently leaving the total at $0.
  const calcError = calcQueries.find((q) => q.isError)?.error as Error | undefined;
  // A "valid" item depends on its kind:
  //  - unset:   never valid (customer still has to pick a type)
  //  - catalog: at least one location + at least one shirt
  //  - custom:  a description + a positive quantity
  const itemValidity = items.map((it) => {
    if (it.kind === 'unset') return false;
    if (it.kind === 'custom') {
      return it.custom.description.trim().length > 0
        && (parseInt(it.custom.quantity, 10) || 0) > 0;
    }
    return totalQuantity(it.inputs.sizes) > 0
      && Object.values(it.inputs.locations).some(Boolean);
  });
  const allItemsValid = itemValidity.every(Boolean);
  const allCalcsReady = calcQueries.every((q, i) => {
    // Custom items don't have a calc; unset items are already invalid.
    if (items[i]?.kind !== 'catalog') return true;
    // An errored calc still counts as "ready" — the customer can submit
    // and the quote goes through admin review for manual pricing, same as
    // a custom item, instead of getting permanently stuck.
    return !itemValidity[i] || q.data != null || q.isError === true;
  });
  // Save via email works even when the only items are custom (no calculable
  // price yet). Lock-in requires a real total to charge a deposit against.
  const canSave = items.length > 0 && allItemsValid && allCalcsReady;
  const canLockIn = canSave && grandTotal > 0;

  function patchInputs(itemId: string, patch: Partial<Inputs>) {
    setItems((prev) => prev.map((it) => {
      if (it.id !== itemId) return it;
      const nextInputs = { ...it.inputs, ...patch };
      // Garment-type change (e.g. T-shirt → Hat) reshapes the sizes array
      // so the per-size grid switches to a single qty input and back.
      // When a product is picked we keep its size list — the chip selector
      // for garment is hidden in that case anyway.
      if (patch.garmentName && patch.garmentName !== it.inputs.garmentName) {
        nextInputs.sizes = normalizeSizesForProduct(it.pickedProduct, patch.garmentName, it.inputs.sizes);
      }
      return { ...it, inputs: nextInputs };
    }));
  }

  function patchItem(itemId: string, patch: Partial<ItemDraft>) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it)));
  }

  function patchCustom(itemId: string, patch: Partial<CustomItemInputs>) {
    setItems((prev) => prev.map((it) => (
      it.id === itemId ? { ...it, custom: { ...it.custom, ...patch } } : it
    )));
  }

  function setItemKind(itemId: string, kind: ItemKind) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, kind } : it)));
  }

  // A card tap from the five-card picker. Garment cards drop straight into
  // the minimal priced form with garmentName preset; "other" routes to the
  // free-form custom flow.
  function pickItemType(itemId: string, key: string) {
    trackEvent('quote-card-tap', { card: key });
    setItems((prev) => prev.map((it) => {
      if (it.id !== itemId) return it;
      // Strip a previously-attached catalog product / Design Studio mockup
      // from an item, filtering the matching URLs out of designs[] too —
      // used whenever the card pick makes that attachment stale.
      const clearAttachment = (draft: ItemDraft): ItemDraft => ({
        ...draft,
        pickedProduct: null,
        mockupUrl: null,
        mockupUrlBack: null,
        designs: draft.designs.filter((d) => d.url !== draft.mockupUrl && d.url !== draft.mockupUrlBack),
      });
      // Service-style cards route to the custom describe-it flow with a
      // description seed so the shop instantly knows the job type. Seeds
      // only fill an empty description — a customer's own text survives
      // switching cards.
      const customSeeds: Record<string, string> = {
        other: '',
        byo: 'Bringing my own garments — printing only. Garment type + brand: ',
        dtfpress: 'DTF pressing only ($3/each to press ready-to-press transfers). '
          + 'If you need transfers printed too, upload your art below — printing is quoted by print size after we assess it. Transfers: ',
      };
      if (key in customSeeds) {
        const cleared = clearAttachment(it);
        return {
          ...cleared,
          kind: 'custom',
          custom: {
            ...cleared.custom,
            description: cleared.custom.description || (customSeeds[key] ?? ''),
            // Pressing is the one custom service with a known auto-priced
            // rate; switching to another custom card clears the flag.
            service: key === 'dtfpress' ? 'press-only' : undefined,
          },
        };
      }
      const garments: Record<string, string> = {
        tshirt: 'T-shirt',
        hoodie: 'Hoodie',
        sweatshirt: 'Sweatshirt',
        hat: 'Hat',
      };
      const g = garments[key] || 'T-shirt';

      // Does whatever's already attached (catalog product, or a bare
      // Design Studio mockup) still depict this garment? If not, the
      // attachment is stale — clear it so we don't silently keep showing a
      // hoodie mockup on a shirt quote (or vice versa).
      const productMismatch = it.pickedProduct != null
        && categoryToGarmentName(it.pickedProduct.category) !== g;
      const mockupOnlyMismatch = it.pickedProduct == null
        && (it.mockupUrl || it.mockupUrlBack)
        && it.inputs.garmentName !== g;

      if (productMismatch || mockupOnlyMismatch) {
        const cleared = clearAttachment(it);
        const nextInputs = {
          ...cleared.inputs,
          garmentName: g,
          sizes: normalizeSizesForProduct(null, g, it.inputs.sizes),
        };
        return { ...cleared, kind: 'catalog', inputs: nextInputs };
      }

      const nextInputs = { ...it.inputs, garmentName: g };
      nextInputs.sizes = normalizeSizesForProduct(it.pickedProduct, g, it.inputs.sizes);
      return { ...it, kind: 'catalog', inputs: nextInputs };
    }));
  }

  function addItem() {
    // New items inherit the first item's print method so a customer who
    // landed via ?service=embroidery doesn't silently get item 2 priced
    // as DTF the moment they pick a garment card.
    const next = newItem({
      methodName: items[0]?.inputs.methodName || DEFAULT_INPUTS.methodName,
      rush: rushNeeded,
    });
    setItems((prev) => [...prev, next]);
    setExpandedItemId(next.id);
    // Wait for the new card to render, then scroll it into view at the top
    // of the viewport so the user lands right where they need to type.
    setTimeout(() => {
      const el = document.getElementById(`item-card-${next.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function removeItem(itemId: string) {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex((it) => it.id === itemId);
      const next = prev.filter((it) => it.id !== itemId);
      // If the removed item was expanded, expand a neighbor so the user
      // isn't left staring at a list of collapsed cards.
      if (expandedItemId === itemId) {
        const fallback = next[idx] || next[idx - 1] || next[0];
        if (fallback) setExpandedItemId(fallback.id);
      }
      return next;
    });
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
      <Seo
        title="Instant Quote · Custom T-Shirt Printing Calculator · TShirt Brothers"
        description="See your custom t-shirt, hoodie, or polo price update live. Screen print, DTF, embroidery — pick garment, method, and quantity for an instant quote."
        path="/quote"
      />
      {/* No hero band — the site header already eats most of the first
          viewport, so the page title is one compact line and the product
          cards (the real CTA) start above the fold. */}
      <main className="container mx-auto px-4 pt-3 pb-6 sm:pt-4 sm:pb-8 max-w-3xl lg:max-w-5xl">
        <h1 className="font-display text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">
          Instant Quote
          <span className="ml-2 font-sans font-normal text-xs sm:text-sm text-gray-500">
            pick a product — price updates live
          </span>
        </h1>
        {/* ─── Items ─── */}
        <div className="space-y-6">
          {items.map((item, i) => (
            <ItemCard
              key={item.id}
              index={i}
              totalItems={items.length}
              item={item}
              options={options || null}
              calc={calcQueries[i]?.data || null}
              uploadingCount={uploadingByItem[item.id] || 0}
              expanded={items.length === 1 || expandedItemId === item.id}
              onExpand={() => setExpandedItemId(item.id)}
              onPatchInputs={(patch) => patchInputs(item.id, patch)}
              onClearProduct={() => patchItem(item.id, {
                pickedProduct: null,
                inputs: {
                  ...item.inputs,
                  sizes: normalizeSizesForProduct(null, item.inputs.garmentName, item.inputs.sizes),
                },
              })}
              onRemoveDesign={(idx) => patchItem(item.id, {
                designs: item.designs.filter((_, k) => k !== idx),
              })}
              onUploadFiles={(files) => handleItemFiles(item.id, files)}
              onOpenPicker={() => setProductPickerItemId(item.id)}
              onPatchCustom={(patch) => patchCustom(item.id, patch)}
              onSetKind={(kind) => setItemKind(item.id, kind)}
              onPickType={(key) => pickItemType(item.id, key)}
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

        {/* ─── Date needed — one date for the whole order; drives whether
            rush pricing applies. ─── */}
        <div className="mt-6 rounded-2xl border-2 border-gray-200 bg-white p-4 sm:p-5">
          <h2 className="font-display font-bold text-base sm:text-lg text-gray-900">
            📅 When do you need these?
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setDateNeeded('')}
              className={`rounded-full border-2 px-4 py-2.5 text-sm font-semibold transition ${
                !dateNeeded ? 'border-orange-600 bg-orange-600 text-white shadow-sm' : 'border-gray-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50/40'
              }`}
            >
              I'm flexible
            </button>
            <label
              className={`inline-flex cursor-pointer items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition ${
                dateNeeded ? 'border-orange-600 bg-orange-50 text-orange-800' : 'border-gray-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50/40'
              }`}
            >
              Need by
              <input
                type="date"
                value={dateNeeded}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDateNeeded(e.target.value)}
                className="bg-transparent text-sm font-semibold focus:outline-none"
                style={{ fontSize: '16px' }}
                aria-label="Date needed"
              />
            </label>
          </div>
          <p className="mt-2 text-xs sm:text-sm">
            {!dateNeeded && (
              <span className="text-gray-500">Standard turnaround is {standardDays} days — no rush fee.</span>
            )}
            {dateNeeded && !rushNeeded && (
              <span className="text-green-700">✓ Fits our standard {standardDays}-day turnaround — no rush fee.</span>
            )}
            {dateNeeded && rushNeeded && daysUntilNeeded !== null && daysUntilNeeded >= rushDays && (
              <span className="text-amber-700">
                Needed in {daysUntilNeeded} day{daysUntilNeeded === 1 ? '' : 's'} — rush turnaround applies (+{rushPct}%).
              </span>
            )}
            {dateNeeded && rushNeeded && daysUntilNeeded !== null && daysUntilNeeded < rushDays && (
              <span className="text-amber-700">
                That's a very tight window — rush pricing applies (+{rushPct}%), and we'll confirm
                feasibility as soon as we see your quote.
              </span>
            )}
          </p>
        </div>

        {/* ─── Grand-total card — last, right above the CTAs so the
            customer sees the price they're committing to. ─── */}
        <div className="mt-8">
          <PriceCard
            items={items}
            calcs={calcQueries.map((q) => q.data || null)}
            itemValidity={itemValidity}
            loading={anyCalcLoading}
            grandTotal={grandTotal}
            grandQuantity={grandQuantity}
            turnaroundDays={grandTurnaroundDays}
            allValid={allItemsValid}
            calcError={calcError?.message || null}
          />
        </div>

        {/* CTAs. When there's nothing to charge a deposit against (custom-
            only quotes), collapse to a single "Send Quote to Us" primary
            button — otherwise the customer sees a disabled Lock-In and
            wonders whether they're stuck. */}
        {canLockIn ? (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              className="w-full rounded-xl bg-orange-600 px-6 py-4 text-base font-bold text-white hover:bg-orange-700 transition"
            >
              Lock In Order — 50% deposit
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setSaveOpen('save')}
              disabled={!canSave}
              className="w-full rounded-xl bg-orange-600 px-6 py-4 text-base font-bold text-white hover:bg-orange-700 disabled:opacity-50 transition"
            >
              Send Quote to Us for Pricing
            </button>
            {canSave && (
              <p className="mt-2 text-center text-xs text-gray-500">
                We'll email you a price after our team reviews your custom item — usually within one business day.
              </p>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-gray-500">
          Estimate only. Final price confirmed after we review your artwork. Tax + shipping calculated at checkout.
        </p>
      </main>

      {saveOpen && canSave && (
        <SaveQuoteModal
          items={items}
          dateNeeded={dateNeeded}
          rushNeeded={rushNeeded}
          intent={saveOpen}
          grandTotal={grandTotal}
          onClose={() => setSaveOpen(false)}
        />
      )}
      {productPickerItemId && (
        <ProductPickerModal
          onPick={(p) => {
            // Picking from the catalog snaps garmentName onto the product's
            // category and reshapes sizes to the product's actual available
            // sizes (or "One Size" for hats). If the previously-selected
            // color isn't offered by this product, swap to the first one.
            const mapped = categoryToGarmentName(p.category);
            const colors = availableColorsFor(p);
            const colorNames = colors.map((c) => c.name);
            setItems((prev) => prev.map((it) => {
              if (it.id !== productPickerItemId) return it;
              const nextColor = colorNames.includes(it.inputs.color) ? it.inputs.color : (colorNames[0] || it.inputs.color);
              return {
                ...it,
                pickedProduct: p,
                inputs: {
                  ...it.inputs,
                  garmentName: mapped,
                  color: nextColor,
                  sizes: normalizeSizesForProduct(p, mapped, it.inputs.sizes),
                },
              };
            }));
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
  expanded, onExpand,
  onPatchInputs, onClearProduct, onRemoveDesign, onUploadFiles, onOpenPicker,
  onPatchCustom, onSetKind, onPickType, onRemove,
}: {
  index: number;
  totalItems: number;
  item: ItemDraft;
  options: OptionsResponse | null;
  calc: CalcResponse | null;
  uploadingCount: number;
  expanded: boolean;
  onExpand: () => void;
  onPatchInputs: (patch: Partial<Inputs>) => void;
  onClearProduct: () => void;
  onRemoveDesign: (idx: number) => void;
  onUploadFiles: (files: FileList | null) => void;
  onOpenPicker: () => void;
  onPatchCustom: (patch: Partial<CustomItemInputs>) => void;
  onSetKind: (kind: ItemKind) => void;
  onPickType: (key: string) => void;
  onRemove: (() => void) | null;
}) {
  const inputs = item.inputs;
  const liveTotalQty = totalQuantity(inputs.sizes);

  // User-facing noun ('hat' / 'shirt' / 'hoodie' …) derived from the
  // garment type, used to localize "per shirt" / "Shirt color" etc.
  const noun = garmentNoun(inputs.garmentName);
  // When a catalog product is picked, restrict the size grid and color
  // chips to what that product actually comes in. Otherwise fall through
  // to the default shirt grid / palette.
  const sizeList = useMemo(() => availableSizesFor(item.pickedProduct, inputs.garmentName), [item.pickedProduct, inputs.garmentName]);
  const colorList = useMemo(() => availableColorsFor(item.pickedProduct), [item.pickedProduct]);

  const currentTier = useMemo(() => {
    if (!options) return null;
    return options.quantity_tiers.find(
      (t) => liveTotalQty >= t.min_qty && (t.max_qty === null || liveTotalQty <= t.max_qty),
    ) || null;
  }, [options, liveTotalQty]);

  // Collapsed summary — shown for prior products once a newer one is being
  // edited, so the form is short and scannable while only the active card
  // is in full edit mode.
  if (!expanded) {
    const img = item.pickedProduct?.image_url || item.pickedProduct?.imageUrl;
    let productLabel: string;
    let detail: string;
    if (item.kind === 'unset') {
      productLabel = 'Choose product type';
      detail = 'Tap Edit to choose';
    } else if (item.kind === 'custom') {
      const cq = parseInt(item.custom.quantity, 10) || 0;
      productLabel = item.custom.description.trim() || 'Custom item';
      detail = item.custom.service === 'press-only'
        ? `${cq} pcs · DTF pressing · $${pressTotal(item).toFixed(2)}`
        : `${cq} pcs · custom · priced after review`;
    } else {
      productLabel = item.pickedProduct ? item.pickedProduct.name : inputs.garmentName;
      const locs: string[] = [];
      if (inputs.locations.front) locs.push('Front');
      if (inputs.locations.back) locs.push('Back');
      detail = `${liveTotalQty} pcs · ${inputs.color}${locs.length ? ' · ' + locs.join(' + ') : ''}`;
    }
    return (
      <div
        id={`item-card-${item.id}`}
        className="rounded-2xl border-2 border-gray-200 bg-white p-3 sm:p-4 hover:border-orange-300 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-7 min-w-[28px] items-center justify-center rounded-full bg-orange-100 px-2 text-sm font-bold text-orange-700">
            {index + 1}
          </span>
          <button
            type="button"
            onClick={onExpand}
            className="flex flex-1 min-w-0 items-center gap-3 text-left"
            aria-label={`Edit product ${index + 1}`}
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-50">
              {img ? (
                <img src={img} alt="" className="h-full w-full object-contain p-1" loading="lazy" />
              ) : (
                <Shirt className="h-4 w-4 text-gray-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{productLabel}</p>
              <p className="truncate text-xs text-gray-500">{detail}</p>
            </div>
            {calc && (
              <span className="whitespace-nowrap font-display text-base font-bold text-gray-900">
                ${calc.total.toFixed(2)}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={onExpand}
            className="flex-shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200"
          >
            Edit
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="flex-shrink-0 inline-flex items-center rounded-lg border border-gray-200 p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700 hover:border-red-200"
              aria-label={`Remove product ${index + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      id={`item-card-${item.id}`}
      className="rounded-2xl border-2 border-orange-500 bg-white p-4 sm:p-6 shadow-sm shadow-orange-500/10"
    >
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

      {/* Card picker — first thing a new item shows. One tap picks the
          product type; "Something else" routes to the custom flow. */}
      {item.kind === 'unset' && (
        <div>
          <p className="mb-3 text-sm text-gray-600">What are you quoting?</p>
          {/* One card per row on phones (icon left, text right, chevron
              affordance); sm+ goes back to a 3-up grid of stacked cards. */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { key: 'tshirt',     icon: '👕', label: 'T-shirt',        sub: 'Softstyle, Comfort Colors, Next Level' },
              { key: 'hoodie',     icon: '🧥', label: 'Hoodie',         sub: 'Pullover + zip options' },
              { key: 'sweatshirt', icon: '👚', label: 'Sweatshirt',     sub: 'Crewneck fleece' },
              { key: 'hat',        icon: '🧢', label: 'Hat',            sub: 'Caps, beanies, snapbacks' },
              { key: 'other',      icon: '✨', label: 'Something else', sub: 'Bags, koozies, patches — describe it' },
              { key: 'byo',        icon: '📦', label: 'I have my own shirts', sub: 'You supply the garments — we print them' },
              { key: 'dtfpress',   icon: '🔥', label: 'DTF pressing only',    sub: 'Pressing $3 each · transfer printing quoted by size' },
            ].map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => onPickType(card.key)}
                className="group flex items-center gap-4 rounded-2xl border-2 border-gray-300 bg-white p-4 text-left shadow-sm transition hover:border-orange-500 hover:bg-orange-50/40 active:scale-[0.99] sm:flex-col sm:items-start sm:gap-1.5 sm:p-5"
              >
                <span className="text-3xl sm:text-2xl" aria-hidden="true">{card.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg sm:text-base font-bold text-gray-900">{card.label}</span>
                  <span className="block text-xs sm:text-[11px] text-gray-500 leading-snug">{card.sub}</span>
                </span>
                <ChevronDown className="h-5 w-5 -rotate-90 text-gray-400 group-hover:text-orange-600 sm:hidden" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom item form — free-form description + quantity. No live price;
          admin reviews and sets pricing when they respond. */}
      {item.kind === 'custom' && (
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => onSetKind('unset')}
            className="text-xs text-orange-700 hover:text-orange-800 hover:underline"
          >
            ← Change product type
          </button>
          <Section icon={<PenSquare className="h-5 w-5" />} title="Describe what you want">
            <textarea
              value={item.custom.description}
              onChange={(e) => onPatchCustom({ description: e.target.value })}
              placeholder="e.g. Woven satin patches, 3in circle, with our logo embroidered on the front"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              style={{ fontSize: '16px' }}
            />
            <p className="mt-2 text-xs text-gray-500">Include material, size, colors, finish — whatever helps us quote accurately.</p>
          </Section>
          <Section icon={<span className="text-xl">#</span>} title="How many do you need?">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={item.custom.quantity}
              onChange={(e) => onPatchCustom({ quantity: e.target.value.replace(/[^0-9]/g, '') })}
              placeholder="e.g. 50"
              className="w-32 text-center rounded-lg border border-gray-300 px-2 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
              style={{ fontSize: '16px' }}
            />
            {item.custom.service === 'press-only' && (parseInt(item.custom.quantity, 10) || 0) > 0 && (
              <p className="mt-2 text-sm text-gray-700">
                Pressing: {parseInt(item.custom.quantity, 10)} × ${PRESS_ONLY_RATE.toFixed(2)} ={' '}
                <strong className="text-gray-900">${pressTotal(item).toFixed(2)}</strong>
                <span className="block text-xs text-gray-500">
                  Transfer printing (if you need it) is quoted after we review your art.
                </span>
              </p>
            )}
          </Section>
          <Section icon={<Upload className="h-5 w-5" />} title="Reference photo or artwork (optional)">
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
          <Section icon={<span className="text-xl">✎</span>} title="Anything else? (optional)">
            <textarea
              value={item.custom.notes}
              onChange={(e) => onPatchCustom({ notes: e.target.value })}
              placeholder="Deadline, budget, brand guidelines, etc."
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              style={{ fontSize: '16px' }}
            />
          </Section>
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900">
            {item.custom.service === 'press-only'
              ? `Pressing is priced live at $${PRESS_ONLY_RATE.toFixed(2)}/each. If you also need transfers printed, that part is quoted after we review your art.`
              : "Custom items are priced after our team reviews your request. Save the quote and we'll email you a price."}
          </div>
        </div>
      )}

      {/* Mockup from Design Studio — large preview so the customer's design
          stays visible alongside the live price. When the design has both
          front and back, render them side-by-side. */}
      {item.kind === 'catalog' && (<>
      {/* Garment chip + change — returns to the card picker. State is
          preserved, so tapping a different card keeps qty/color/art. */}
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1.5 text-sm font-semibold text-orange-800">
          <Shirt className="h-4 w-4" /> {item.pickedProduct?.name || inputs.garmentName}
        </span>
        <button
          type="button"
          onClick={() => onSetKind('unset')}
          className="text-xs text-orange-700 hover:text-orange-800 hover:underline"
        >
          change
        </button>
      </div>
      {(item.mockupUrl || item.mockupUrlBack) && (
        <div className="mb-4 overflow-hidden rounded-2xl border-2 border-orange-300 bg-gradient-to-br from-orange-50 to-white p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-700 ring-1 ring-orange-200">
              <Check className="h-3 w-3" /> Your mockup
            </span>
            <p className="text-xs text-gray-500">Designed in the Studio</p>
          </div>
          <div className={`grid gap-3 ${item.mockupUrl && item.mockupUrlBack ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
            {item.mockupUrl && (
              <div className="flex flex-col items-center rounded-xl bg-white p-2 ring-1 ring-orange-200">
                <img
                  src={item.mockupUrl}
                  alt="Your mockup, front"
                  className="max-h-56 sm:max-h-72 w-auto object-contain"
                />
                {item.mockupUrlBack && (
                  <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700">Front</span>
                )}
              </div>
            )}
            {item.mockupUrlBack && (
              <div className="flex flex-col items-center rounded-xl bg-white p-2 ring-1 ring-orange-200">
                <img
                  src={item.mockupUrlBack}
                  alt="Your mockup, back"
                  className="max-h-56 sm:max-h-72 w-auto object-contain"
                />
                {item.mockupUrl && (
                  <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-orange-700">Back</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Catalog product banner (manual pick or URL-loaded on item 0) */}
      {item.pickedProduct && (
        <SelectedProductBanner product={item.pickedProduct} noun={noun} onClear={onClearProduct} />
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
              Quoting a specific {noun}? <span className="underline">Browse the catalog</span>
            </button>
          </div>
        )}

        {/* Quantity — one total. Size breakdown is collected after the
            quote is accepted, so the customer isn't blocked on it here. */}
        <Section icon={<span className="text-xl">#</span>} title={`How many ${noun}s?`}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={liveTotalQty || ''}
            onChange={(e) => {
              const qty = Math.max(0, parseInt(e.target.value) || 0);
              onPatchInputs({ sizes: [{ size: sizeList[0] || 'S', quantity: qty }] });
            }}
            placeholder="e.g. 24"
            className="w-32 text-center rounded-lg border border-gray-300 px-2 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
            style={{ fontSize: '16px' }}
          />
          <p className="mt-2 text-xs text-gray-500">
            We'll collect your size breakdown when you approve the quote.
            {currentTier && currentTier.discount_pct > 0 && (
              <span className="ml-2 text-green-700 font-medium">
                {Math.round(currentTier.discount_pct * 100)}% volume discount applied
              </span>
            )}
          </p>
        </Section>

        {/* Color — fabric-swatch photos from SSActiveWear when the picked
            product has them, otherwise a flat hex circle. Hidden when
            the item came from a customer mockup; the studio already
            captured the color and reshowing this would let the price
            disagree with the mockup the customer just approved. */}
        {!(item.mockupUrl || item.mockupUrlBack) && (
        <Section icon={<span className="text-xl">🎨</span>} title={`${capitalize(noun)} color`}>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {colorList.map((c) => {
              const active = inputs.color === c.name;
              const isWhiteish = c.hex.toLowerCase() === '#ffffff' || c.hex.toLowerCase() === '#fff';
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => onPatchInputs({ color: c.name })}
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={active}
                  className={`relative inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center overflow-hidden rounded-full transition focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                    active
                      ? 'ring-2 ring-orange-600 ring-offset-2'
                      : isWhiteish
                        ? 'ring-1 ring-gray-300 hover:ring-gray-500'
                        : 'ring-1 ring-gray-200 hover:ring-gray-400'
                  }`}
                  style={!c.swatch ? { backgroundColor: c.hex } : undefined}
                >
                  {c.swatch && (
                    <img
                      src={c.swatch}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  )}
                  {active && (
                    <Check className={`relative h-3.5 w-3.5 drop-shadow ${isLightHex(c.hex) ? 'text-gray-900' : 'text-white'}`} />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            <span className="text-gray-700 font-medium">{inputs.color}</span>
            {' · '}
            {item.pickedProduct
              ? `Available colors for this ${noun}.`
              : `Other colors available — we'll match on your final mockup.`}
          </p>
        </Section>
        )}

        {/* Upload — hidden when a Studio mockup is attached. The mockup
            already carries the customer's finished art, so prompting
            for a separate file would invite a mismatch. */}
        {!(item.mockupUrl || item.mockupUrlBack) && (
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

          {item.designs.some((d) => d.url !== item.mockupUrl && d.url !== item.mockupUrlBack) && (
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {item.designs.map((d, i) => (
                (d.url === item.mockupUrl || d.url === item.mockupUrlBack) ? null : (
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
                )
              ))}
            </ul>
          )}
        </Section>
        )}

        {/* Print sides — single choice. Sleeve prints and multi-location
            combos are handled by the shop after review. */}
        {!(item.mockupUrl || item.mockupUrlBack) && (
        <Section icon={<Palette className="h-5 w-5" />} title="Print on the…">
          <div className="grid grid-cols-3 gap-2">
            {([
              ['front', 'Front'],
              ['back', 'Back'],
              ['both', 'Front + Back'],
            ] as const).map(([key, label]) => {
              const active = key === 'both'
                ? inputs.locations.front && inputs.locations.back
                : key === 'front'
                  ? inputs.locations.front && !inputs.locations.back
                  : inputs.locations.back && !inputs.locations.front;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPatchInputs({
                    locations: { front: key !== 'back', back: key !== 'front', sleeve: false },
                  })}
                  className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                    active ? 'border-orange-600 bg-orange-600 text-white shadow-sm' : 'border-gray-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50/40'
                  }`}
                >
                  {active && <Check className="inline h-3.5 w-3.5 mr-1" />}
                  {label}
                </button>
              );
            })}
          </div>
        </Section>
        )}
      </div>
      </>)}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  SaveQuoteModal — collects email and POSTs the multi-item payload      */
/* ────────────────────────────────────────────────────────────────────── */

function SaveQuoteModal({
  items, intent, grandTotal, dateNeeded, rushNeeded, onClose,
}: {
  items: ItemDraft[];
  intent: 'save' | 'lock-in';
  grandTotal: number;
  dateNeeded: string;
  rushNeeded: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isLockIn = intent === 'lock-in';
  const depositAmount = grandTotal / 2;
  // If the quote is entirely custom items (nothing has been auto-priced),
  // reword the modal so the customer knows they're requesting a price
  // rather than filing an already-known number.
  // Press-only items carry a real auto-calculated price, so a quote made of
  // them doesn't get the "we'll email you a price" copy.
  const isCustomOnly = !isLockIn && items.length > 0
    && items.every((it) => it.kind === 'custom' && it.custom.service !== 'press-only');

  async function submit() {
    if (!name.trim()) {
      toast.error('Enter your name');
      return;
    }
    if (!email || !/.+@.+\..+/.test(email)) {
      toast.error('Enter a valid email');
      return;
    }
    // Phone is required alongside email so the shop can always reach the
    // customer about a quote. 10 digits = US number; allow 11 with a
    // leading country code, and ignore formatting characters.
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      toast.error('Enter a valid phone number');
      return;
    }
    setSaving(true);
    try {
      const payloadItems = items.map((item) => {
        const designUrls = item.designs.map((d) => d.url);
        if (item.kind === 'custom') {
          return {
            kind: 'custom',
            design_url: designUrls[0] || null,
            extra_design_urls: designUrls.slice(1),
            custom: {
              description: item.custom.description.trim(),
              quantity: Math.max(1, parseInt(item.custom.quantity, 10) || 1),
              notes: item.custom.notes.trim() || null,
              // Server prices 'press-only' at its own PRESS_ONLY_RATE —
              // the flag is a service selector, never a client-set price.
              ...(item.custom.service ? { service: item.custom.service } : {}),
            },
          };
        }
        const numLocations = Object.values(item.inputs.locations).filter(Boolean).length;
        const cp = item.pickedProduct;
        return {
          kind: 'catalog',
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

      // The quick form collects total quantity per size, not a confirmed
      // size breakdown — flag that for the shop so it isn't mistaken for a
      // customer-confirmed size split.
      const sizeNote = items.some((it) => it.kind === 'catalog')
        ? 'Sizes not collected on the quick form — quantities are totals; confirm size breakdown with customer.'
        : '';
      const dateNote = dateNeeded
        ? `Needed by ${dateNeeded}${rushNeeded ? ' — RUSH (surcharge applied to quote)' : ''}.`
        : '';

      const saveRes = await fetch('/api/quote/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name || null,
          customer_email: email,
          customer_phone: phone,
          notes: [dateNote, sizeNote, notes.trim()].filter(Boolean).join('\n') || null,
          items: payloadItems,
        }),
      });
      const saveBody = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveBody.error || 'Save failed');
      trackEvent('quote-submitted', { items: items.length, total: Math.round(grandTotal) });

      if (!isLockIn) {
        toast.success(isCustomOnly
          ? `Quote #${saveBody.id} sent — we'll email you a price shortly.`
          : `Quote #${saveBody.id} saved — check your email.`);
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
      trackEvent('quote-lockin', { total: Math.round(grandTotal) });
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
          {isLockIn
            ? 'Lock in your order'
            : isCustomOnly
              ? 'Send your quote for pricing'
              : 'Save your quote'}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {isLockIn
            ? `${items.length} product${items.length === 1 ? '' : 's'} · we'll save your quote, then take you to Stripe for the 50% deposit ($${depositAmount.toFixed(2)}). Balance due before pickup or shipment.`
            : isCustomOnly
              ? `${items.length} custom item${items.length === 1 ? '' : 's'} · our team will review and email you a price, usually within one business day.`
              : `${items.length} product${items.length === 1 ? '' : 's'} · we'll email you the breakdown so you have it on file.`}
        </p>

        <div className="mt-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">Name *</label>
            <input
              type="text"
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-1">Phone *</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 000-0000"
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
              : isCustomOnly
                ? (saving ? 'Sending...' : 'Send to us')
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

function SelectedProductBanner({ product, noun, onClear }: { product: CatalogProduct; noun: string; onClear: () => void }) {
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
          <p className="text-xs text-gray-700 mt-0.5">Your price: <strong>${yourPrice.toFixed(2)}</strong> per {noun}</p>
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
            type="text"
            enterKeyHint="search"
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
  items, calcs, itemValidity, loading, grandTotal, grandQuantity, turnaroundDays, allValid, calcError,
}: {
  items: ItemDraft[];
  calcs: Array<CalcResponse | null>;
  itemValidity: boolean[];
  loading: boolean;
  grandTotal: number;
  grandQuantity: number;
  turnaroundDays: number;
  allValid: boolean;
  calcError: string | null;
}) {
  const hasAnyInputs = grandQuantity > 0 && itemValidity.some(Boolean);
  const perShirtAvg = grandQuantity > 0 ? grandTotal / grandQuantity : 0;
  // Use the (single) item's noun when there's only one — keeps "per hat"
  // when quoting a hat. Custom items and mixed quotes fall back to "piece".
  const singleNoun = items.length === 1 && items[0] && items[0].kind === 'catalog'
    ? garmentNoun(items[0].inputs.garmentName)
    : 'piece';

  if (!hasAnyInputs) {
    return (
      <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-orange-50 to-orange-50 border-2 border-orange-200 p-3 sm:p-6">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] sm:text-xs uppercase tracking-wider text-orange-700/70">Per {singleNoun}</div>
            <div className="font-display text-xl sm:text-3xl md:text-4xl font-bold text-gray-900">$0.00</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] sm:text-xs uppercase tracking-wider text-orange-700/70">Total</div>
            <div className="font-display text-lg sm:text-2xl md:text-3xl font-bold text-gray-900">$0.00</div>
          </div>
        </div>
        <p className="mt-2 sm:mt-3 text-[11px] sm:text-xs text-gray-500">
          Enter a quantity for live pricing.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl sm:rounded-2xl bg-gradient-to-br from-orange-50 to-orange-50 border-2 border-orange-200 p-3 sm:p-6">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-[10px] sm:text-xs uppercase tracking-wider text-orange-700/70">
            {items.length === 1 ? `Per ${singleNoun}` : `Avg per ${singleNoun} · ${items.length} products`}
          </div>
          <div className="font-display text-xl sm:text-3xl md:text-4xl font-bold text-gray-900">
            ${perShirtAvg.toFixed(2)}
            {loading && <Loader2 className="inline ml-2 h-4 w-4 animate-spin text-orange-400" />}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] sm:text-xs uppercase tracking-wider text-orange-700/70">Grand total</div>
          <div className="font-display text-lg sm:text-2xl md:text-3xl font-bold text-gray-900">
            ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
        <span className="rounded-full bg-white px-2.5 py-0.5 sm:px-3 sm:py-1 text-gray-700 border border-orange-200">
          {turnaroundDays}-day turnaround
        </span>
        <span className="rounded-full bg-white px-2.5 py-0.5 sm:px-3 sm:py-1 text-gray-700 border border-orange-200">
          {grandQuantity} pieces
        </span>
        {/* Read-only method callout — kept out of the always-visible rows
            per spec (jargon lives behind "See details"/"Price breakdown"),
            but a single catalog item has no such collapsible section of
            its own, so it surfaces here instead. */}
        {items.length === 1 && items[0] && items[0].kind === 'catalog' && (
          <span className="rounded-full bg-white px-2.5 py-0.5 sm:px-3 sm:py-1 text-gray-700 border border-orange-200">
            {items[0].inputs.methodName} printing
          </span>
        )}
        {!allValid && (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 sm:px-3 sm:py-1 text-amber-800 border border-amber-200">
            Finish the remaining items to see your full price
          </span>
        )}
      </div>

      {calcError && (
        <p className="mt-3 text-sm text-red-700">
          We couldn't price this automatically ({calcError}). You can still send the quote — we'll price it by hand.
        </p>
      )}

      {/* Per-item breakdown when there's more than one item */}
      {items.length > 1 && (
        <details className="mt-4 group">
          <summary className="flex items-center gap-1 text-sm text-orange-700 hover:text-orange-800 cursor-pointer select-none list-none">
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            See details
          </summary>
          <dl className="mt-3 space-y-1 text-sm">
            {items.map((it, i) => {
              const calc = calcs[i];
              if (it.kind === 'custom') {
                const cq = parseInt(it.custom.quantity, 10) || 0;
                const label = `${i + 1}. ${it.custom.description.trim() || 'Custom item'}`;
                if (it.custom.service === 'press-only') {
                  return (
                    <Row key={it.id} label={label} sub={`${cq} pcs · DTF pressing · $${PRESS_ONLY_RATE.toFixed(2)}/ea`} value={pressTotal(it)} />
                  );
                }
                const sub = `${cq} pcs · custom · priced after review`;
                return (
                  <Row key={it.id} label={label} sub={sub} value={0} pending />
                );
              }
              if (it.kind === 'unset') {
                return (
                  <Row key={it.id} label={`${i + 1}. Not chosen yet`} sub="Pick a product type" value={0} pending />
                );
              }
              const qty = totalQuantity(it.inputs.sizes);
              const label = `${i + 1}. ${it.pickedProduct?.name || it.inputs.garmentName}`;
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

function Row({ label, sub, value, negative, bold, pending }: { label: string; sub?: string; value: number; negative?: boolean; bold?: boolean; pending?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${bold ? 'pt-2 border-t border-orange-200 font-bold text-gray-900' : ''}`}>
      <div>
        <span className={negative ? 'text-green-700' : ''}>{label}</span>
        {sub && <span className="ml-1 text-xs text-gray-500">{sub}</span>}
      </div>
      <span className={`tabular-nums ${negative ? 'text-green-700' : ''}`}>
        {pending ? 'TBD' : `${negative ? '−' : ''}$${Math.abs(value).toFixed(2)}`}
      </span>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-700 ring-1 ring-orange-200">{icon}</span>
        <h2 className="font-display font-bold text-base sm:text-lg text-gray-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

