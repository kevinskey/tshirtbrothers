// CGC gift quote (Doc, 2026-09-28): CGC products quoted and sold through
// the same TSB quotes pipeline. Framed for individuals AND businesses —
// unlike /business, which is corporate-bulk only. Submits to the public
// POST /api/quotes, so it lands on the admin Quotes page as a pending
// quote and flows deposit → invoice → production like any other job.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Loader2, Minus, Plus, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { fetchProducts, money } from '../lib/api';
import type { CgcProduct } from '../lib/api';
import { useCgcPath } from '../lib/base';

interface QuoteItem {
  sku: string | null;
  name: string;
  qty: number;
  priceCents: number | null;
  personalization: string;
}

export default function QuotePage() {
  const p = useCgcPath();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([]);
  const [customItem, setCustomItem] = useState('');
  const [dateNeeded, setDateNeeded] = useState('');
  const [notes, setNotes] = useState('');
  const [artUrl, setArtUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data: results, isFetching } = useQuery({
    queryKey: ['cgc-quote-search', search],
    queryFn: () => fetchProducts({ search, limit: 6 }),
    enabled: search.trim().length >= 2,
  });

  const totalQty = useMemo(() => items.reduce((n, i) => n + i.qty, 0), [items]);

  const addProduct = (prod: CgcProduct) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.sku === prod.sku);
      if (existing) return prev.map((i) => (i.sku === prod.sku ? { ...i, qty: i.qty + 1 } : i));
      return [...prev, { sku: prod.sku, name: prod.name.trim(), qty: 1, priceCents: prod.retail_price_cents, personalization: '' }];
    });
    setSearch('');
  };

  const addCustom = () => {
    const label = customItem.trim();
    if (!label) return;
    setItems((prev) => [...prev, { sku: null, name: label, qty: 1, priceCents: null, personalization: '' }]);
    setCustomItem('');
  };

  const setQty = (idx: number, qty: number) =>
    setItems((prev) => prev.map((i, n) => (n === idx ? { ...i, qty: Math.max(1, Math.min(999, qty)) } : i)));

  const uploadArt = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, filename: file.name, customerEmail: email || undefined }),
      });
      if (!res.ok) throw new Error('Upload failed');
      const { url } = await res.json();
      setArtUrl(url);
      toast.success('Artwork uploaded');
    } catch {
      toast.error('Upload failed — try a PNG or JPG');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) { toast.error('Add at least one gift to quote'); return; }
    if (phone.replace(/\D/g, '').length < 10) { toast.error('A phone number is required so we can reach you'); return; }
    setSubmitting(true);
    try {
      const itemLines = items.map((i) =>
        `- ${i.qty} × ${i.name}${i.sku ? ` [${i.sku}]` : ''}${i.personalization ? ` — personalize: ${i.personalization}` : ''}`,
      );
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: name,
          customer_email: email,
          customer_phone: phone,
          product_name: `CGC Gifts — ${items.map((i) => `${i.qty}× ${i.name}`).join(', ')}`.slice(0, 250),
          quantity: totalQty,
          design_type: 'cgc-gifts',
          design_url: artUrl || null,
          date_needed: dateNeeded || null,
          notes: ['Custom Gift Club quote request', ...itemLines, notes.trim() ? `Notes: ${notes.trim()}` : '']
            .filter(Boolean).join('\n'),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Something went wrong — try again');
      }
      setSubmitted(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong — try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <Helmet><title>Quote received — Custom Gift Club</title></Helmet>
        <Sparkles className="h-10 w-10 mx-auto text-cgc-orange" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-cgc-ink">Got it — your quote is in.</h1>
        <p className="mt-3 text-cgc-charcoal">
          We&rsquo;ll price your gifts and email you within one business day. Rush date?
          Call us and mention the quote you just sent.
        </p>
        <Link to={p('/shop')} className="mt-8 inline-flex rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3 transition-colors">
          Keep Browsing Gifts
        </Link>
      </div>
    );
  }

  const inputCls = 'w-full rounded-lg border border-cgc-cream-deep px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-cgc-orange';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <Helmet><title>Get a Gift Quote — Custom Gift Club</title></Helmet>

      <p className="text-xs font-bold uppercase tracking-[0.15em] text-cgc-orange">Custom quotes</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-cgc-ink">Tell us what you&rsquo;re dreaming up.</h1>
      <p className="mt-2 text-cgc-charcoal max-w-xl">
        One engraved keepsake or five hundred client gifts — pick products from our catalog (or describe
        something else), and we&rsquo;ll send pricing within one business day.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-8">
        <section className="rounded-2xl border border-cgc-cream-deep p-5 space-y-4">
          <h2 className="font-extrabold text-cgc-ink">Who are we quoting for?</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="q-name" className="block text-sm font-semibold text-cgc-ink mb-1">Name</label>
              <input id="q-name" required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label htmlFor="q-email" className="block text-sm font-semibold text-cgc-ink mb-1">Email</label>
              <input id="q-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="q-phone" className="block text-sm font-semibold text-cgc-ink mb-1">Phone</label>
              <input id="q-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="So we can reach you with questions" className={inputCls} />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-cgc-cream-deep p-5 space-y-4">
          <h2 className="font-extrabold text-cgc-ink">What gifts should we price?</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cgc-stone" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search our catalog — tumblers, boards, awards, journals…"
              className={`${inputCls} pl-9`}
              aria-label="Search gift catalog"
            />
            {search.trim().length >= 2 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-cgc-cream-deep bg-white shadow-lg overflow-hidden">
                {isFetching && <div className="px-4 py-3 text-sm text-cgc-stone">Searching…</div>}
                {!isFetching && (results?.products ?? []).length === 0 && (
                  <div className="px-4 py-3 text-sm text-cgc-stone">No matches — describe it below instead.</div>
                )}
                {(results?.products ?? []).map((prod) => (
                  <button key={prod.sku} type="button" onClick={() => addProduct(prod)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-cgc-cream">
                    {prod.image_url
                      ? <img src={prod.image_url} alt="" className="h-9 w-9 rounded object-contain bg-cgc-cream" />
                      : <span className="h-9 w-9 rounded bg-cgc-cream" aria-hidden />}
                    <span className="min-w-0 flex-1 truncate text-sm text-cgc-ink">{prod.name.trim()}</span>
                    <span className="text-sm font-semibold text-cgc-ink shrink-0">{money(prod.retail_price_cents)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={customItem}
              onChange={(e) => setCustomItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
              placeholder="Or describe something not in the catalog…"
              className={inputCls}
              aria-label="Describe a custom gift"
            />
            <button type="button" onClick={addCustom}
              className="shrink-0 rounded-lg border-2 border-cgc-ink px-4 font-bold text-cgc-ink hover:bg-cgc-ink hover:text-white transition-colors">
              Add
            </button>
          </div>

          {items.length > 0 && (
            <ul className="space-y-3">
              {items.map((item, idx) => (
                <li key={`${item.sku ?? item.name}-${idx}`} className="rounded-xl bg-cgc-cream p-3">
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate font-semibold text-cgc-ink">{item.name}</span>
                    {item.priceCents != null && (
                      <span className="text-sm text-cgc-stone shrink-0">{money(item.priceCents)} ea.</span>
                    )}
                    <div className="flex items-center rounded-lg border border-cgc-cream-deep bg-white">
                      <button type="button" aria-label="Decrease quantity" onClick={() => setQty(idx, item.qty - 1)} className="p-2 text-cgc-ink"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                      <button type="button" aria-label="Increase quantity" onClick={() => setQty(idx, item.qty + 1)} className="p-2 text-cgc-ink"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                    <button type="button" aria-label={`Remove ${item.name}`}
                      onClick={() => setItems((prev) => prev.filter((_, n) => n !== idx))}
                      className="p-2 text-cgc-stone hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    value={item.personalization}
                    onChange={(e) => setItems((prev) => prev.map((i, n) => (n === idx ? { ...i, personalization: e.target.value } : i)))}
                    maxLength={120}
                    placeholder="Personalization — names, dates, logo placement…"
                    className="mt-2 w-full rounded-lg border border-cgc-cream-deep px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cgc-orange"
                    aria-label={`Personalization for ${item.name}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-cgc-cream-deep p-5 space-y-4">
          <h2 className="font-extrabold text-cgc-ink">Details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="q-date" className="block text-sm font-semibold text-cgc-ink mb-1">Need it by (optional)</label>
              <input id="q-date" type="date" value={dateNeeded} onChange={(e) => setDateNeeded(e.target.value)} className={inputCls} />
            </div>
            <div>
              <span className="block text-sm font-semibold text-cgc-ink mb-1">Artwork or logo (optional)</span>
              <label className="inline-flex items-center gap-2 rounded-lg border border-cgc-cream-deep px-4 py-2.5 text-sm font-semibold text-cgc-charcoal cursor-pointer hover:bg-cgc-cream">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                {artUrl ? 'Replace file' : 'Upload file'}
                <input type="file" accept="image/*,.pdf" className="sr-only"
                  onChange={(e) => e.target.files?.[0] && uploadArt(e.target.files[0])} />
              </label>
              {artUrl && (
                <span className="ml-3 inline-flex items-center gap-1 text-sm text-green-700">
                  <Check className="h-4 w-4" aria-hidden /> Attached
                </span>
              )}
            </div>
          </div>
          <div>
            <label htmlFor="q-notes" className="block text-sm font-semibold text-cgc-ink mb-1">Anything else?</label>
            <textarea id="q-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Occasion, budget per gift, packaging wishes — the more we know, the sharper the quote."
              className={inputCls} />
          </div>
        </section>

        <button type="submit" disabled={submitting}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-8 py-3.5 transition-colors disabled:opacity-60">
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Sparkles className="h-5 w-5" aria-hidden />}
          {submitting ? 'Sending…' : `Request Quote${totalQty > 0 ? ` — ${totalQty} item${totalQty === 1 ? '' : 's'}` : ''}`}
        </button>
        <p className="text-xs text-cgc-stone -mt-4">
          Ordering 25+ of the same gift for a company or event? Our{' '}
          <Link to={p('/business')} className="underline hover:text-cgc-orange">business gifting team</Link>{' '}
          can also help with volume pricing.
        </p>
      </form>
    </div>
  );
}
