import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import type { Product, Quote, QuoteItem } from '@/lib/api';
import { replaceQuoteItems } from '@/lib/api';

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
  products,
  onSaved,
}: {
  quote: Quote;
  products: Product[];
  onSaved: (updated: Quote) => void;
}) {
  const [drafts, setDrafts] = useState<DraftItem[]>(() =>
    (quote.items || []).map(quoteItemToDraft));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Reset when a different quote is opened.
  useEffect(() => {
    setDrafts((quote.items || []).map(quoteItemToDraft));
    setErr(null);
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
        <p className="text-sm text-gray-500 italic mb-3">No items yet. Add one below.</p>
      )}

      <ul className="space-y-3">
        {drafts.map((d, i) => (
          <li key={i} className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Product</label>
                <select
                  value={d.product_id ?? ''}
                  onChange={(e) => {
                    const pid = e.target.value ? Number(e.target.value) : null;
                    const p = pid ? products.find((x) => Number(x.id) === pid) : null;
                    updateDraft(i, {
                      product_id: pid,
                      product_name: p ? p.name : d.product_name,
                    });
                  }}
                  className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 bg-white"
                  style={{ fontSize: '16px' }}
                >
                  <option value="">— pick a product or type a name —</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={d.product_name}
                  onChange={(e) => updateDraft(i, { product_name: e.target.value })}
                  placeholder="Override / free-form product name"
                  className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 mt-1 bg-white"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <button
                onClick={() => removeDraft(i)}
                title="Remove item"
                className="p-1.5 text-gray-400 hover:text-red-600"
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
          <Plus className="w-4 h-4" /> Add item
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
