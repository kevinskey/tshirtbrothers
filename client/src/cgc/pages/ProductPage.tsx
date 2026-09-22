import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Heart, Loader2, Minus, Plus, ShoppingBag, Upload } from 'lucide-react';
import { fetchConfig, fetchProduct, money } from '../lib/api';
import type { CgcPersonalization } from '../lib/api';
import ProductCard from '../components/ProductCard';
import { useCgcPath } from '../lib/base';
import { useCgcCart } from '../lib/cart';
import { useCgcFavorites } from '../lib/favorites';

// Engraving-friendly fonts already loaded by the app shell (index.html).
const FONTS = ['Inter', 'Space Grotesk', 'Fraunces', 'Caveat'];

export default function ProductPage() {
  const { sku = '' } = useParams();
  const p = useCgcPath();
  const { add } = useCgcCart();
  const { has, toggle } = useCgcFavorites();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cgc-product', sku],
    queryFn: () => fetchProduct(sku),
  });
  const { data: config } = useQuery({ queryKey: ['cgc-config'], queryFn: fetchConfig });

  const [qty, setQty] = useState(1);
  const [personalize, setPersonalize] = useState(false);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [font, setFont] = useState<string>(FONTS[0] ?? 'Inter');
  const [notes, setNotes] = useState('');
  const [artUrl, setArtUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [added, setAdded] = useState(false);

  const product = data?.product;
  const feeCents = config?.personalization_fee_cents ?? 1000;

  const personalization: CgcPersonalization | null = useMemo(() => {
    if (!personalize) return null;
    const lines = [line1, line2].map((l) => l.trim()).filter(Boolean);
    if (!lines.length && !notes.trim() && !artUrl) return null;
    return { lines, font, notes: notes.trim(), artUrl };
  }, [personalize, line1, line2, font, notes, artUrl]);

  const unitCents = product
    ? product.retail_price_cents + (personalization ? feeCents : 0)
    : 0;

  const uploadArt = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, filename: `cgc-${sku}-${file.name}` }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Upload failed');
      setArtUrl(body.url);
      toast.success('Artwork uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const addToBag = () => {
    if (!product) return;
    add({
      sku: product.sku,
      name: product.name.trim(),
      image: product.image_url,
      priceCents: unitCents,
      qty,
      personalization,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
    toast.success('Added to your bag');
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cgc-orange" aria-label="Loading product" />
      </div>
    );
  }
  if (isError || !product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-lg font-semibold text-cgc-ink">We couldn’t find that product.</p>
        <Link to={p('/shop')} className="mt-4 inline-flex rounded-lg bg-cgc-orange text-white font-bold px-6 py-3">
          Shop All Products
        </Link>
      </div>
    );
  }

  const fav = has(product.sku);
  const previewText = [line1, line2].map((l) => l.trim()).filter(Boolean).join('\n');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <Helmet><title>{`${product.name.trim()} — Custom Gift Club`}</title></Helmet>

      <nav className="text-sm text-cgc-stone mb-4" aria-label="Breadcrumb">
        <Link to={p('/')} className="hover:text-cgc-orange">Home</Link>
        <span aria-hidden> / </span>
        {product.cgc_category && (
          <>
            <Link to={`${p('/shop')}?category=${encodeURIComponent(product.cgc_category)}`} className="hover:text-cgc-orange">
              {product.cgc_category}
            </Link>
            <span aria-hidden> / </span>
          </>
        )}
        <span className="text-cgc-ink font-medium">{product.sku}</span>
      </nav>

      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Image + engraving preview overlay */}
        <div className="relative rounded-2xl bg-cgc-cream p-8 flex items-center justify-center min-h-[320px] lg:min-h-[480px]">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="max-h-[420px] max-w-full object-contain mix-blend-multiply" />
          ) : (
            <span className="text-cgc-stone">No image available</span>
          )}
          {personalize && previewText && (
            <div
              className="absolute inset-x-6 bottom-6 text-center text-cgc-ink/80 whitespace-pre-line pointer-events-none text-xl"
              style={{ fontFamily: `${font}, sans-serif` }}
              aria-hidden
            >
              {previewText}
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-cgc-ink">{product.name.trim()}</h1>
          <p className="mt-1 text-sm text-cgc-stone">SKU {product.sku}</p>
          <p className="mt-4 text-2xl font-extrabold text-cgc-ink">
            {money(unitCents)}
            {personalization && (
              <span className="ml-2 text-sm font-medium text-cgc-stone">
                (includes {money(feeCents)} personalization)
              </span>
            )}
          </p>
          {product.description && (
            <p className="mt-4 text-cgc-charcoal">{product.description}</p>
          )}

          {/* Blank vs personalized — explicit, honest states */}
          <fieldset className="mt-6">
            <legend className="text-sm font-bold uppercase tracking-wide text-cgc-ink mb-2">How would you like it?</legend>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPersonalize(false)}
                aria-pressed={!personalize}
                className={`rounded-xl border-2 p-3 text-left text-sm font-semibold transition-colors ${!personalize ? 'border-cgc-orange bg-cgc-cream text-cgc-ink' : 'border-cgc-cream-deep text-cgc-charcoal hover:border-cgc-stone'}`}
              >
                Blank (undecorated)
                <span className="block font-normal text-xs mt-1 text-cgc-stone">Ships as pictured, no markings</span>
              </button>
              <button
                type="button"
                onClick={() => setPersonalize(true)}
                aria-pressed={personalize}
                className={`rounded-xl border-2 p-3 text-left text-sm font-semibold transition-colors ${personalize ? 'border-cgc-orange bg-cgc-cream text-cgc-ink' : 'border-cgc-cream-deep text-cgc-charcoal hover:border-cgc-stone'}`}
              >
                Personalized (+{money(feeCents)})
                <span className="block font-normal text-xs mt-1 text-cgc-stone">Your text or artwork, added by our shop</span>
              </button>
            </div>
          </fieldset>

          {personalize && (
            <div className="mt-4 space-y-3 rounded-xl border border-cgc-cream-deep p-4">
              <div>
                <label htmlFor="pz-line1" className="block text-sm font-semibold text-cgc-ink mb-1">Line 1</label>
                <input id="pz-line1" type="text" maxLength={60} value={line1} onChange={(e) => setLine1(e.target.value)}
                  placeholder="Name, date, or short message"
                  className="w-full rounded-lg border border-cgc-cream-deep px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-cgc-orange" />
              </div>
              <div>
                <label htmlFor="pz-line2" className="block text-sm font-semibold text-cgc-ink mb-1">Line 2 (optional)</label>
                <input id="pz-line2" type="text" maxLength={60} value={line2} onChange={(e) => setLine2(e.target.value)}
                  className="w-full rounded-lg border border-cgc-cream-deep px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-cgc-orange" />
              </div>
              <div>
                <label htmlFor="pz-font" className="block text-sm font-semibold text-cgc-ink mb-1">Font</label>
                <select id="pz-font" value={font} onChange={(e) => setFont(e.target.value)}
                  className="w-full rounded-lg border border-cgc-cream-deep px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-cgc-orange"
                  style={{ fontFamily: `${font}, sans-serif` }}>
                  {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pz-art" className="block text-sm font-semibold text-cgc-ink mb-1">
                  Artwork or logo (optional)
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-cgc-cream-deep px-4 py-2.5 text-sm font-semibold text-cgc-charcoal cursor-pointer hover:bg-cgc-cream">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                  {artUrl ? 'Replace artwork' : 'Upload image'}
                  <input id="pz-art" type="file" accept="image/*" className="sr-only"
                    onChange={(e) => e.target.files?.[0] && uploadArt(e.target.files[0])} />
                </label>
                {artUrl && (
                  <span className="ml-3 inline-flex items-center gap-1 text-sm text-green-700">
                    <Check className="h-4 w-4" aria-hidden /> Artwork attached
                  </span>
                )}
              </div>
              <div>
                <label htmlFor="pz-notes" className="block text-sm font-semibold text-cgc-ink mb-1">
                  Placement notes (optional)
                </label>
                <textarea id="pz-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Where should it go? Anything we should know?"
                  className="w-full rounded-lg border border-cgc-cream-deep px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-cgc-orange" />
              </div>
              <p className="text-xs text-cgc-stone">
                We match the decoration method to the product (laser engraving, sublimation, or UV print)
                and email a proof if anything needs a decision before production.
              </p>
            </div>
          )}

          {/* Qty + actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-full border border-cgc-cream-deep">
              <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="p-3 text-cgc-ink disabled:opacity-40" disabled={qty <= 1}>
                <Minus className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-bold text-cgc-ink" aria-live="polite">{qty}</span>
              <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => Math.min(100, q + 1))}
                className="p-3 text-cgc-ink">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={addToBag}
              className="flex-1 min-w-[200px] inline-flex items-center justify-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3.5 transition-colors"
            >
              {added ? <Check className="h-5 w-5" aria-hidden /> : <ShoppingBag className="h-5 w-5" aria-hidden />}
              {added ? 'Added!' : `Add to Bag — ${money(unitCents * qty)}`}
            </button>
            <button
              type="button"
              onClick={() => toggle(product.sku)}
              aria-pressed={fav}
              aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
              className="p-3.5 rounded-lg border-2 border-cgc-cream-deep hover:border-cgc-orange transition-colors"
            >
              <Heart className={`h-5 w-5 ${fav ? 'fill-cgc-orange text-cgc-orange' : 'text-cgc-ink'}`} />
            </button>
          </div>

          <p className="mt-4 text-sm text-cgc-stone">
            Want full design control?{' '}
            <a href="https://tshirtbrothers.com/design" target="_blank" rel="noopener noreferrer" className="font-semibold text-cgc-orange hover:text-cgc-orange-dark">
              Open this in the Design Studio
            </a>{' '}
            for advanced artwork and live preview.
          </p>
        </div>
      </div>

      {data.related.length > 0 && (
        <section className="mt-14" aria-labelledby="related-heading">
          <h2 id="related-heading" className="text-xl font-extrabold tracking-tight text-cgc-ink mb-4">
            You might also like
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.related.slice(0, 4).map((r) => <ProductCard key={r.sku} product={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}
