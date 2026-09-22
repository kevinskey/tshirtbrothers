import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, Loader2, Plus, Star, Trash2, X,
} from 'lucide-react';
import {
  createHolidayProduct, deleteHolidayProduct, fetchHolidayAdmin,
  lookupHolidaySku, money, updateHolidayProduct,
} from '../lib/api';
import type { CgcHolidayAdminProduct } from '../lib/api';
import { useCgcPath } from '../lib/base';

// CGC Holiday launch manager — lives ON the CGC site (Doc's call,
// 2026-09-22), gated by the shared TSB admin JWT. This page IS the launch
// worksheet: per product it holds the variant SKUs with live account
// cost, the engraving/packaging/selling-price numbers, sample approval,
// featured flag, and the Publish switch that makes it buyable.

const input =
  'w-full rounded-lg border border-cgc-cream-deep px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cgc-orange';
const label = 'block text-xs font-bold uppercase tracking-wide text-cgc-stone mb-1';

type Variant = { sku: string; label: string };
type Design = { key?: string; label: string; desc: string };
type Field = { key?: string; label: string; max: number; required: boolean; help: string };

interface Draft {
  title: string;
  intro: string;
  limits_note: string;
  production_note: string;
  engraving_minutes: string;
  packaging_cost: string; // dollars in the UI, cents on the wire
  selling_price: string;
  sample_approved: boolean;
  variants: Variant[];
  designs: Design[];
  fields: Field[];
}

function toDraft(p: CgcHolidayAdminProduct): Draft {
  return {
    title: p.title,
    intro: p.intro,
    limits_note: p.limits,
    production_note: p.production_note ?? '',
    engraving_minutes: p.engraving_minutes == null ? '' : String(p.engraving_minutes),
    packaging_cost: p.packaging_cost_cents == null ? '' : (p.packaging_cost_cents / 100).toFixed(2),
    selling_price: p.selling_price_cents == null ? '' : (p.selling_price_cents / 100).toFixed(2),
    sample_approved: p.sample_approved,
    variants: p.variants.map((v) => ({ sku: v.sku, label: v.label })),
    designs: p.designs.map((d) => ({ ...d })),
    fields: p.fields.map((f) => ({ ...f })),
  };
}

function dollars(cents: number | null | undefined): string {
  return cents == null ? '—' : money(cents);
}

