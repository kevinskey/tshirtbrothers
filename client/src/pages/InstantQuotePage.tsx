import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
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
type CustomItemInputs = {
  description: string;
  quantity: string;
  notes: string;
};

// Which shape of question set the item is currently in. 'unset' shows the
// initial "Catalog or Custom?" picker; 'catalog' shows the full shirt/print
// form; 'custom' shows the simplified describe-it form.
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
    () => calcQueries.reduce((sum, q) => sum + (q.data?.total || 0), 0),
    [calcQueries],
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

  const anyCalcLoading = calcQueries.some((q) => q.isFetching);
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
    return !itemValidity[i] || q.data != null;
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

  function addItem() {
    const next = newItem();
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
      {/* Hero — compact at every breakpoint; desktop used to be huge. */}
      <section className="bg-gray-900 text-white py-5 sm:py-6 md:py-8 text-center">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-xl sm:text-2xl md:text-3xl font-bold">Instant Quote</h1>
          <p className="mt-1 text-gray-400 max-w-xl mx-auto text-xs sm:text-sm">
            Add multiple products — price updates live.
          </p>
        </div>
      </section>

      <main className="container mx-auto px-4 py-4 sm:py-8 max-w-3xl">
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
          />
        </div>

        {/* CTAs */}
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
            disabled={!canLockIn}
            className="w-full rounded-xl bg-orange-600 px-6 py-4 text-base font-bold text-white hover:bg-orange-700 disabled:opacity-50 transition"
            title={!canLockIn && canSave ? 'Deposit unavailable until we price your custom item' : undefined}
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
  onPatchCustom, onSetKind, onRemove,
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
  onRemove: (() => void) | null;
}) {
  const inputs = item.inputs;
  const isScreenPrint = inputs.methodName === 'Screen Print';
  const liveTotalQty = totalQuantity(inputs.sizes);
  const numLocations = Object.values(inputs.locations).filter(Boolean).length;

  // User-facing noun ('hat' / 'shirt' / 'hoodie' …) derived from the
  // garment type, used to localize "per shirt" / "Shirt color" etc.
  const noun = garmentNoun(inputs.garmentName);
  // When a catalog product is picked, restrict the size grid and color
  // chips to what that product actually comes in. Otherwise fall through
  // to the default shirt grid / palette.
  const sizeList = useMemo(() => availableSizesFor(item.pickedProduct, inputs.garmentName), [item.pickedProduct, inputs.garmentName]);
  const colorList = useMemo(() => availableColorsFor(item.pickedProduct), [item.pickedProduct]);
  const isOneSize = sizeList.length === 1;

  // When the size grid changes (product pick, garment change), prune
  // inputs.sizes to only the supported sizes — keeps the displayed total
  // honest if a stray size entry survived a reshape.
  const visibleSizeRows = useMemo(() => {
    return sizeList.map((sz) => {
      const row = inputs.sizes.find((r) => r.size === sz);
      return { size: sz, quantity: row?.quantity || 0 };
    });
  }, [sizeList, inputs.sizes]);

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

  // Collapsed summary — shown for prior products once a newer one is being
  // edited, so the form is short and scannable while only the active card
  // is in full edit mode.
  if (!expanded) {
    const img = item.pickedProduct?.image_url || item.pickedProduct?.imageUrl;
    let productLabel: string;
    let detail: string;
    if (item.kind === 'unset') {
      productLabel = 'Choose product type';
      detail = 'Tap Edit to pick catalog or custom';
    } else if (item.kind === 'custom') {
      const cq = parseInt(item.custom.quantity, 10) || 0;
      productLabel = item.custom.description.trim() || 'Custom item';
      detail = `${cq} pcs · custom · priced after review`;
    } else {
      productLabel = item.pickedProduct
        ? item.pickedProduct.name
        : `${inputs.qualityTier} ${inputs.garmentName}`;
      const locs: string[] = [];
      if (inputs.locations.front) locs.push('Front');
      if (inputs.locations.back) locs.push('Back');
      if (inputs.locations.sleeve) locs.push('Sleeve');
      detail = `${liveTotalQty} pcs · ${inputs.color} · ${inputs.methodName}${locs.length ? ' · ' + locs.join(' + ') : ''}`;
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

      {/* Initial screen — customer chooses whether this line item is a
          catalog product or a custom item they'll describe. Skipped when
          the URL, catalog picker, or Design Studio has already committed
          the item to catalog. */}
      {item.kind === 'unset' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => { onSetKind('catalog'); onOpenPicker(); }}
            className="group flex flex-col items-start gap-2 rounded-2xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-orange-500 hover:bg-orange-50/40"
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700 group-hover:bg-orange-200">
              <Shirt className="h-5 w-5" />
            </div>
            <div className="font-semibold text-gray-900">From our catalog</div>
            <div className="text-xs text-gray-500">T-shirts, hoodies, hats, polos — pick garment, sizes, colors for an instant price.</div>
          </button>
          <button
            type="button"
            onClick={() => onSetKind('custom')}
            className="group flex flex-col items-start gap-2 rounded-2xl border-2 border-gray-200 bg-white p-5 text-left transition hover:border-orange-500 hover:bg-orange-50/40"
          >
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700 group-hover:bg-orange-200">
              <PenSquare className="h-5 w-5" />
            </div>
            <div className="font-semibold text-gray-900">Custom item</div>
            <div className="text-xs text-gray-500">Something not in our catalog — describe it and we'll quote it after review.</div>
          </button>
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
            Custom items are priced after our team reviews your request. Save the quote and we'll email you a price.
          </div>
        </div>
      )}

      {/* Mockup from Design Studio — large preview so the customer's design
          stays visible alongside the live price. When the design has both
          front and back, render them side-by-side. */}
      {item.kind === 'catalog' && (<>
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

        {/* Garment — first thing the customer picks (unless a specific
            catalog product is already chosen, in which case the product
            determines the garment type). */}
        {!item.pickedProduct && (
          <Section icon={<Shirt className="h-5 w-5" />} title="What kind of garment?">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {garmentNames.map((name) => (
                <Chip key={name} active={inputs.garmentName === name} onClick={() => onPatchInputs({ garmentName: name })}>
                  {name}
                </Chip>
              ))}
            </div>
          </Section>
        )}

        {/* Quality tier — paired with garment, hidden when a specific
            product is picked. */}
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
                      inputs.qualityTier === q ? 'border-orange-600 bg-orange-600 text-white shadow-sm' : 'border-gray-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50/40'
                    }`}
                  >
                    <div>{q}</div>
                    {brandHint && (
                      <div className={`text-[10px] mt-0.5 ${inputs.qualityTier === q ? 'text-orange-100' : 'text-gray-500'}`}>
                        {brandHint}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Quantity — one-size garments (hats) get a single input; others
            get the per-size grid restricted to the product's actual sizes. */}
        <Section
          icon={<span className="text-xl">#</span>}
          title={isOneSize ? `How many ${noun}s?` : `How many ${noun}s? (per size)`}
        >
          {isOneSize ? (
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={visibleSizeRows[0]?.quantity || ''}
              onChange={(e) => {
                const qty = Math.max(0, parseInt(e.target.value) || 0);
                onPatchInputs({ sizes: [{ size: sizeList[0] || 'One Size', quantity: qty }] });
              }}
              placeholder="0"
              className="w-32 text-center rounded-lg border border-gray-300 px-2 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500"
              style={{ fontSize: '16px' }}
            />
          ) : (
            <div className={`grid gap-2 ${visibleSizeRows.length <= 4 ? 'grid-cols-4' : 'grid-cols-4 sm:grid-cols-8'}`}>
              {visibleSizeRows.map((row) => {
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
                        const qty = Math.max(0, parseInt(e.target.value) || 0);
                        const next = visibleSizeRows.map((r) =>
                          r.size === row.size ? { ...r, quantity: qty } : r,
                        );
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
          )}
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
                  <span className={`ml-1 italic text-xs ${inputs.methodName === m.name ? 'text-orange-100' : 'text-gray-500'}`}>(most popular)</span>
                )}
              </Chip>
            ))}
          </div>
        </Section>

        {/* Print locations — hidden when a Studio mockup is attached;
            the handoff already derived front/back from which sides of
            the mockup were captured. */}
        {!(item.mockupUrl || item.mockupUrlBack) && (
        <Section icon={<Palette className="h-5 w-5" />} title="Where do you want it printed?">
          <div className="grid grid-cols-3 gap-2">
            {(['front', 'back', 'sleeve'] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => onPatchInputs({ locations: { ...inputs.locations, [loc]: !inputs.locations[loc] } })}
                className={`rounded-xl border-2 px-3 py-3 text-sm font-medium capitalize transition ${
                  inputs.locations[loc] ? 'border-orange-600 bg-orange-600 text-white shadow-sm' : 'border-gray-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50/40'
                }`}
              >
                {inputs.locations[loc] && <Check className="inline h-3.5 w-3.5 mr-1" />}
                {loc}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">Front + Back = 2 locations. Pick any combination.</p>
        </Section>
        )}

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
                    inputs.colorsPerLocation === n ? 'border-orange-600 bg-orange-600 text-white shadow-sm' : 'border-gray-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50/40'
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
                !inputs.rush ? 'border-orange-600 bg-orange-600 text-white shadow-sm' : 'border-gray-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50/40'
              }`}
            >
              <div>Standard</div>
              <div className={`text-[10px] mt-0.5 ${!inputs.rush ? 'text-orange-100' : 'text-gray-500'}`}>{options?.settings.standard_turnaround ?? 10} days</div>
            </button>
            <button
              type="button"
              onClick={() => onPatchInputs({ rush: true })}
              className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
                inputs.rush ? 'border-orange-600 bg-orange-600 text-white shadow-sm' : 'border-gray-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50/40'
              }`}
            >
              <div>Rush</div>
              <div className={`text-[10px] mt-0.5 ${inputs.rush ? 'text-orange-100' : 'text-gray-500'}`}>
                1–{options?.settings.rush_turnaround ?? 2} day{(options?.settings.rush_turnaround ?? 2) === 1 ? '' : 's'} · +{Math.round((options?.settings.rush_surcharge_pct ?? 1) * 100)}%
              </div>
            </button>
          </div>
        </Section>
      </div>
      </>)}
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
    if (!name.trim()) {
      toast.error('Enter your name');
      return;
    }
    if (!email || !/.+@.+\..+/.test(email)) {
      toast.error('Enter a valid email');
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
          Enter quantities + a print location for live pricing.
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
        {!allValid && (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 sm:px-3 sm:py-1 text-amber-800 border border-amber-200">
            Add qty + location to remaining
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
              if (it.kind === 'custom') {
                const cq = parseInt(it.custom.quantity, 10) || 0;
                const label = `${i + 1}. ${it.custom.description.trim() || 'Custom item'}`;
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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border-2 px-3 py-3 text-sm font-medium transition ${
        active
          ? 'border-orange-600 bg-orange-600 text-white shadow-sm'
          : 'border-gray-300 text-gray-700 hover:border-orange-400 hover:bg-orange-50/40'
      }`}
    >
      {children}
    </button>
  );
}
