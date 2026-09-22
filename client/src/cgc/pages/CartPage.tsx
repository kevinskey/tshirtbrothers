import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';
import { ArrowRight, Loader2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { money, startCheckout } from '../lib/api';
import { useCgcBase, useCgcPath } from '../lib/base';
import { useCgcCart } from '../lib/cart';

export default function CartPage() {
  const p = useCgcPath();
  const base = useCgcBase();
  const { items, setQty, remove } = useCgcCart();
  const [busy, setBusy] = useState(false);

  const subtotal = items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);

  const checkout = async () => {
    setBusy(true);
    try {
      const origin = window.location.origin;
      const { checkoutUrl } = await startCheckout({
        items: items.map((i) => ({ sku: i.sku, qty: i.qty, personalization: i.personalization })),
        success_url: `${origin}${base}/success`,
        cancel_url: `${origin}${base}/cart`,
      });
      window.location.href = checkoutUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed');
      setBusy(false);
    }
  };

  if (!items.length) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <Helmet><title>Shopping Bag — Custom Gift Club</title></Helmet>
        <ShoppingBag className="h-12 w-12 mx-auto text-cgc-stone" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold text-cgc-ink">Your bag is empty</h1>
        <p className="mt-2 text-cgc-stone">Find something worth keeping.</p>
        <Link to={p('/shop')} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3.5">
          Shop All Products <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Helmet><title>Shopping Bag — Custom Gift Club</title></Helmet>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-cgc-ink mb-6">Shopping Bag</h1>

      <div className="grid lg:grid-cols-[1fr,320px] gap-8">
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.key} className="flex gap-4 rounded-xl border border-cgc-cream-deep p-4">
              <Link to={p(`/product/${encodeURIComponent(item.sku)}`)} className="shrink-0">
                <div className="h-24 w-24 rounded-lg bg-cgc-cream flex items-center justify-center p-2">
                  {item.image
                    ? <img src={item.image} alt="" className="max-h-full max-w-full object-contain mix-blend-multiply" />
                    : <ShoppingBag className="h-6 w-6 text-cgc-stone" aria-hidden />}
                </div>
              </Link>
              <div className="flex-1 min-w-0">
                <Link to={p(`/product/${encodeURIComponent(item.sku)}`)}
                  className="font-semibold text-cgc-ink hover:text-cgc-orange line-clamp-2">
                  {item.name}
                </Link>
                {item.personalization ? (
                  <p className="mt-1 text-xs text-cgc-stone">
                    Personalized{item.personalization.lines.length ? `: “${item.personalization.lines.join(' / ')}”` : ''}
                    {item.personalization.font ? ` · ${item.personalization.font}` : ''}
                    {item.personalization.artUrl ? ' · artwork attached' : ''}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-cgc-stone">Blank (undecorated)</p>
                )}
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center rounded-full border border-cgc-cream-deep">
                    <button type="button" aria-label="Decrease quantity" disabled={item.qty <= 1}
                      onClick={() => setQty(item.key, item.qty - 1)}
                      className="p-2 text-cgc-ink disabled:opacity-40">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-cgc-ink">{item.qty}</span>
                    <button type="button" aria-label="Increase quantity"
                      onClick={() => setQty(item.key, item.qty + 1)}
                      className="p-2 text-cgc-ink">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button type="button" onClick={() => remove(item.key)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-cgc-stone hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                  </button>
                </div>
              </div>
              <div className="text-right font-bold text-cgc-ink whitespace-nowrap">
                {money(item.priceCents * item.qty)}
              </div>
            </li>
          ))}
        </ul>

        <aside className="rounded-xl border border-cgc-cream-deep p-5 h-fit lg:sticky lg:top-32">
          <h2 className="font-extrabold text-cgc-ink text-lg">Order Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-cgc-stone">Subtotal</dt>
              <dd className="font-bold text-cgc-ink">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-cgc-stone">Shipping</dt>
              <dd className="text-cgc-charcoal">Chosen at checkout</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={checkout}
            disabled={busy}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3.5 transition-colors disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            {busy ? 'Starting checkout…' : 'Checkout'}
          </button>
          <p className="mt-3 text-xs text-cgc-stone">
            Secure card payment via Stripe. Free local pickup available in Fairburn, GA.
          </p>
        </aside>
      </div>
    </div>
  );
}