function ProductEditor({ p, onSaved }: { p: CgcHolidayAdminProduct; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(p));
  const [busy, setBusy] = useState(false);
  const [newSku, setNewSku] = useState('');
  const [newSkuLabel, setNewSkuLabel] = useState('');
  const [checkingSku, setCheckingSku] = useState(false);

  // Re-sync the form whenever a fresh server copy arrives (e.g. after a
  // toggle elsewhere) but only while the editor is closed, so open edits
  // are never clobbered.
  useEffect(() => {
    if (!open) setDraft(toDraft(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const quickPatch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await updateHolidayProduct(p.id, body);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const togglePublish = async () => {
    if (!p.published) {
      const gaps = [
        !p.selling_price_cents && 'no selling price set',
        p.engraving_minutes == null && 'engraving time not measured',
        p.packaging_cost_cents == null && 'packaging cost not set',
        !p.sample_approved && 'sample not approved',
      ].filter(Boolean);
      if (gaps.length && !confirm(`Publish anyway? Launch checklist incomplete: ${gaps.join(', ')}.`)) return;
    }
    await quickPatch({ published: !p.published });
    toast.success(p.published ? `${p.title} unpublished` : `${p.title} is LIVE`);
  };

  const addVariant = async () => {
    const sku = newSku.trim().toUpperCase();
    if (!sku) return;
    setCheckingSku(true);
    try {
      const { product } = await lookupHolidaySku(sku);
      if (draft.variants.some((v) => v.sku === sku)) throw new Error(`${sku} is already a variant`);
      const vLabel = newSkuLabel.trim() || product.name.slice(0, 40);
      set('variants', [...draft.variants, { sku, label: vLabel }]);
      setNewSku(''); setNewSkuLabel('');
      toast.success(`${sku} — ${product.name.slice(0, 60)} · cost ${dollars(product.cost_cents)} · retail ${money(product.retail_price_cents)}${product.active ? '' : ' · INACTIVE'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'SKU check failed');
    } finally {
      setCheckingSku(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const cents = (s: string) => {
        const n = parseFloat(s);
        return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
      };
      await updateHolidayProduct(p.id, {
        title: draft.title,
        intro: draft.intro,
        limits_note: draft.limits_note,
        production_note: draft.production_note,
        engraving_minutes: draft.engraving_minutes === '' ? null : draft.engraving_minutes,
        packaging_cost_cents: draft.packaging_cost === '' ? null : cents(draft.packaging_cost),
        selling_price_cents: draft.selling_price === '' ? null : cents(draft.selling_price),
        sample_approved: draft.sample_approved,
        variants: draft.variants,
        designs: draft.designs,
        fields: draft.fields,
      });
      toast.success('Saved');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${p.title}" from the Holiday collection? The catalog products themselves are untouched.`)) return;
    setBusy(true);
    try {
      await deleteHolidayProduct(p.id);
      toast.success('Removed');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
      setBusy(false);
    }
  };

  const checklist = [
    ['Selling price', p.selling_price_cents != null],
    ['Engraving time', p.engraving_minutes != null],
    ['Packaging cost', p.packaging_cost_cents != null],
    ['Sample approved', p.sample_approved],
  ] as const;

  return (
    <div className="rounded-2xl border border-cgc-cream-deep bg-white">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3 p-4">
        {p.image_url && (
          <img src={p.image_url} alt="" className="h-12 w-12 rounded-lg bg-cgc-cream object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-extrabold text-cgc-ink truncate">{p.title}</p>
          <p className="text-xs text-cgc-stone truncate">
            /{p.slug} · {p.variants.length} variant{p.variants.length === 1 ? '' : 's'} ·{' '}
            {checklist.filter(([, ok]) => ok).length}/{checklist.length} launch checks
          </p>
        </div>
        <button
          type="button"
          onClick={() => quickPatch({ featured: !p.featured })}
          disabled={busy}
          aria-pressed={p.featured}
          title={p.featured ? 'Unfeature' : 'Feature at the front of the collection'}
          className={`inline-flex items-center gap-1 rounded-full border-2 px-3 py-1.5 text-xs font-bold transition-colors ${p.featured ? 'border-cgc-orange bg-cgc-orange text-white' : 'border-cgc-cream-deep text-cgc-charcoal hover:border-cgc-orange'}`}
        >
          <Star className={`h-3.5 w-3.5 ${p.featured ? 'fill-white' : ''}`} aria-hidden /> Featured
        </button>
        <button
          type="button"
          onClick={togglePublish}
          disabled={busy}
          aria-pressed={p.published}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${p.published ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-cgc-ink text-white hover:bg-cgc-charcoal'}`}
        >
          {p.published ? 'Published — click to unpublish' : 'Launching soon — click to publish'}
        </button>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Move up" disabled={busy}
            onClick={() => quickPatch({ position: p.position - 1 })}
            className="p-1.5 rounded-lg text-cgc-stone hover:bg-cgc-cream"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" aria-label="Move down" disabled={busy}
            onClick={() => quickPatch({ position: p.position + 1 })}
            className="p-1.5 rounded-lg text-cgc-stone hover:bg-cgc-cream"><ArrowDown className="h-4 w-4" /></button>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-bold text-cgc-orange hover:bg-cgc-cream">
            Edit {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-cgc-cream-deep p-4 space-y-5">
          {/* Copy */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <span className={label}>Title</span>
              <input className={input} value={draft.title} maxLength={120} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div>
              <span className={label}>Production note (shown once measured — leave blank until real)</span>
              <input className={input} value={draft.production_note} maxLength={400}
                placeholder="e.g. Engraved and shipped in 3 business days"
                onChange={(e) => set('production_note', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <span className={label}>Intro</span>
              <input className={input} value={draft.intro} maxLength={400} onChange={(e) => set('intro', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <span className={label}>Personalization limits (shown on the product page)</span>
              <input className={input} value={draft.limits_note} maxLength={400} onChange={(e) => set('limits_note', e.target.value)} />
            </div>
          </div>

          {/* Launch worksheet */}
          <div className="rounded-xl bg-cgc-cream/60 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-cgc-ink mb-3">Launch worksheet</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className={label}>Engraving (min/pc)</span>
                <input className={input} inputMode="decimal" value={draft.engraving_minutes}
                  placeholder="TBD" onChange={(e) => set('engraving_minutes', e.target.value)} />
              </div>
              <div>
                <span className={label}>Packaging ($/pc)</span>
                <input className={input} inputMode="decimal" value={draft.packaging_cost}
                  placeholder="TBD" onChange={(e) => set('packaging_cost', e.target.value)} />
              </div>
              <div>
                <span className={label}>Selling price ($)</span>
                <input className={input} inputMode="decimal" value={draft.selling_price}
                  placeholder="catalog retail" onChange={(e) => set('selling_price', e.target.value)} />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm font-semibold text-cgc-ink cursor-pointer">
                <input type="checkbox" checked={draft.sample_approved}
                  onChange={(e) => set('sample_approved', e.target.checked)}
                  className="h-4 w-4 accent-cgc-orange" />
                Sample approved
              </label>
            </div>
            <p className="mt-2 text-xs text-cgc-stone">
              Selling price overrides the catalog retail for every color; the engraving fee is
              added at checkout on top. Leave fields blank until measured — the site never shows them.
            </p>
          </div>

          {/* Variants */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cgc-ink mb-2">Colors / variants (JDS SKUs)</p>
            <div className="space-y-1.5">
              {draft.variants.map((v, i) => {
                const live = p.variants.find((lv) => lv.sku === v.sku);
                return (
                  <div key={v.sku} className="flex flex-wrap items-center gap-2 text-sm">
                    <input className={`${input} w-32`} value={v.label} maxLength={60} aria-label={`Label for ${v.sku}`}
                      onChange={(e) => set('variants', draft.variants.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                    <span className="font-mono text-xs text-cgc-charcoal">{v.sku}</span>
                    <span className="text-xs text-cgc-stone">
                      {live?.missing ? 'NOT IN CATALOG' : live
                        ? `cost ${dollars(live.cost_cents)} · retail ${money(live.catalog_retail_cents ?? live.retail_price_cents)}${live.active ? '' : ' · INACTIVE'}`
                        : 'save to check'}
                    </span>
                    <button type="button" aria-label={`Remove ${v.sku}`}
                      onClick={() => set('variants', draft.variants.filter((_, j) => j !== i))}
                      className="ml-auto p-1 text-cgc-stone hover:text-red-600"><X className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input className={`${input} w-36`} placeholder="JDS SKU" value={newSku}
                onChange={(e) => setNewSku(e.target.value)} />
              <input className={`${input} w-36`} placeholder="Color label" value={newSkuLabel}
                onChange={(e) => setNewSkuLabel(e.target.value)} />
              <button type="button" onClick={addVariant} disabled={checkingSku || !newSku.trim()}
                className="inline-flex items-center gap-1 rounded-lg bg-cgc-ink text-white text-sm font-bold px-4 py-2 disabled:opacity-50">
                {checkingSku ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add SKU
              </button>
              <span className="text-xs text-cgc-stone">Must already be published in TSB admin → Blanks (JDS).</span>
            </div>
          </div>

          {/* Designs */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cgc-ink mb-2">Engraving designs</p>
            <div className="space-y-1.5">
              {draft.designs.map((d, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input className={`${input} w-44`} value={d.label} maxLength={80} placeholder="Design name" aria-label={`Design ${i + 1} name`}
                    onChange={(e) => set('designs', draft.designs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input className={`${input} flex-1 min-w-[220px]`} value={d.desc} maxLength={200} placeholder="Short description" aria-label={`Design ${i + 1} description`}
                    onChange={(e) => set('designs', draft.designs.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)))} />
                  <button type="button" aria-label={`Remove design ${i + 1}`}
                    onClick={() => set('designs', draft.designs.filter((_, j) => j !== i))}
                    className="p-1 text-cgc-stone hover:text-red-600"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => set('designs', [...draft.designs, { label: '', desc: '' }])}
              className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-cgc-orange">
              <Plus className="h-4 w-4" /> Add design
            </button>
          </div>

          {/* Personalization fields */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cgc-ink mb-2">Personalization fields</p>
            <div className="space-y-1.5">
              {draft.fields.map((f, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input className={`${input} w-40`} value={f.label} maxLength={80} placeholder="Field label" aria-label={`Field ${i + 1} label`}
                    onChange={(e) => set('fields', draft.fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <input className={`${input} w-20`} inputMode="numeric" value={String(f.max)} aria-label={`Field ${i + 1} max characters`}
                    onChange={(e) => set('fields', draft.fields.map((x, j) => (j === i ? { ...x, max: parseInt(e.target.value, 10) || 0 } : x)))} />
                  <label className="flex items-center gap-1 text-xs font-semibold text-cgc-ink">
                    <input type="checkbox" checked={f.required} className="h-3.5 w-3.5 accent-cgc-orange"
                      onChange={(e) => set('fields', draft.fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} />
                    required
                  </label>
                  <input className={`${input} flex-1 min-w-[180px]`} value={f.help} maxLength={200} placeholder="Help text" aria-label={`Field ${i + 1} help`}
                    onChange={(e) => set('fields', draft.fields.map((x, j) => (j === i ? { ...x, help: e.target.value } : x)))} />
                  <button type="button" aria-label={`Remove field ${i + 1}`}
                    onClick={() => set('fields', draft.fields.filter((_, j) => j !== i))}
                    className="p-1 text-cgc-stone hover:text-red-600"><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => set('fields', [...draft.fields, { label: '', max: 30, required: false, help: '' }])}
              className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-cgc-orange">
              <Plus className="h-4 w-4" /> Add field
            </button>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="button" onClick={save} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-2.5 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes
            </button>
            <button type="button" onClick={remove} disabled={busy}
              className="inline-flex items-center gap-1 text-sm font-bold text-red-600 hover:text-red-700 ml-auto">
              <Trash2 className="h-4 w-4" /> Remove from collection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HolidayAdminPage() {
  const p = useCgcPath();
  const queryClient = useQueryClient();
  const [me, setMe] = useState<'loading' | 'admin' | 'denied'>('loading');
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) { setMe('denied'); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setMe(u?.role === 'admin' ? 'admin' : 'denied'))
      .catch(() => setMe('denied'));
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['cgc-holiday-admin'],
    queryFn: fetchHolidayAdmin,
    enabled: me === 'admin',
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cgc-holiday-admin'] });
    queryClient.invalidateQueries({ queryKey: ['cgc-holiday'] });
  };

  const createProduct = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      await createHolidayProduct({ title });
      setNewTitle('');
      toast.success(`"${title}" added — unpublished until its launch checklist is done`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  if (me === 'loading') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cgc-orange" aria-label="Checking access" />
      </div>
    );
  }
  if (me === 'denied') {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <p className="text-lg font-semibold text-cgc-ink">Admin sign-in required.</p>
        <p className="mt-2 text-cgc-stone">Sign in with the shop admin account to manage the Holiday collection.</p>
        <Link to={p('/account')} className="mt-4 inline-flex rounded-lg bg-cgc-orange text-white font-bold px-6 py-3">
          Go to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Helmet><title>Holiday Launch Manager — Custom Gift Club</title></Helmet>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-cgc-ink">Holiday Launch Manager</h1>
          <p className="mt-1 text-sm text-cgc-stone">
            Fill the launch worksheet, feature items, and publish when a product&rsquo;s
            numbers and sample are confirmed. <Link to={p('/holiday')} className="font-semibold text-cgc-orange">View the live collection →</Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input className={`${input} w-56`} placeholder="New product title…" value={newTitle}
            maxLength={120} onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') createProduct(); }} />
          <button type="button" onClick={createProduct} disabled={creating || !newTitle.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white text-sm font-bold px-4 py-2.5 disabled:opacity-50">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add product
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-cgc-orange" aria-label="Loading products" />
        </div>
      ) : (
        <div className="space-y-3">
          {(data?.products ?? []).map((prod) => (
            <ProductEditor key={prod.id} p={prod} onSaved={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}
