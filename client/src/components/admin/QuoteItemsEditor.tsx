import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Copy, Loader2, Search, Calculator, LayoutGrid, X } from 'lucide-react';
import type { Product, Quote, QuoteItem } from '@/lib/api';
import { fetchAdminProducts, replaceQuoteItems, calculateInstantPrice } from '@/lib/api';

// Pull the original instant-quote inputs off a quote so the admin recalc
// button can re-run the same pricing formula the customer saw. Defensive:
// older quotes (or admin-created ones) won't have inputs_json; we fall back
// to sensible defaults (DTF on a Standard T-shirt, 1 color).
type RecalcDefaults = {
  garmentName: string;
  qualityTier: string;
  methodName: string;
  colorsPerLocation: number;
  rush: boolean;
};
function readRecalcDefaults(q: Quote): RecalcDefaults {
  const fallback: RecalcDefaults = {
    garmentName: 'T-shirt',
    qualityTier: 'Standard',
    methodName: 'DTF',
    colorsPerLocation: 1,
    rush: false,
  };
  const ij = q.inputs_json as
    | { items?: Array<{ inputs?: Partial<RecalcDefaults> }> }
    | null
    | undefined;
  const first = ij?.items?.[0]?.inputs;
  if (!first) return fallback;
  return {
    garmentName: typeof first.garmentName === 'string' ? first.garmentName : fallback.garmentName,
    qualityTier: typeof first.qualityTier === 'string' ? first.qualityTier : fallback.qualityTier,
    methodName: typeof first.methodName === 'string' ? first.methodName : fallback.methodName,
    colorsPerLocation: Number.isFinite(Number(first.colorsPerLocation))
      ? Number(first.colorsPerLocation) : fallback.colorsPerLocation,
    rush: typeof first.rush === 'boolean' ? first.rush : fallback.rush,
  };
}

// Internal draft row — sizes/print_areas always arrays in UI state so the
// JSX never has to handle `unknown`.
type DraftItem = {
  id?: number;
  product_id: number | null;
  product_name: string;
  color: string;
  sizes: Array<{ size: string; quantity: number }>;
  print_areas: string[];
  unit_price: string;     // kept as strings while editing so inputs stay snappy
  line_total: string;
  notes: string;
  // Quantity for lines with NO per-size counts (digitizing/setup fees,
  // rush charges, flat services). Ignored whenever any size has a count.
  flat_quantity: string;
};

const COMMON_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];

function quoteItemToDraft(it: QuoteItem): DraftItem {
  const sizes = Array.isArray(it.sizes)
    ? (it.sizes as Array<{ size: string; quantity: number }>)
        .filter((s) => s && typeof s === 'object')
        .map((s) => ({ size: String(s.size ?? ''), quantity: Number(s.quantity) || 0 }))
    : [];
  const print_areas = Array.isArray(it.print_areas)
    ? (it.print_areas as unknown[]).map(String)
    : [];
  return {
    id: it.id,
    product_id: it.product_id ?? null,
    product_name: it.product_name ?? '',
    color: it.color ?? '',
    sizes,
    print_areas,
    unit_price: it.unit_price != null ? String(it.unit_price) : '',
    line_total: it.line_total != null ? String(it.line_total) : '',
    notes: it.notes ?? '',
    flat_quantity:
      sizes.reduce((n, s2) => n + (Number(s2.quantity) || 0), 0) === 0 && Number(it.quantity) > 0
        ? String(it.quantity)
        : '',
  };
}

function draftQuantity(d: DraftItem): number {
  const fromSizes = d.sizes.reduce((n, s) => n + (Number(s.quantity) || 0), 0);
  if (fromSizes > 0) return fromSizes;
  return Math.max(0, Math.round(Number(d.flat_quantity) || 0));
}

function draftLineTotal(d: DraftItem): number {
  const explicit = parseFloat(d.line_total);
  if (Number.isFinite(explicit)) return explicit;
  const u = parseFloat(d.unit_price);
  const q = draftQuantity(d);
  if (Number.isFinite(u) && q > 0) return Math.round(u * q * 100) / 100;
  return 0;
}

