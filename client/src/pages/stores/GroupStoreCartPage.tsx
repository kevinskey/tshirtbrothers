// Group store cart — review lines, change quantities, check out once.
//
// Before this page a store could only sell one item per checkout, so a
// family buying three shirts paid three shipping charges and the store
// got three separate orders to pack.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStoreSlug, storeLink, getStoreSubdomain } from '@/lib/storeSubdomain';
import { useStoreCart } from '@/lib/storeCart';
import { sizeUpchargeCents } from '@/lib/sizeUpcharges';
import Seo from '@/components/Seo';
import { Loader2, ArrowLeft, ShoppingBag, Trash2, Minus, Plus } from 'lucide-react';

interface StoreProfile {
  slug: string;
  name: string;
  brand_json: { logo_url?: string; primary_color?: string; demo?: boolean };
  fulfillment_mode: 'ship_only' | 'pickup_only' | 'both';
}

export default function GroupStoreCartPage() {
  const slug = useStoreSlug();
  const { items, setQty, remove, clear } = useStoreCart(slug);
  const [store, setStore] = useState<StoreProfile | null>(null);
  const [buyerEmail, setBuyerEmail] = useState('');
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/store-shop/${encodeURIComponent(slug)}`);
        if (!res.ok) return;
        const s = await res.json() as StoreProfile;
        if (!cancelled) setStore(s);
      } catch { /* the cart still renders without brand chrome */ }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const primary = store?.brand_json?.primary_color || '#111827';

  // Line prices include the size upcharge, exactly as the server will
  // charge them — a cart that disagrees with the Stripe page is worse
  // than no cart.
  const lineCents = (i: typeof items[number]) => (i.unit_cents + sizeUpchargeCents(i.size)) * i.qty;
  const subtotal = useMemo(() => items.reduce((s, i) => s + lineCents(i), 0), [items]);

  const checkout = async () => {
    if (items.length === 0 || checkingOut) return;
    setCheckingOut(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/create-store-cart-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_slug: slug,
          items: items.map((i) => ({
            product_slug: i.product_slug,
            qty: i.qty,
            variant: {
              ...(i.size ? { size: i.size } : {}),
              ...(i.color ? { color: i.color } : {}),
              fulfillment: i.fulfillment,
            },
          })),
          buyer_email: buyerEmail || undefined,
          success_url: `${window.location.origin}${getStoreSubdomain() ? '/success' : `/stores/${slug}/success`}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}${getStoreSubdomain() ? '/cart' : `/stores/${slug}/cart`}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (!data.checkoutUrl) throw new Error('No checkout URL returned');
      // Keep the cart until Stripe confirms — a buyer who backs out of
      // checkout should find their shirts still waiting.
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCheckingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title={`Cart — ${store?.name || 'Store'}`}
        description="Your cart"
        path={getStoreSubdomain() ? '/cart' : `/stores/${slug}/cart`}
        noindex
      />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to={storeLink(slug, '/')} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black mb-6">
          <ArrowLeft className="w-4 h-4" /> Keep shopping
        </Link>

        <h1 className="text-2xl font-bold text-gray-900 mb-5">Your cart</h1>

        {items.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <ShoppingBag className="w-10 h-10 mx-auto text-gray-300" />
            <p className="mt-3 text-gray-500">Your cart is empty.</p>
            <Link
              to={storeLink(slug, '/')}
              className="mt-5 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-white text-sm font-semibold"
              style={{ background: primary }}
            >
              Browse the store
            </Link>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
              {items.map((i, idx) => (
                <div key={`${i.product_slug}-${i.size}-${i.color}-${idx}`} className="flex items-center gap-4 p-4">
                  {i.image ? (
                    <img src={i.image} alt={i.title} className="w-16 h-16 rounded-lg object-cover border border-gray-200 bg-white shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-lg bg-gray-100 grid place-items-center shrink-0">
                      <ShoppingBag className="w-6 h-6 text-gray-300" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link to={storeLink(slug, `/product/${i.product_slug}`)} className="font-medium text-gray-900 hover:underline block truncate">
                      {i.title}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {[i.size && `Size ${i.size}`, i.color, i.fulfillment === 'pickup' ? 'Local pickup' : null]
                        .filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      ${((i.unit_cents + sizeUpchargeCents(i.size)) / 100).toFixed(2)} each
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setQty(idx, i.qty - 1)}
                      aria-label={`Decrease quantity of ${i.title}`}
                      className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-medium">{i.qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty(idx, i.qty + 1)}
                      aria-label={`Increase quantity of ${i.title}`}
                      className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="w-20 text-right font-semibold text-gray-900 shrink-0">
                    ${(lineCents(i) / 100).toFixed(2)}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    aria-label={`Remove ${i.title}`}
                    className="p-2 text-gray-400 hover:text-red-600 shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 mt-4 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold text-gray-900">${(subtotal / 100).toFixed(2)}</span>
              </div>
              <p className="text-xs text-gray-500 -mt-2">
                Shipping is calculated once for the whole order on the next page.
              </p>
              <div>
                <label htmlFor="cart-email" className="block text-xs font-medium text-gray-600 mb-1">
                  Email for your receipt (optional)
                </label>
                <input
                  id="cart-email"
                  type="email"
                  value={buyerEmail}
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
                />
              </div>
              {error && <div className="text-sm text-red-600">{error}</div>}
              <button
                type="button"
                onClick={checkout}
                disabled={checkingOut}
                className="w-full py-3 rounded-full text-white font-semibold shadow-sm hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                style={{ background: primary }}
              >
                {checkingOut ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to checkout…</>
                  : `Check out · $${(subtotal / 100).toFixed(2)}`}
              </button>
              <button
                type="button"
                onClick={clear}
                className="w-full text-xs text-gray-400 hover:text-gray-600"
              >
                Empty cart
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
