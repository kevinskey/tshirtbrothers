// Single-product detail page for a franchise store. Variant picker + Buy
// button that hits /api/payments/create-store-checkout and redirects the
// buyer to the Stripe Checkout URL.
//
// Whitelabel header matches StoreFrontPage. No auth — this is public.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '@/components/Seo';
import { Loader2, ArrowLeft, ShoppingBag } from 'lucide-react';

interface StoreProfile {
  slug: string;
  name: string;
  brand_json: {
    logo_url?: string;
    primary_color?: string;
    back_url?: string;
    footer_note?: string;
  };
}

interface StoreProduct {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  retail_price_cents: number;
  variants_json: { sizes?: string[]; colors?: string[] };
  opens_at: string | null;
  closes_at: string | null;
}

export default function StoreProductPage() {
  const { slug = '', productSlug = '' } = useParams<{ slug: string; productSlug: string }>();
  const [store, setStore]     = useState<StoreProfile | null>(null);
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [size, setSize] = useState<string>('');
  const [color, setColor] = useState<string>('');
  const [qty, setQty] = useState<number>(1);
  const [buyerEmail, setBuyerEmail] = useState<string>('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sRes, pRes] = await Promise.all([
          fetch(`/api/store-shop/${encodeURIComponent(slug)}`),
          fetch(`/api/store-shop/${encodeURIComponent(slug)}/product/${encodeURIComponent(productSlug)}`),
        ]);
        if (sRes.status === 404 || pRes.status === 404) {
          if (!cancelled) setNotFound(true); return;
        }
        if (!sRes.ok) throw new Error(`store ${sRes.status}`);
        if (!pRes.ok) throw new Error(`product ${pRes.status}`);
        const s = await sRes.json() as StoreProfile;
        const p = await pRes.json() as StoreProduct;
        if (cancelled) return;
        setStore(s);
        setProduct(p);
        // Preselect first size/color for convenience.
        const firstSize = p.variants_json.sizes?.[0];
        const firstColor = p.variants_json.colors?.[0];
        if (firstSize) setSize(firstSize);
        if (firstColor) setColor(firstColor);
      } catch (err) {
        console.error('[StoreProductPage] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, productSlug]);

  const primary = store?.brand_json.primary_color || '#111827';

  const canCheckout = useMemo(() => {
    if (!product) return false;
    if (product.variants_json.sizes?.length && !size) return false;
    if (product.variants_json.colors?.length && !color) return false;
    if (qty < 1) return false;
    return true;
  }, [product, size, color, qty]);

  const checkout = async () => {
    if (!product || !canCheckout || checkingOut) return;
    setCheckingOut(true);
    setError(null);
    try {
      const variant: Record<string, string> = {};
      if (size) variant.size = size;
      if (color) variant.color = color;
      const res = await fetch('/api/payments/create-store-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_slug: slug,
          product_slug: productSlug,
          qty,
          variant,
          buyer_email: buyerEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.checkoutUrl) throw new Error('No checkout URL returned');
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (notFound || !store || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="text-center">
          <ShoppingBag className="w-12 h-12 mx-auto text-gray-300" />
          <h1 className="text-xl font-semibold mt-4">Product not found</h1>
          <Link to={`/store/${slug}`} className="mt-4 inline-block text-sm text-gray-500 hover:text-gray-900">← Back to store</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title={`${product.title} · ${store.name}`}
        description={product.description || `${product.title} — ${store.name}. Fulfilled by TShirt Brothers.`}
        path={`/store/${slug}/product/${productSlug}`}
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          {store.brand_json.logo_url && (
            <img src={store.brand_json.logo_url} alt="" className="h-10 w-10 object-contain" />
          )}
          <Link to={`/store/${slug}`} className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate" style={{ color: primary }}>{store.name}</h1>
          </Link>
        </div>
      </header>

      {/* Detail */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <Link to={`/store/${slug}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to store
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="aspect-square bg-gray-100">
              {product.cover_image ? (
                <img src={product.cover_image} alt={product.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ShoppingBag className="w-16 h-16 text-gray-300" />
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-gray-900">{product.title}</h2>
            <p className="text-2xl mt-2" style={{ color: primary }}>
              ${(product.retail_price_cents / 100).toFixed(2)}
            </p>
            {product.description && (
              <p className="text-gray-600 mt-4 whitespace-pre-wrap">{product.description}</p>
            )}

            <div className="mt-6 space-y-4">
              {product.variants_json.sizes?.length ? (
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Size</label>
                  <div className="flex flex-wrap gap-2">
                    {product.variants_json.sizes.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSize(s)}
                        className={`px-3 py-1.5 border rounded-md text-sm ${
                          size === s ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-500'
                        }`}
                      >{s}</button>
                    ))}
                  </div>
                </div>
              ) : null}

              {product.variants_json.colors?.length ? (
                <div>
                  <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {product.variants_json.colors.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        className={`px-3 py-1.5 border rounded-md text-sm ${
                          color === c ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-500'
                        }`}
                      >{c}</button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                  className="w-24 border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Email (for receipt)</label>
                <input
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            {error && (
              <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                {error}
              </div>
            )}

            <button
              onClick={checkout}
              disabled={!canCheckout || checkingOut}
              className="mt-6 w-full py-3 rounded-md text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: primary }}
            >
              {checkingOut ? 'Redirecting to checkout…' : `Buy for $${((product.retail_price_cents * qty) / 100).toFixed(2)}`}
            </button>

            <p className="mt-3 text-xs text-gray-500 text-center">
              Payment via Stripe. {store.brand_json.footer_note || 'Fulfilled by TShirt Brothers.'}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