export default function QuoteItemsEditor({
  quote,
  onSaved,
}: {
  quote: Quote;
  onSaved: (updated: Quote) => void;
}) {
  // A backfilled row from a no-product quote (customer uploaded a graphic
  // and went through instant-quote without picking a real product) is just
  // clutter. But this filter feeds Save, which REPLACES the stored items —
  // so anything carrying real information (a name, a price, notes, a flat
  // quantity) must survive, or saving silently deletes it. That's how the
  // "Ultra Hat" line on quote #177 and quote #190's item vanished: custom
  // items have no product link and no per-size counts, got filtered on
  // mount, and the next Save wiped them. Only rows with NOTHING on them
  // count as empty now.
  const isEmptyItem = (d: DraftItem) =>
    !d.product_id && d.sizes.length === 0 &&
    !d.product_name.trim() && !d.notes.trim() &&
    !(parseFloat(d.unit_price) > 0) && !(parseFloat(d.line_total) > 0) &&
    !(parseFloat(d.flat_quantity) > 0);

  const [drafts, setDrafts] = useState<DraftItem[]>(() =>
    (quote.items || []).map(quoteItemToDraft).filter((d) => !isEmptyItem(d)));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recalcingIdx, setRecalcingIdx] = useState<number | null>(null);
  const draftsRef = useRef<DraftItem[]>([]);
  useEffect(() => { draftsRef.current = drafts; });
  const autoPriceTimer = useRef<ReturnType<typeof setTimeout>>();

  // Catalog info for each linked product: real colorway names (exact S&S
  // spellings — that's what lets the blanks builder auto-match later), the
  // style's real size run, and price hints. Many synced catalog rows are
  // thin (empty colors/sizes, base_price 0) — for those, fall back to the
  // live-cost endpoint, which pulls colors/sizes/costs straight from S&S.
  type ProductMeta = {
    colors: string[]; sizes: string[];
    retail: number | null; custom: number | null; costMin: number | null;
  };
  const [productMeta, setProductMeta] = useState<Record<number, ProductMeta>>({});
  useEffect(() => {
    const ids = [...new Set(drafts.map((d) => d.product_id).filter((x): x is number => !!x))];
    for (const id of ids) {
      if (productMeta[id] !== undefined) continue;
      setProductMeta((prev) => ({ ...prev, [id]: { colors: [], sizes: [], retail: null, custom: null, costMin: null } }));
      (async () => {
        try {
          const r = await fetch(`/api/products/${id}`);
          if (!r.ok) return;
          const prod = await r.json();
          let colors = Array.isArray(prod?.colors)
            ? (prod.colors as Array<{ name?: string }>).map((c) => c?.name).filter((n): n is string => !!n)
            : [];
          let sizes = Array.isArray(prod?.sizes) ? (prod.sizes as unknown[]).map(String).filter(Boolean) : [];
          let costMin: number | null = null;
          if (colors.length === 0 && (prod?.ss_id || prod?.style_number || prod?.name)) {
            // Resolve by catalog id when we have one — style numbers are not
            // unique across brands and the text search picked the wrong style.
            const query = prod?.ss_id
              ? `product_id=${id}`
              : `styleQ=${encodeURIComponent(prod.style_number || prod.name)}`;
            const lr = await fetch(
              `/api/quotes/admin/live-cost?${query}`,
              { headers: { Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` } },
            );
            if (lr.ok) {
              const live = await lr.json();
              if (Array.isArray(live?.colors)) colors = live.colors.filter(Boolean);
              const liveSizes = live?.sizes && typeof live.sizes === 'object' ? live.sizes as Record<string, { cost?: number }> : {};
              if (sizes.length === 0) sizes = Object.keys(liveSizes);
              const costs = Object.values(liveSizes).map((s) => Number(s?.cost)).filter(Number.isFinite);
              if (costs.length) costMin = Math.min(...costs);
            }
          }
          const retail = Number(prod?.retail_price);
          const custom = Number(prod?.custom_price);
          setProductMeta((prev) => ({ ...prev, [id]: {
            colors, sizes,
            retail: Number.isFinite(retail) && retail > 0 ? retail : null,
            custom: Number.isFinite(custom) && custom > 0 ? custom : null,
            costMin,
          } }));
        } catch { /* best effort */ }
      })();
    }
  }, [drafts, productMeta]);

  // Seed an empty unit price from the catalog once meta arrives — the
  // admin's custom price if one is set, retail otherwise. Never overwrites
  // a typed value, and the field stays fully editable.
  useEffect(() => {
    setDrafts((prev) => prev.map((d) => {
      if (!d.product_id || d.unit_price.trim() !== '') return d;
      const m = productMeta[d.product_id];
      const seed = m ? (m.custom ?? m.retail) : null;
      return seed ? { ...d, unit_price: seed.toFixed(2) } : d;
    }));
  }, [productMeta]);

  // Auto-price: once a line has size quantities and the admin hasn't typed
  // a unit price, run the same calculation the Recalculate button does.
  // Typed prices are never overwritten.
  function scheduleAutoPrice(i: number) {
    if (autoPriceTimer.current) clearTimeout(autoPriceTimer.current);
    autoPriceTimer.current = setTimeout(() => {
      const d = draftsRef.current[i];
      if (d && !d.unit_price.trim() && draftQuantity(d) > 0) void recalcLine(i);
    }, 800);
  }
  const recalcDefaults = useMemo(() => readRecalcDefaults(quote), [quote]);
  const [rushOverride, setRushOverride] = useState<boolean>(recalcDefaults.rush);

  // Reset when a different quote is opened.
  useEffect(() => {
    setDrafts((quote.items || []).map(quoteItemToDraft).filter((d) => !isEmptyItem(d)));
    setErr(null);
    setRushOverride(recalcDefaults.rush);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id, quote.items]);

  const total = useMemo(
    () => drafts.reduce((n, d) => n + draftLineTotal(d), 0),
    [drafts],
  );

  function updateDraft(i: number, patch: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  }

  function addBlank() {
    setDrafts((prev) => [...prev, {
      product_id: null, product_name: '', color: '',
      sizes: [], print_areas: [], unit_price: '', line_total: '', notes: '',
      flat_quantity: '',
    }]);
  }

  // Copy a line right below itself — same product, sizes, print areas and
  // price — so a second colorway (or a near-identical style) is one edit
  // away. The copy drops `id` so it saves as a new row, and deep-copies the
  // arrays so editing one line never mutates the other.
  function duplicateDraft(i: number) {
    setDrafts((prev) => {
      const src = prev[i];
      if (!src) return prev;
      const copy: DraftItem = {
        ...src,
        id: undefined,
        sizes: src.sizes.map((s) => ({ ...s })),
        print_areas: [...src.print_areas],
      };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  }

  function removeDraft(i: number) {
    setDrafts((prev) => prev.filter((_, idx) => idx !== i));
  }

  function setSizeQty(i: number, size: string, qty: number) {
    setDrafts((prev) => prev.map((d, idx) => {
      if (idx !== i) return d;
      const existing = d.sizes.find((s) => s.size === size);
      const next = qty > 0
        ? (existing
            ? d.sizes.map((s) => (s.size === size ? { size, quantity: qty } : s))
            : [...d.sizes, { size, quantity: qty }])
        : d.sizes.filter((s) => s.size !== size);
      return { ...d, sizes: next };
    }));
    scheduleAutoPrice(i);
  }

  async function recalcLine(i: number) {
    const d = draftsRef.current[i] ?? drafts[i];
    if (!d) return;
    const sizes = d.sizes.filter((s) => s.quantity > 0);
    if (sizes.length === 0) {
      setErr('Add sizes before recalculating');
      return;
    }
    const numLocations = Math.max(1, d.print_areas.length);
    setRecalcingIdx(i);
    setErr(null);
    try {
      const r = await calculateInstantPrice({
        sizes,
        garmentName: recalcDefaults.garmentName,
        qualityTier: recalcDefaults.qualityTier,
        methodName: recalcDefaults.methodName,
        colorsPerLocation: recalcDefaults.colorsPerLocation,
        rush: rushOverride,
        numLocations,
      });
      updateDraft(i, {
        unit_price: String(r.per_shirt),
        line_total: String(r.total),
      });
    } catch (e) {
      setErr((e as Error).message || 'Recalculate failed');
    } finally {
      setRecalcingIdx(null);
    }
  }

  function togglePrintArea(i: number, area: string) {
    setDrafts((prev) => prev.map((d, idx) => {
      if (idx !== i) return d;
      const has = d.print_areas.includes(area);
      return { ...d, print_areas: has
        ? d.print_areas.filter((a) => a !== area)
        : [...d.print_areas, area] };
    }));
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const payload: QuoteItem[] = drafts.map((d) => ({
        product_id:   d.product_id,
        product_name: d.product_name.trim() || null,
        color:        d.color.trim() || null,
        sizes:        d.sizes,
        quantity:     draftQuantity(d),
        print_areas:  d.print_areas,
        unit_price:   d.unit_price === '' ? null : Number(d.unit_price),
        line_total:   d.line_total === '' ? null : Number(d.line_total),
        notes:        d.notes.trim() || null,
      }));
      const updated = await replaceQuoteItems(String(quote.id), payload);
      onSaved(updated);
    } catch (e) {
      setErr((e as Error).message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase">Line items</p>
        <span className="text-sm font-bold text-gray-900">Total: ${total.toFixed(2)}</span>
      </div>

      <label className="flex items-center gap-2 mb-3 px-3 py-2 bg-orange-50 border border-orange-200 rounded-lg cursor-pointer">
        <input
          type="checkbox"
          checked={rushOverride}
          onChange={(e) => setRushOverride(e.target.checked)}
          className="w-4 h-4 rounded border-orange-300 text-orange-600 focus:ring-orange-400"
        />
        <span className="text-sm text-gray-800">
          <span className="font-semibold text-orange-700">Rush job</span>
          <span className="text-gray-600"> — applied on every Recalculate (1–2 day turnaround, +100%)</span>
        </span>
      </label>

      {drafts.length === 0 && (
        <p className="text-sm text-gray-500 italic mb-3">
          No product on this quote yet — the customer didn't pick one. Add the product you'll be quoting them.
        </p>
      )}

      <ul className="space-y-3">
        {drafts.map((d, i) => (
          <li key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Product</label>
                <ProductPicker
                  productId={d.product_id}
                  productName={d.product_name}
                  onPick={(p, color) => updateDraft(i, {
                    product_id: Number(p.id),
                    product_name: p.name,
                    // Only overwrite the line's color when the browser
                    // actually produced one — the typeahead passes '' and
                    // must not wipe a color already typed on the line.
                    ...(color ? { color } : {}),
                  })}
                  onName={(name) => updateDraft(i, { product_name: name })}
                />
              </div>
              <button
                onClick={() => duplicateDraft(i)}
                title="Duplicate item"
                className="p-1.5 text-gray-400 hover:text-blue-600 mt-4"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={() => removeDraft(i)}
                title="Remove item"
                className="p-1.5 text-gray-400 hover:text-red-600 mt-4"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Color</label>
                <input
                  type="text"
                  value={d.color}
                  onChange={(e) => updateDraft(i, { color: e.target.value })}
                  list={d.product_id ? `qie-colors-${d.product_id}` : undefined}
                  placeholder={d.product_id && (productMeta[d.product_id]?.colors.length ?? 0) > 0 ? 'Pick or type a color…' : undefined}
                  className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
                  style={{ fontSize: '16px' }}
                />
                {d.product_id && (productMeta[d.product_id]?.colors.length ?? 0) > 0 && (
                  <datalist id={`qie-colors-${d.product_id}`}>
                    {productMeta[d.product_id]!.colors.map((c) => <option key={c} value={c} />)}
                  </datalist>
                )}
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Unit price</label>
                <input
                  type="number"
                  step="0.01"
                  value={d.unit_price}
                  onChange={(e) => updateDraft(i, { unit_price: e.target.value, line_total: '' })}
                  placeholder="0.00"
                  className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
                  style={{ fontSize: '16px' }}
                />
                {d.product_id && productMeta[d.product_id] && (productMeta[d.product_id]!.costMin !== null || productMeta[d.product_id]!.retail !== null) && (
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {productMeta[d.product_id]!.costMin !== null && <>S&amp;S blank from ${productMeta[d.product_id]!.costMin!.toFixed(2)}</>}
                    {productMeta[d.product_id]!.costMin !== null && productMeta[d.product_id]!.retail !== null && ' · '}
                    {productMeta[d.product_id]!.retail !== null && <>retail ${productMeta[d.product_id]!.retail!.toFixed(2)}</>}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Sizes</label>
              <div className="grid grid-cols-4 gap-1.5">
                {/* The style's real size run when we know it (One Size, tall
                    vests, ...), the common garment run otherwise — plus any
                    size already on the line so typed counts never vanish. */}
                {[...new Set([
                  ...((d.product_id && productMeta[d.product_id]?.sizes.length ? productMeta[d.product_id]!.sizes : COMMON_SIZES)),
                  ...d.sizes.map((s) => s.size),
                ])].map((size) => {
                  const cur = d.sizes.find((s) => s.size === size)?.quantity ?? 0;
                  return (
                    <div key={size} className="flex items-center gap-1 bg-white rounded border border-gray-200 px-1.5 py-1">
                      <span className="text-[11px] font-semibold text-gray-600 shrink-0 min-w-7 max-w-16 truncate" title={size}>{size}</span>
                      <input
                        type="number"
                        min={0}
                        value={cur || ''}
                        onChange={(e) => setSizeQty(i, size, Number(e.target.value) || 0)}
                        className="w-full text-sm border-0 bg-transparent focus:outline-none"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  );
                })}
              </div>
              {d.sizes.reduce((n, s2) => n + (Number(s2.quantity) || 0), 0) === 0 && (
                <label className="flex items-center gap-2 mt-2 text-[11px] text-gray-600">
                  Qty (no sizes — fees &amp; flat items):
                  <input
                    type="number"
                    min={0}
                    value={d.flat_quantity}
                    onChange={(e) => updateDraft(i, { flat_quantity: e.target.value })}
                    className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-sm"
                    style={{ fontSize: '16px' }}
                  />
                </label>
              )}
              <p className="text-[11px] text-gray-500 mt-1">
                Qty: <span className="font-semibold text-gray-700">{draftQuantity(d)}</span>
                {d.unit_price && (
                  <> · Line total: <span className="font-semibold text-gray-900">${draftLineTotal(d).toFixed(2)}</span></>
                )}
              </p>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Print areas</label>
              <div className="flex flex-wrap gap-1.5">
                {/* Standard toggles first, then any stored values that
                    aren't in the standard list (customer-submitted strings
                    like "Front — 11in, 4-color") as active chips — without
                    this the data is on the quote but invisible here. */}
                {['Front', 'Back', 'Left Sleeve', 'Right Sleeve', 'Pocket', 'Hood'].map((a) => {
                  const on = d.print_areas.includes(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => togglePrintArea(i, a)}
                      className={`text-xs px-2 py-1 rounded-full border ${
                        on ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-600 border-gray-200'
                      }`}
                    >{a}</button>
                  );
                })}
                {d.print_areas
                  .filter((a) => !['Front', 'Back', 'Left Sleeve', 'Right Sleeve', 'Pocket', 'Hood'].includes(a))
                  .map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => togglePrintArea(i, a)}
                      title="Custom print area from the request — click to remove"
                      className="text-xs px-2 py-1 rounded-full border bg-red-600 text-white border-red-600"
                    >{a} ×</button>
                  ))}
              </div>
              <button
                type="button"
                onClick={() => recalcLine(i)}
                disabled={recalcingIdx === i || draftQuantity(d) === 0}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg"
              >
                {recalcingIdx === i ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating…</>
                ) : (
                  <><Calculator className="w-3.5 h-3.5" /> Recalculate with print formula ({recalcDefaults.methodName} · {recalcDefaults.qualityTier} · {Math.max(1, d.print_areas.length)} location{d.print_areas.length === 1 ? '' : 's'}{rushOverride ? ' · Rush' : ''})</>
                )}
              </button>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Override line total (optional)</label>
              <input
                type="number"
                step="0.01"
                value={d.line_total}
                onChange={(e) => updateDraft(i, { line_total: e.target.value })}
                placeholder={d.unit_price ? `${draftLineTotal(d).toFixed(2)} (auto)` : '0.00'}
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
                style={{ fontSize: '16px' }}
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Notes</label>
              <input
                type="text"
                value={d.notes}
                onChange={(e) => updateDraft(i, { notes: e.target.value })}
                placeholder="Anything specific about this line"
                className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
                style={{ fontSize: '16px' }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2 mt-3">
        <button
          onClick={addBlank}
          className="flex items-center gap-1 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-lg"
        >
          <Plus className="w-4 h-4" /> Add product
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300 px-4 py-2 rounded-lg"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Save items'}
        </button>
      </div>

      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </div>
  );
}

// Full-screen catalog browser for the PRODUCT field.
//
// The typeahead below shows a 32px thumbnail, which is not enough to tell a
// Heavy Cotton from a Softstyle or a youth cut from an adult one — picking a
// blank is a visual decision, so this shows the garment at a size you can
// actually judge (Kevin, 2026-11-02).
type CatalogProduct = Product & {
  style_number?: string;
  base_price?: number | string;
  retail_price?: number | string;
  sizes?: string[];
  ss_id?: string | number;
};

// A colorway as the catalog stores it. Thin synced rows have no colors at
// all; for those the live-cost endpoint answers with bare names, so hex and
// swatch are both optional and the chip falls back to a plain label.
type Colorway = { name: string; hex?: string; swatch?: string; image?: string };

function money(v: unknown): string | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? `$${n.toFixed(2)}` : null;
}

// Colors + sizes for one product, richest source first.
//
//  1. the catalog row — already carries name/hex/swatch/image when the sync
//     populated it, which for many styles it did not;
//  2. GET /products/detail/:id — the live S&S dossier, cached 10 min server
//     side, whose colorways include the per-color FRONT PHOTO. This is what
//     lets the preview actually change color;
//  3. live-cost — bare colorway names, the last resort. No photo, no hex.
//
// Step 2 is why the thin rows are no longer stuck with grey dots: live-cost
// only ever returned names (Kevin, 2026-11-02 — "I need to see the product
// changing colors").
async function loadColorways(p: CatalogProduct): Promise<{ colors: Colorway[]; sizes: string[] }> {
  let colors: Colorway[] = [];
  let sizes: string[] = [];
  const auth = { Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` };
  const clean = (list: unknown): Colorway[] =>
    (Array.isArray(list) ? list : [])
      .map((c) => (typeof c === 'string' ? { name: c } : (c as Colorway)))
      .filter((c): c is Colorway => Boolean(c && c.name))
      .map((c) => ({
        name: c.name,
        hex: c.hex || undefined,
        swatch: c.swatch || undefined,
        image: c.image || undefined,
      }));

  try {
    const r = await fetch(`/api/products/${p.id}`);
    const prod = r.ok ? await r.json() : null;
    if (prod) {
      colors = clean(prod.colors);
      if (Array.isArray(prod.sizes)) sizes = prod.sizes.map(String).filter(Boolean);
    }

    // Prefer live S&S whenever the catalog row gave us no photo to swap to.
    if (!colors.some((c) => c.image)) {
      const dr = await fetch(`/api/products/detail/${p.id}`, { headers: auth });
      if (dr.ok) {
        const detail = await dr.json();
        const live = clean(detail?.live?.colors);
        if (live.length > 0) colors = live;
        const skus = Array.isArray(detail?.live?.skus) ? detail.live.skus : [];
        if (sizes.length === 0 && skus.length > 0) {
          sizes = [...new Set(skus.map((s: { sizeName?: string }) => s?.sizeName).filter(Boolean))] as string[];
        }
      }
    }

    if (colors.length === 0 && prod && (prod.ss_id || prod.style_number || prod.name)) {
      const query = prod.ss_id
        ? `product_id=${p.id}`
        : `styleQ=${encodeURIComponent(prod.style_number || prod.name)}`;
      const lr = await fetch(`/api/quotes/admin/live-cost?${query}`, { headers: auth });
      if (lr.ok) {
        const live = await lr.json();
        colors = clean(live?.colors);
        if (sizes.length === 0 && live?.sizes && typeof live.sizes === 'object') {
          sizes = Object.keys(live.sizes as Record<string, unknown>);
        }
      }
    }
  } catch { /* best effort — the picker still works without colors */ }
  return { colors, sizes };
}

function ProductBrowser({ initialQuery, onPick, onClose }: {
  initialQuery: string;
  onPick: (p: Product, color: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Second step: a chosen product, its colorways, and the pick. Clicking a
  // card used to close the modal immediately, which left the line with no
  // color and sent you back to the dropdown (Kevin, 2026-11-02).
  const [detail, setDetail] = useState<CatalogProduct | null>(null);
  const [colors, setColors] = useState<Colorway[]>([]);
  const [detailSizes, setDetailSizes] = useState<string[]>([]);
  const [colorsLoading, setColorsLoading] = useState(false);
  const [chosenColor, setChosenColor] = useState('');

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    setColorsLoading(true);
    setColors([]); setDetailSizes([]); setChosenColor('');
    loadColorways(detail).then(({ colors: c, sizes: s }) => {
      if (cancelled) return;
      setColors(c);
      setDetailSizes(s);
      setColorsLoading(false);
    });
    return () => { cancelled = true; };
  }, [detail]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Esc backs out of the colour step first, then closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (detail) setDetail(null); else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, detail]);

  // Page 1 refetches on every (debounced) search; later pages append, so
  // "Load more" keeps what is already on screen.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const data = await fetchAdminProducts(query.trim() || undefined, page);
        if (cancelled) return;
        const incoming = data.products as CatalogProduct[];
        setItems((prev) => (page === 1 ? incoming : [...prev, ...incoming]));
        setTotalPages(data.totalPages || 1);
        setTotal(data.total || incoming.length);
      } catch {
        if (!cancelled) { setItems((prev) => (page === 1 ? [] : prev)); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, page === 1 ? 220 : 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [query, page]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 sm:p-8">
      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-full flex flex-col overflow-hidden">
        <div className="border-b border-gray-200 px-5 py-3 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search the catalog — style number, brand, or name…"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              style={{ fontSize: '16px' }}
            />
          </div>
          <span className="text-xs text-gray-400 hidden sm:block whitespace-nowrap">
            {total ? `${total.toLocaleString()} products` : ''}
          </span>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {detail ? (
          <div className="flex-1 overflow-auto p-5">
            <button
              type="button"
              onClick={() => setDetail(null)}
              className="text-sm text-gray-500 hover:text-gray-800 mb-4"
            >
              ← Back to results
            </button>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="aspect-square bg-gray-50 rounded-xl flex items-center justify-center overflow-hidden">
                {/* Swap to the colorway's own photo once one is chosen. */}
                {(() => {
                  const chosen = colors.find((c) => c.name === chosenColor);
                  const src = chosen?.image || detail.image_url;
                  return src
                    ? <img src={src} alt={detail.name} className="w-full h-full object-contain" />
                    : <span className="text-xs text-gray-300">No photo</span>;
                })()}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-500">{detail.brand}</p>
                <h3 className="text-lg font-semibold text-gray-900">{detail.name}</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {detail.style_number ? `Style ${detail.style_number}` : `Catalog #${detail.id}`}
                  {money(detail.base_price) && ` · blank from ${money(detail.base_price)}`}
                  {money(detail.retail_price) && ` · retail ${money(detail.retail_price)}`}
                </p>
                {detailSizes.length > 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Sizes: {detailSizes.join(', ')}
                  </p>
                )}

                <div className="mt-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Color {colors.length > 0 && `(${colors.length})`}
                    </p>
                    {chosenColor && <p className="text-sm text-gray-900 font-medium">{chosenColor}</p>}
                  </div>

                  {colorsLoading && (
                    <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading colors…
                    </p>
                  )}
                  {!colorsLoading && colors.length === 0 && (
                    <p className="text-xs text-gray-400 mt-2">
                      No colorways on file for this style — type the color on the line instead.
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 mt-2">
                    {colors.map((c) => {
                      const active = c.name === chosenColor;
                      return (
                        <button
                          key={c.name}
                          type="button"
                          title={c.name}
                          onClick={() => setChosenColor(active ? '' : c.name)}
                          className={`flex items-center gap-1.5 border rounded-full pl-1 pr-2.5 py-1 text-xs transition ${
                            active
                              ? 'border-red-500 ring-2 ring-red-200 text-gray-900'
                              : 'border-gray-200 text-gray-600 hover:border-gray-400'
                          }`}
                        >
                          {c.swatch ? (
                            <img src={c.swatch} alt="" className="w-5 h-5 rounded-full object-cover border border-gray-200" />
                          ) : (
                            <span
                              className="w-5 h-5 rounded-full border border-gray-200 inline-block"
                              style={{ background: c.hex || '#e5e7eb' }}
                            />
                          )}
                          <span className="max-w-[11rem] truncate">{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => { onPick(detail, chosenColor); onClose(); }}
                    className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg"
                  >
                    {chosenColor ? `Use this · ${chosenColor}` : 'Use this product'}
                  </button>
                  {!chosenColor && colors.length > 0 && (
                    <span className="text-xs text-gray-400">Pick a color first, or add it on the line.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
        <div className="flex-1 overflow-auto p-5">
          {items.length === 0 && loading && (
            <div className="py-20 flex justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          {items.length === 0 && !loading && (
            <p className="py-20 text-center text-sm text-gray-500">No products match “{query}”.</p>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((p) => {
              const blank = money(p.base_price);
              const retail = money(p.retail_price);
              const sizes = Array.isArray(p.sizes) ? p.sizes : [];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDetail(p)}
                  className="text-left border border-gray-200 rounded-xl overflow-hidden hover:border-red-400 hover:shadow-md transition group"
                >
                  <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform"
                      />
                    ) : (
                      <span className="text-xs text-gray-300">No photo</span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900">{p.style_number || `#${p.id}`}</span>
                      {blank && <span className="text-sm font-semibold text-gray-900">{blank}</span>}
                    </div>
                    <p className="text-xs text-gray-500">{p.brand}</p>
                    <p className="text-sm text-gray-800 mt-0.5 line-clamp-2">{p.name}</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {sizes.length > 0 ? `${sizes[0]} – ${sizes[sizes.length - 1]}` : p.category}
                      {retail && ` · retail ${retail}`}
                    </p>
                    {/* Colorway strip. Only the catalog rows that synced with
                        colors have these; thin rows show nothing here and
                        resolve their colors on the next step. */}
                    {Array.isArray(p.colors) && p.colors.length > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        {(p.colors as unknown as Colorway[]).slice(0, 8).map((c, idx) => (
                          <span
                            key={`${c?.name ?? idx}`}
                            title={c?.name}
                            className="w-3.5 h-3.5 rounded-full border border-gray-200 inline-block flex-shrink-0"
                            style={{ background: c?.hex || '#e5e7eb' }}
                          />
                        ))}
                        {p.colors.length > 8 && (
                          <span className="text-[10px] text-gray-400 ml-0.5">+{p.colors.length - 8}</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {page < totalPages && (
            <div className="pt-5 flex justify-center">
              <button
                type="button"
                disabled={loading}
                onClick={() => setPage((n) => n + 1)}
                className="border border-gray-300 hover:bg-gray-50 text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Load more
              </button>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

// Live-search typeahead for picking a product from the 5k+-row catalog.
// Falls back to free-form text — if the admin just types and tabs away,
// product_name is set but product_id stays null. Suggestions list closes
// when you click outside, click a result, or hit Enter on the highlighted one.
function ProductPicker({
  productId, productName, onPick, onName,
}: {
  productId: number | null;
  productName: string;
  onPick: (p: Product, color: string) => void;
  onName: (name: string) => void;
}) {
  const [query, setQuery] = useState(productName);
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Keep the input in sync if the parent draft changes the product_name from
  // outside (e.g. when initial draft is loaded from server).
  useEffect(() => { setQuery(productName); }, [productName]);

  // Debounced live search.
  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults([]); return; }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const data = await fetchAdminProducts(term, 1);
        setResults(data.products.slice(0, 12));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(handle);
  }, [query]);

  // Close the suggestion list when clicking anywhere outside it.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function pick(p: Product, color = '') {
    onPick(p, color);
    setQuery(p.name);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              onName(v);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search the catalog or type a custom name…"
            className="w-full text-sm border border-gray-200 rounded pl-7 pr-2 py-1.5 bg-white"
            style={{ fontSize: '16px' }}
          />
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setBrowsing(true); }}
          title="Browse the catalog with photos"
          className="flex-shrink-0 flex items-center gap-1.5 text-xs font-medium border border-gray-200 rounded px-2.5 py-2 text-gray-700 hover:bg-gray-50 hover:border-gray-300"
        >
          <LayoutGrid className="w-3.5 h-3.5" /> Browse
        </button>
      </div>
      {browsing && (
        <ProductBrowser
          initialQuery={query}
          onPick={pick}
          onClose={() => setBrowsing(false)}
        />
      )}
      {productId && (
        <p className="text-[10px] text-gray-400 mt-0.5">
          Catalog product #{productId}
        </p>
      )}
      {open && (results.length > 0 || loading) && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-auto">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" /> Searching…
            </div>
          )}
          {results.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className="w-full text-left px-3 py-2 hover:bg-red-50 flex items-center gap-2 border-b border-gray-100 last:border-b-0"
            >
              {('image_url' in p && (p as Product & { image_url?: string }).image_url) ? (
                <img
                  src={(p as Product & { image_url?: string }).image_url}
                  alt=""
                  className="w-8 h-8 object-cover rounded border border-gray-100 flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-900 truncate">{p.name}</p>
                {('category' in p && (p as Product & { category?: string }).category) && (
                  <p className="text-[11px] text-gray-500 truncate">
                    {(p as Product & { category?: string }).category}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
