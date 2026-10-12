import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight, FileImage, Loader2, Printer, ShoppingCart, Trash2, UploadCloud,
} from 'lucide-react';
import type { ApcArtworkFile } from '../lib/api';
import { fetchProduct, money } from '../lib/api';
import { useApcPath } from '../lib/base';
import { useApcCart } from '../lib/cart';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export default function ProductPage() {
  const { code = '' } = useParams();
  const p = useApcPath();
  const navigate = useNavigate();
  const { add } = useApcCart();

  const { data, isLoading, error } = useQuery({
    queryKey: ['apc-product', code],
    queryFn: () => fetchProduct(code),
    enabled: Boolean(code),
  });
  const product = data?.product;
  const variants = useMemo(() => data?.variants ?? [], [data]);

  // selection: option group -> chosen value id (defaults to first value).
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const selection = useMemo(() => {
    const sel: Record<string, string> = {};
    for (const g of product?.option_groups ?? []) {
      sel[g.group] = overrides[g.group] || g.values[0]?.id || '';
    }
    return sel;
  }, [product, overrides]);

  const selectedKey = useMemo(
    () => Object.values(selection).filter(Boolean).sort().join('|'),
    [selection],
  );
  const variant = useMemo(
    () => variants.find((v) => v.option_key === selectedKey) || null,
    [variants, selectedKey],
  );

  const [qty, setQty] = useState(1);
  const [artwork, setArtwork] = useState<ApcArtworkFile[]>([]);
  const [uploadingSide, setUploadingSide] = useState<'front' | 'back' | null>(null);
  const frontInput = useRef<HTMLInputElement>(null);
  const backInput = useRef<HTMLInputElement>(null);

  const uploadSide = async (side: 'front' | 'back', file: File | undefined) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File too large (25MB max)');
      return;
    }
    setUploadingSide(side);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, filename: `apc-${code}-${side}-${file.name}` }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Upload failed');
      setArtwork((prev) => [...prev.filter((f) => f.side !== side), { side, url: body.url }]);
      toast.success(`${side === 'front' ? 'Front' : 'Back'} artwork uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingSide(null);
    }
  };

  const addToCart = () => {
    if (!product || !variant) return;
    if (!artwork.some((f) => f.side === 'front')) {
      toast.error('Upload your front artwork first — it’s what we print.');
      return;
    }
    const optionNames: Record<string, string> = {};
    for (const g of product.option_groups) {
      const chosen = g.values.find((v) => v.id === selection[g.group]);
      if (chosen) optionNames[g.group] = chosen.name;
    }
    add({
      code: product.code,
      name: product.name,
      optionKey: variant.option_key,
      options: optionNames,
      image: product.image_url,
      priceCents: variant.retail_cents,
      qty,
      artwork,
      note: '',
    });
    toast.success('Added to cart');
    navigate(p('/cart'));
  };

  if (isLoading) {
    return <div className="max-w-screen-xl mx-auto px-4 py-20 text-center text-apc-slate">Loading…</div>;
  }
  if (error || !product) {
    return (
      <div className="max-w-screen-xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-apc-ink">Product not found</h1>
        <Link to={p('/shop')} className="mt-4 inline-flex items-center gap-2 text-apc-blue font-bold">
          Back to shop <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );
  }

  const uploadBtn = 'flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-apc-paper-deep hover:border-apc-blue text-apc-charcoal px-4 py-4 text-sm font-semibold transition-colors w-full';

  return (
    <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-8">
      <Helmet><title>{product.name} — All Print Club</title></Helmet>

      <nav className="text-xs text-apc-slate" aria-label="Breadcrumb">
        <Link to={p('/shop')} className="hover:text-apc-blue">Shop</Link>
        {' / '}
        <Link to={`${p('/shop')}?category=${encodeURIComponent(product.category)}`} className="hover:text-apc-blue">
          {product.category}
        </Link>
        {' / '}
        <span className="text-apc-ink font-semibold">{product.name}</span>
      </nav>

      <div className="mt-6 grid lg:grid-cols-2 gap-10">
        {/* Visual */}
        <div className="rounded-2xl bg-apc-paper flex items-center justify-center aspect-[4/3] p-8">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="max-h-full max-w-full object-contain" />
          ) : (
            <div className="text-center text-apc-slate">
              <Printer className="h-16 w-16 mx-auto" aria-hidden />
              <p className="mt-3 text-sm font-semibold">{product.name}</p>
            </div>
          )}
        </div>

        {/* Configurator */}
        <div>
          <h1 className="font-display text-3xl font-bold text-apc-ink">{product.name}</h1>
          <p className="mt-2 text-apc-charcoal">{product.description}</p>

          <div className="mt-6 space-y-4">
            {product.option_groups.map((g) => (
              <div key={g.group}>
                <label htmlFor={`opt-${g.group}`} className="block text-sm font-bold text-apc-ink">
                  {g.group}
                </label>
                {g.values.length === 1 ? (
                  <div className="mt-1 text-sm text-apc-charcoal">{g.values[0]?.name}</div>
                ) : (
                  <select
                    id={`opt-${g.group}`}
                    value={selection[g.group]}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [g.group]: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-apc-paper-deep bg-white px-3 py-2.5 text-apc-ink focus:outline-none focus:ring-2 focus:ring-apc-blue"
                  >
                    {g.values.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>

          {/* Artwork */}
          <div className="mt-6">
            <div className="text-sm font-bold text-apc-ink">Your artwork</div>
            <p className="mt-1 text-xs text-apc-slate">
              Print-ready PDF, PNG or JPG. Front is required; add a back file for two-sided products.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              {(['front', 'back'] as const).map((side) => {
                const uploaded = artwork.find((f) => f.side === side);
                return (
                  <div key={side}>
                    <input
                      ref={side === 'front' ? frontInput : backInput}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      className="hidden"
                      onChange={(e) => uploadSide(side, e.target.files?.[0])}
                    />
                    {uploaded ? (
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-apc-blue/40 bg-apc-paper/60 px-3 py-3 text-sm">
                        <span className="flex items-center gap-2 font-semibold text-apc-ink min-w-0">
                          <FileImage className="h-4 w-4 shrink-0 text-apc-blue" aria-hidden />
                          <span className="truncate">{side === 'front' ? 'Front' : 'Back'} ✓</span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${side} artwork`}
                          onClick={() => setArtwork((prev) => prev.filter((f) => f.side !== side))}
                          className="text-apc-slate hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={uploadBtn}
                        disabled={uploadingSide === side}
                        onClick={() => (side === 'front' ? frontInput : backInput).current?.click()}
                      >
                        {uploadingSide === side
                          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          : <UploadCloud className="h-4 w-4" aria-hidden />}
                        {side === 'front' ? 'Upload front' : 'Upload back (optional)'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Price + add */}
          <div className="mt-7 rounded-xl border border-apc-paper-deep p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-apc-slate">Price for this run</span>
              <span className="text-2xl font-extrabold text-apc-ink">
                {variant ? money(variant.retail_cents) : '—'}
              </span>
            </div>
            {!variant && (
              <p className="mt-1 text-xs text-red-600">That combination isn’t available — try different options.</p>
            )}
            <div className="mt-4 flex items-center gap-3">
              <label htmlFor="apc-runs" className="text-sm font-bold text-apc-ink">Runs</label>
              <select
                id="apc-runs"
                value={qty}
                onChange={(e) => setQty(parseInt(e.target.value, 10))}
                className="rounded-lg border border-apc-paper-deep bg-white px-3 py-2 text-apc-ink focus:outline-none focus:ring-2 focus:ring-apc-blue"
              >
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <button
                type="button"
                onClick={addToCart}
                disabled={!variant}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-apc-blue hover:bg-apc-blue-dark text-white font-bold px-6 py-3.5 transition-colors disabled:opacity-50"
              >
                <ShoppingCart className="h-5 w-5" aria-hidden /> Add to Cart
              </button>
            </div>
            {variant && qty > 1 && (
              <p className="mt-2 text-xs text-apc-slate">
                {qty} runs × {money(variant.retail_cents)} = <strong>{money(variant.retail_cents * qty)}</strong>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
