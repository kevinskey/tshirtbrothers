// Embroidery Quote — the customer path for stitched work (Kevin, 2026-10-03).
//
// Embroidery cannot be instant-quoted the way screen printing can: price is
// driven by STITCH COUNT, and stitch count only exists after the artwork is
// digitized. So this page collects the request and gates on the $25
// digitization fee via Stripe Checkout; the quote is a human reply after
// digitizing, priced off the Lighthouse sheet x house markup server-side.
//
// Garments: "get them from us" opens a live picker over the real catalog
// (/api/products) — multiple products per request, and EACH product carries
// its own placement, stitch size and quantity (Kevin: "let user choose
// multiple products if they want and each product could have different
// placement"). "I'll bring my own" collapses to a single placement block.
//
// Branding mirrors EasyQuotePage's Shell: warm gradient, tsb-splat watermark
// and logo, display font, orange accents — this is a front-door page, not an
// internal form.
import { useEffect, useRef, useState } from 'react';
import Seo from '@/components/Seo';
import { Loader2, Search, Upload, Check, AlertTriangle, X, Plus } from 'lucide-react';

const PLACEMENTS = [
  { key: 'left_chest',  label: 'Left chest' },
  { key: 'right_chest', label: 'Right chest' },
  { key: 'full_back',   label: 'Full back' },
  { key: 'hat_front',   label: 'Hat front' },
  { key: 'sleeve',      label: 'Sleeve' },
  { key: 'other',       label: 'Somewhere else' },
] as const;
type PlacementKey = typeof PLACEMENTS[number]['key'];

interface CatalogProduct {
  id: number;
  name: string;
  style_number: string | null;
  image_url: string | null;
}

interface ColorOption { name: string; hex: string | null; image: string | null }

interface GarmentItem {
  productId: number | null;
  productName: string | null;
  styleNumber: string | null;
  imageUrl: string | null;
  placement: PlacementKey;
  placementNote: string;
  desiredSize: string;
  quantity: string; // single-qty fallback when the catalog has no size list
  // Garment color + size breakdown (Kevin, 2026-10-03: "this also has no
  // size or colors"). sizeCounts holds per-size quantities as text; the
  // real quantity is their sum when any are filled. availableColors/Sizes
  // are client-only option lists fetched per product — stripped at submit.
  color: string;
  sizeCounts: Record<string, string>;
  availableColors: ColorOption[];
  availableSizes: string[];
  optionsLoading: boolean;
}

const SIZE_HINT: Record<PlacementKey, string> = {
  left_chest: '3.5" wide is typical',
  right_chest: '3.5" wide is typical',
  full_back: '10–12" wide is typical',
  hat_front: '2.25" tall is typical',
  sleeve: '2–3" wide is typical',
  other: 'tell us the size',
};

function newItem(p?: CatalogProduct): GarmentItem {
  return {
    productId: p?.id ?? null,
    productName: p?.name ?? null,
    styleNumber: p?.style_number ?? null,
    imageUrl: p?.image_url ?? null,
    placement: 'left_chest',
    placementNote: '',
    desiredSize: '',
    quantity: '1',
    color: '',
    sizeCounts: {},
    availableColors: [],
    availableSizes: [],
    optionsLoading: false,
  };
}

/** Pieces in one item: the size breakdown when any size is filled, else the
 *  flat qty field. */
function itemQty(it: GarmentItem): number {
  const sized = Object.values(it.sizeCounts).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
  return sized > 0 ? sized : (parseInt(it.quantity, 10) || 0);
}

/** Contact the visitor already gave us elsewhere this tab (the Easy Quote
 *  wizard writes tsb_contact_draft as they type), with the long-lived known
 *  email as a fallback. */
