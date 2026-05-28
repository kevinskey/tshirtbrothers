import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Loader2, Search, Calculator } from 'lucide-react';
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
  };
}

function draftQuantity(d: DraftItem): number {
  return d.sizes.reduce((n, s) => n + (Number(s.quantity) || 0), 0);
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
  // clutter — even if a price snapshot is attached, it's not a fulfillable
  // line item. Anything with no catalog product link AND no sizes counts as
  // empty; admin-added free-form items always have at least sizes.
  const isEmptyItem = (d: DraftItem) =>
    !d.product_id && d.sizes.length === 0;

  const [drafts, setDrafts] = useState<DraftItem[]>(() =>
    (quote.items || []).map(quoteItemToDraft).filter((d) => !isEmptyItem(d)));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recalcingIdx, setRecalcingIdx] = useState<number | null>(null);
  const recalcDefaults = useMemo(() => readRecalcDefaults(quote), [quote]);

  // Reset when a different quote is opened.
  useEffect(() => {
    setDrafts((quote.items || []).map(quoteItemToDraft).filter((d) => !isEmptyItem(d)));
    setErr(null);
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
    }]);
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
  }

  async function recalcLine(i: number) {
    const d = drafts[i];
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
        rush: recalcDefaults.rush,
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
                  onPick={(p) => updateDraft(i, { product_id: Number(p.id), product_name: p.name })}
                  onName={(name) => updateDraft(i, { product_name: name })}
                />
              </div>
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
                  className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
                  style={{ fontSize: '16px' }}
                />
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
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Sizes</label>
              <div className="grid grid-cols-4 gap-1.5">
                {COMMON_SIZES.map((size) => {
                  const cur = d.sizes.find((s) => s.size === size)?.quantity ?? 0;
                  return (
                    <div key={size} className="flex items-center gap-1 bg-white rounded border border-gray-200 px-1.5 py-1">
                      <span className="text-[11px] font-semibold text-gray-600 w-7">{size}</span>
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
                  <><Calculator className="w-3.5 h-3.5" /> Recalculate with print formula ({recalcDefaults.methodName} · {recalcDefaults.qualityTier} · {Math.max(1, d.print_areas.length)} location{d.print_areas.length === 1 ? '' : 's'})</>
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

// Live-search typeahead for picking a product from the 5k+-row catalog.
// Falls back to free-form text — if the admin just types and tabs away,
// product_name is set but product_id stays null. Suggestions list closes
// when you click outside, click a result, or hit Enter on the highlighted one.
function ProductPicker({
  productId, productName, onPick, onName,
}: {
  productId: number | null;
  productName: string;
  onPick: (p: Product) => void;
  onName: (name: string) => void;
}) {
  const [query, setQuery] = useState(productName);
  const [results, setResults] = useState<Product[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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

  function pick(p: Product) {
    onPick(p);
    setQuery(p.name);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
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
