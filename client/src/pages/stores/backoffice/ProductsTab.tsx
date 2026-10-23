// Products tab — a store owner editing how its shelf presents.
//
// Scope is deliberate: presentation and the price a shopper pays. Blank
// cost and the S&S SKU stay with TSB, so they are not shown here at all
// rather than shown disabled, which would invite "why can't I edit this?".

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Loader2, ChevronUp, ChevronDown, Eye, EyeOff, Pencil, X, Save,
} from 'lucide-react';
import {
  type BoCategory, type BoProduct,
  fetchCategories, fetchStoreProducts, reorderProducts,
  setProductCategories, updateProduct,
  centsToDollars, dollarsToCents,
} from './api';

export default function ProductsTab({ slug, authHeaders }: {
  slug: string;
  authHeaders: Record<string, string>;
}) {
  const [products, setProducts] = useState<BoProduct[] | null>(null);
  const [categories, setCategories] = useState<BoCategory[]>([]);
  const [editing, setEditing] = useState<BoProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const [{ products: rows }, cats] = await Promise.all([
        fetchStoreProducts(slug, authHeaders),
        // Categories are a nice-to-have on this tab; a store with none
        // should still get its product list.
        fetchCategories(slug, authHeaders).catch(() => ({ categories: [] as BoCategory[] })),
      ]);
      setProducts(rows);
      setCategories(cats.categories);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load products');
      setProducts([]);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  // Moving a row rewrites the whole order, because sort_order is positional
  // rather than a sparse ranking — simpler to reason about than gap-based
  // keys, at the cost of one write per move.
  async function move(index: number, delta: number) {
    if (!products) return;
    const next = [...products];
    const target = index + delta;
    // Read both before writing either: under noUncheckedIndexedAccess a
    // destructuring swap types each side as possibly-undefined.
    const from = next[index];
    const to = next[target];
    if (!from || !to) return;
    next[index] = to;
    next[target] = from;

    setProducts(next);            // optimistic: the arrows should feel instant
    setBusy(true);
    try {
      await reorderProducts(slug, next.map((p) => p.id), authHeaders);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the new order');
      await load();               // put it back the way the server has it
    } finally {
      setBusy(false);
    }
  }

  async function toggleVisible(product: BoProduct) {
    setBusy(true);
    try {
      await updateProduct(slug, product.id, { is_active: !product.is_active }, authHeaders);
      toast.success(product.is_active ? `"${product.title}" hidden from the shop` : `"${product.title}" is live`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change visibility');
    } finally {
      setBusy(false);
    }
  }

  if (products === null) {
    return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>;
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Products</h2>
          <p className="text-sm text-gray-500">
            Edit how each product appears and what it costs. Use the arrows to
            choose the order shoppers see.
          </p>
        </div>
        {busy && <Loader2 className="w-4 h-4 animate-spin text-gray-400 mt-1" />}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!products.length && !error && (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
          No products yet. TSB adds products to your store — ask them to publish
          your designs and they'll show up here.
        </div>
      )}

      <div className="space-y-2">
        {products.map((p, i) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex flex-col">
              <button onClick={() => move(i, -1)} disabled={i === 0 || busy}
                aria-label={`Move ${p.title} up`}
                className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-25 disabled:hover:text-gray-400">
                <ChevronUp className="w-4 h-4" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === products.length - 1 || busy}
                aria-label={`Move ${p.title} down`}
                className="p-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-25 disabled:hover:text-gray-400">
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {p.cover_image
              ? <img src={p.cover_image} alt="" className="h-14 w-14 rounded object-cover bg-gray-100" />
              : <div className="h-14 w-14 rounded bg-gray-100" />}

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-gray-900">{p.title}</p>
              <p className="text-sm text-gray-500">
                ${centsToDollars(p.retail_price_cents)}
                {p.compare_at_cents ? <span className="ml-2 text-gray-400 line-through">${centsToDollars(p.compare_at_cents)}</span> : null}
                {p.category_slugs?.length ? <span className="ml-2 text-gray-400">· {p.category_slugs.join(', ')}</span> : null}
              </p>
            </div>

            <button onClick={() => toggleVisible(p)} disabled={busy}
              title={p.is_active === false ? 'Hidden from the shop' : 'Visible in the shop'}
              className="p-2 text-gray-400 hover:text-gray-900 disabled:opacity-40">
              {p.is_active === false ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button onClick={() => setEditing(p)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900 hover:text-gray-900">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <EditProductModal
          slug={slug} authHeaders={authHeaders}
          product={editing} categories={categories}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function EditProductModal({ slug, authHeaders, product, categories, onClose, onSaved }: {
  slug: string;
  authHeaders: Record<string, string>;
  product: BoProduct;
  categories: BoCategory[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [title, setTitle] = useState(product.title);
  const [description, setDescription] = useState(product.description ?? '');
  const [price, setPrice] = useState(centsToDollars(product.retail_price_cents));
  const [compareAt, setCompareAt] = useState(centsToDollars(product.compare_at_cents));
  const [coverImage, setCoverImage] = useState(product.cover_image ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(() => {
    const bySlug = new Map(categories.map((c) => [c.slug, c.id]));
    return new Set((product.category_slugs ?? []).map((s) => bySlug.get(s)).filter((v): v is number => v != null));
  }, [categories, product.category_slugs]);
  const [chosen, setChosen] = useState<Set<number>>(selectedIds);

  async function save() {
    const retail = dollarsToCents(price);
    if (!Number.isFinite(retail) || retail <= 0) {
      setError('Enter a price greater than zero.');
      return;
    }
    const compare = compareAt.trim() ? dollarsToCents(compareAt) : null;
    if (compare !== null && !(compare > retail)) {
      setError('The compare-at price has to be higher than the price, or left blank.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await updateProduct(slug, product.id, {
        title: title.trim(),
        description: description.trim() || null,
        cover_image: coverImage.trim() || null,
        retail_price_cents: retail,
        compare_at_cents: compare,
      }, authHeaders);

      // Categories are a separate endpoint; only call it when the set
      // actually changed, so an unrelated edit can't clear them.
      const before = [...selectedIds].sort().join(',');
      const after = [...chosen].sort().join(',');
      if (before !== after) {
        await setProductCategories(slug, product.id, [...chosen], authHeaders);
      }

      toast.success(`Saved "${title.trim()}"`);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="font-bold text-gray-900">Edit product</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <Field label="Name">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price" hint="What the shopper pays">
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={inputCls} />
            </Field>
            <Field label="Compare at" hint="Optional — shows as struck through">
              <input value={compareAt} onChange={(e) => setCompareAt(e.target.value)} inputMode="decimal" className={inputCls} />
            </Field>
          </div>

          <Field label="Description">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className={inputCls} />
          </Field>

          <Field label="Photo URL">
            <input value={coverImage} onChange={(e) => setCoverImage(e.target.value)} className={inputCls} />
          </Field>
          {coverImage.trim() && (
            <img src={coverImage} alt="" className="h-28 w-28 rounded object-cover bg-gray-100"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          )}

          {categories.length > 0 && (
            <Field label="Collections">
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const on = chosen.has(c.id);
                  return (
                    <button key={c.id} type="button"
                      onClick={() => setChosen((prev) => {
                        const next = new Set(prev);
                        if (on) next.delete(c.id); else next.add(c.id);
                        return next;
                      })}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        on ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-900'
                      }`}>
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}