function knownContact(): { name: string; email: string; phone: string } {
  let name = '', email = '', phone = '';
  try {
    const draft = JSON.parse(sessionStorage.getItem('tsb_contact_draft') || 'null');
    if (draft) { name = draft.name || ''; email = draft.email || ''; phone = draft.phone || ''; }
  } catch { /* corrupt draft — fall through */ }
  try {
    if (!email) email = localStorage.getItem('tsb_known_email') || '';
  } catch { /* private mode */ }
  return { name, email, phone };
}

export default function EmbroideryQuotePage() {
  const prefill = useRef(knownContact()).current;
  const [name, setName] = useState(prefill.name);
  const [email, setEmail] = useState(prefill.email);
  const [phone, setPhone] = useState(prefill.phone);
  // Came over from the wizard with a usable identity? Show it as a one-line
  // confirmation instead of three empty-looking fields they already filled.
  const [editingContact, setEditingContact] = useState(
    !(prefill.name.trim() && /\S+@\S+\.\S+/.test(prefill.email)),
  );
  const [garmentMode, setGarmentMode] = useState<'tsb' | 'own' | null>(null);
  const [items, setItems] = useState<GarmentItem[]>([]);
  const [notes, setNotes] = useState('');

  // Catalog picker.
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<CatalogProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSeq = useRef(0);
  useEffect(() => {
    const q = productQuery.trim();
    if (garmentMode !== 'tsb' || q.length < 2) { setProductResults([]); setSearching(false); return; }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=8`);
        const data = await res.json();
        if (seq !== searchSeq.current) return;
        setProductResults(data.products ?? []);
      } catch { if (seq === searchSeq.current) setProductResults([]); }
      finally { if (seq === searchSeq.current) setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [productQuery, garmentMode]);

  const addProduct = (p: CatalogProduct) => {
    const idx = items.length;
    setItems((prev) => [...prev, { ...newItem(p), optionsLoading: true }]);
    setProductQuery('');
    setProductResults([]);
    // Colors/sizes live behind the product's S&S style id, which the list
    // endpoint doesn't carry — detail first, then options. Best-effort: a
    // product with no options just keeps the flat qty field.
    (async () => {
      try {
        const detail = await fetch(`/api/products/${p.id}`).then((r) => r.json());
        const ssId = detail?.ss_id;
        if (!ssId) throw new Error('no ss_id');
        const opts = await fetch(`/api/products/colors/${ssId}`).then((r) => r.json());
        setItems((prev) => prev.map((it, j) => (j === idx ? {
          ...it,
          availableColors: opts.colors ?? [],
          availableSizes: opts.sizes ?? [],
          optionsLoading: false,
        } : it)));
      } catch {
        setItems((prev) => prev.map((it, j) => (j === idx ? { ...it, optionsLoading: false } : it)));
      }
    })();
  };
  const updateItem = (i: number, patch: Partial<GarmentItem>) =>
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, j) => j !== i));

  const pickMode = (mode: 'tsb' | 'own') => {
    setGarmentMode(mode);
    // Own-garment requests are one placement block; from-us starts empty
    // until a product is picked.
    setItems(mode === 'own' ? [newItem()] : []);
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [preview, setPreview] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { setError('That file is over 20 MB — email it to us instead.'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      setImageBase64(result);
      setPreview(result);
      setFileName(f.name);
      setError(null);
    };
    reader.readAsDataURL(f);
  };

  const itemsValid = items.length > 0 && items.every((it) =>
    itemQty(it) >= 1
    && it.desiredSize.trim()
    && (it.placement !== 'other' || it.placementNote.trim())
    && (garmentMode !== 'tsb' || it.productName)
    && (it.availableColors.length === 0 || it.color));

  const canSubmit =
    name.trim() && /\S+@\S+\.\S+/.test(email) && imageBase64 && garmentMode && itemsValid;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/embroidery/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), email: email.trim(), phone: phone.trim() || undefined,
          imageBase64, filename: fileName || undefined,
          garmentMode,
          items: items.map((it) => {
            const sizes = Object.fromEntries(
              Object.entries(it.sizeCounts)
                .map(([k, v]) => [k, parseInt(v, 10) || 0])
                .filter(([, v]) => (v as number) > 0),
            );
            return {
              productId: it.productId, productName: it.productName,
              styleNumber: it.styleNumber, imageUrl: it.imageUrl,
              placement: it.placement, placementNote: it.placementNote.trim() || undefined,
              desiredSize: it.desiredSize.trim(),
              color: it.color || undefined,
              sizes: Object.keys(sizes).length > 0 ? sizes : undefined,
              quantity: itemQty(it),
            };
          }),
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      window.location.href = data.checkoutUrl;
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/60 focus:border-orange-400';
  const labelCls = 'block text-sm font-bold text-gray-900 mb-1.5';
  const totalPieces = items.reduce((s, it) => s + itemQty(it), 0);

  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg,#fff7ed 0%,#f7f4ee 100%)' }}
    >
      <Seo
        path="/embroidery"
        title="Embroidery Quote — T-Shirt Brothers"
        description="Upload your logo for custom embroidery. $25 digitization, then a stitch-count quote on polos, hats, jackets and more."
      />
      {/* Faint oversized splat watermark — same device as the quote wizard. */}
      <img
        src="/tsb-splat.png" alt="" aria-hidden
        className="pointer-events-none select-none absolute -right-40 -bottom-40 w-[42rem] max-w-none opacity-[0.05] rotate-12 hidden sm:block"
      />

      <div className="relative mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src="/tsb-splat.png" alt="T-Shirt Brothers" className="w-36 sm:w-44" />
          <h1 className="tsb-font-display mt-3 text-3xl font-black text-gray-900">Embroidery Quote</h1>
          <p className="mt-1 text-xs font-medium text-gray-500">
            Atlanta&rsquo;s custom t-shirt shop · (470) 622-1392
          </p>
          <p className="mt-3 text-sm leading-relaxed text-gray-600">
            Embroidery is priced by <strong>stitch count</strong>, and we only know the
            stitch count after your artwork is <strong>digitized</strong> — converted
            into a stitch file a machine can sew. Digitization is a one-time{' '}
            <strong className="text-orange-600">$25</strong>. Pay it here, we digitize,
            and your quote lands in your inbox: stitching + your garments. The stitch
            file is yours to keep.
          </p>
        </div>

        <div className="space-y-6 sm:rounded-3xl sm:border sm:border-orange-100 sm:bg-white sm:p-8 sm:shadow-2xl">
          {/* Artwork */}
          <section>
            <label className={labelCls}>1. Your artwork</label>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-orange-200 bg-orange-50/40 px-4 py-6 text-sm text-gray-600 transition-colors hover:border-orange-400"
            >
              {preview ? (
                <>
                  <img src={preview} alt="Your artwork" className="h-16 w-16 rounded bg-white object-contain" />
                  <span className="min-w-0 truncate">{fileName} — tap to change</span>
                  <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5 text-orange-500" aria-hidden />
                  Upload your logo or design (PNG/JPG, up to 20 MB)
                </>
              )}
            </button>
            <input
              ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </section>

          {/* Garment mode */}
          <section>
            <span className={labelCls}>2. The garments</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button" onClick={() => pickMode('tsb')}
                className={`rounded-xl border-2 px-3 py-3 text-left text-sm transition-all ${
                  garmentMode === 'tsb' ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-gray-200 bg-white hover:border-gray-400'
                }`}
              >
                <span className="block font-bold">Get them from us</span>
                <span className="block text-xs text-gray-500">
                  Pick from our catalog — polos, hats, jackets, hoodies
                </span>
              </button>
              <button
                type="button" onClick={() => pickMode('own')}
                className={`rounded-xl border-2 px-3 py-3 text-left text-sm transition-all ${
                  garmentMode === 'own' ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-gray-200 bg-white hover:border-gray-400'
                }`}
              >
                <span className="block font-bold">I&rsquo;ll bring my own</span>
                <span className="block text-xs text-gray-500">
                  You supply the garments, we stitch them
                </span>
              </button>
            </div>

            {/* Catalog picker — tsb mode */}
            {garmentMode === 'tsb' && (
              <div className="mt-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                  <input
                    type="text" value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Search our catalog — Gildan, polo, beanie, 18500…"
                    className={`${inputCls} pl-9`}
                    aria-label="Search products"
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-gray-400" aria-hidden />}
                </div>
                {productResults.length > 0 && (
                  <ul className="mt-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                    {productResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button" onClick={() => addProduct(p)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-orange-50"
                        >
                          {p.image_url
                            ? <img src={p.image_url} alt="" className="h-9 w-9 rounded object-contain bg-gray-50" />
                            : <span className="h-9 w-9 rounded bg-gray-100" />}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{p.name}</span>
                            {p.style_number && <span className="block text-xs text-gray-500">Style {p.style_number}</span>}
                          </span>
                          <Plus className="h-4 w-4 shrink-0 text-orange-500" aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>

          {/* Per-item configuration */}
          {items.length > 0 && (
            <section className="space-y-3">
              <span className={labelCls}>
                3. {garmentMode === 'own' ? 'Where does it go?' : 'Your picks — placement for each'}
              </span>
              {items.map((it, i) => (
                <div key={i} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-start gap-3">
                    {garmentMode === 'tsb' && (
                      it.imageUrl
                        ? <img src={it.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded object-contain bg-gray-50" />
                        : <span className="h-12 w-12 shrink-0 rounded bg-gray-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      {garmentMode === 'tsb' && (
                        <p className="truncate text-sm font-semibold">
                          {it.productName}
                          {it.styleNumber && <span className="ml-1 font-normal text-gray-500">· {it.styleNumber}</span>}
                        </p>
                      )}
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <label className="text-xs font-medium text-gray-600">
                          Placement
                          <select
                            value={it.placement}
                            onChange={(e) => updateItem(i, { placement: e.target.value as PlacementKey })}
                            className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          >
                            {PLACEMENTS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                          </select>
                        </label>
                        <label className="text-xs font-medium text-gray-600">
                          Stitch size
                          <input
                            type="text" value={it.desiredSize}
                            onChange={(e) => updateItem(i, { desiredSize: e.target.value })}
                            placeholder={SIZE_HINT[it.placement]}
                            className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                        {it.availableSizes.length === 0 ? (
                          <label className="text-xs font-medium text-gray-600">
                            Qty
                            <input
                              type="number" min={1} max={999} value={it.quantity}
                              onChange={(e) => updateItem(i, { quantity: e.target.value })}
                              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            />
                          </label>
                        ) : (
                          <span className="self-end pb-1.5 text-xs text-gray-500">{itemQty(it)} pc{itemQty(it) === 1 ? '' : 's'} via sizes</span>
                        )}
                        {it.placement === 'other' && (
                          <label className="col-span-2 text-xs font-medium text-gray-600 sm:col-span-1">
                            Where?
                            <input
                              type="text" value={it.placementNote}
                              onChange={(e) => updateItem(i, { placementNote: e.target.value })}
                              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                            />
                          </label>
                        )}
                      </div>

                      {it.optionsLoading && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> loading colors &amp; sizes…
                        </p>
                      )}

                      {/* Garment color — picking one also swaps the product
                          photo to that colorway. */}
                      {it.availableColors.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs font-medium text-gray-600">
                            Color{it.color ? <> — <strong>{it.color}</strong></> : ''}
                          </span>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {it.availableColors.map((c) => (
                              <button
                                key={c.name} type="button" title={c.name}
                                aria-label={`Color ${c.name}`} aria-pressed={it.color === c.name}
                                onClick={() => updateItem(i, { color: c.name, imageUrl: c.image || it.imageUrl })}
                                className={`h-7 w-7 rounded-full border-2 transition-transform ${
                                  it.color === c.name ? 'scale-110 border-orange-500' : 'border-gray-200 hover:border-gray-400'
                                }`}
                                style={{ background: c.hex || '#ddd' }}
                              />
                            ))}
                          </div>
                          {!it.color && <p className="mt-1 text-[11px] text-amber-600">Pick a color.</p>}
                        </div>
                      )}

                      {/* Size breakdown — per-size counts; the Qty field above
                          is the fallback for products with no size list. */}
                      {it.availableSizes.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs font-medium text-gray-600">Sizes</span>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {it.availableSizes.map((sz) => (
                              <label key={sz} className="flex items-center gap-1 text-xs text-gray-600">
                                {sz}
                                <input
                                  type="number" min={0} max={999}
                                  value={it.sizeCounts[sz] ?? ''}
                                  onChange={(e) => updateItem(i, { sizeCounts: { ...it.sizeCounts, [sz]: e.target.value } })}
                                  placeholder="0"
                                  className="w-14 rounded border border-gray-300 px-1.5 py-1 text-sm"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {garmentMode === 'tsb' && (
                      <button
                        type="button" onClick={() => removeItem(i)}
                        aria-label={`Remove ${it.productName ?? 'item'}`}
                        className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {garmentMode === 'tsb' && (
                <p className="text-xs text-gray-500">
                  {totalPieces} piece{totalPieces === 1 ? '' : 's'} total — pricing drops at 2, 6, 24, 72, 144 and 500. Over 1,000, call us.
                </p>
              )}
            </section>
          )}

          {/* Contact — collapsed to a confirmation line when the visitor
              already identified themselves in the quote wizard this tab. */}
          {editingContact ? (
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="emb-name" className={labelCls}>Name</label>
                <input id="emb-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="emb-email" className={labelCls}>Email</label>
                <input id="emb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" />
              </div>
              <div>
                <label htmlFor="emb-phone" className={labelCls}>Phone (optional)</label>
                <input id="emb-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} autoComplete="tel" />
              </div>
            </section>
          ) : (
            <section className="flex items-center justify-between gap-3 rounded-lg bg-orange-50/60 px-3 py-2.5">
              <p className="min-w-0 truncate text-sm text-gray-700">
                Quoting for <strong>{name}</strong> · {email}{phone ? ` · ${phone}` : ''}
              </p>
              <button
                type="button" onClick={() => setEditingContact(true)}
                className="shrink-0 text-xs font-semibold text-orange-600 underline underline-offset-2"
              >
                Not you? Edit
              </button>
            </section>
          )}

          <section>
            <label htmlFor="emb-notes" className={labelCls}>Anything else? (optional)</label>
            <textarea
              id="emb-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} className={inputCls} placeholder="Thread colors, deadline, names to monogram…"
            />
          </section>

          {error && (
            <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
            </p>
          )}

          <button
            type="button" onClick={submit} disabled={!canSubmit || submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-6 py-4 text-base font-bold text-white shadow-lg transition-colors hover:bg-orange-700 disabled:opacity-40"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            {submitting ? 'Heading to checkout…' : 'Pay $25 digitization & get my quote'}
          </button>
          <p className="text-center text-xs text-gray-500">
            Secure checkout by Stripe. After payment we digitize your art and email
            your quote — no stitching happens until you approve it.
          </p>

          {/* The fine print — mirrors our production terms so nobody is
              surprised later. */}
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-500">
            <p><strong>Turnaround:</strong> standard production is 5–7 business days. Rush available — 4 days +25%, 2–3 days +50%, next day +75%, same day +100% (subject to availability).</p>
            <p className="mt-1"><strong>Your own garments:</strong> you assume liability for workmanship on supplied goods; please allow up to 2% for spoilage. Spoilage beyond 2% is credited.</p>
            <p className="mt-1"><strong>Artwork:</strong> best formats are .ai, .cdr, .eps; .jpg/.tiff/.bmp accepted. Art that isn&rsquo;t camera-ready may incur art charges at $40/hr — we&rsquo;ll tell you before any of that happens.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
