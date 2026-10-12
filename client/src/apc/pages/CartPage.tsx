import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';
import {
  ArrowRight, Loader2, Minus, Plus, ShoppingCart, Trash2,
} from 'lucide-react';
import { money, startCheckout } from '../lib/api';
import { useApcPath } from '../lib/base';
import { useApcCart } from '../lib/cart';

export default function CartPage() {
  const p = useApcPath();
  const { items, setQty, remove } = useApcCart();
  const [busy, setBusy] = useState(false);

  const subtotal = items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);

  const checkout = async () => {
    setBusy(true);
    try {
      const { checkoutUrl } = await startCheckout({
        items: items.map((i) => ({
          code: i.code,
          option_key: i.optionKey,
          qty: i.qty,
          artwork: i.artwork,
          note: i.note || undefined,
        })),
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
        <Helmet><title>Cart — All Print Club</title></Helmet>
        <ShoppingCart className="h-12 w-12 mx-auto text-apc-slate" aria-hidden />
        <h1 className="mt-4 text-2xl font-extrabold text-apc-ink">Your cart is empty</h1>
        <p className="mt-2 text-apc-slate">Pick a product and upload your artwork.</p>
        <Link to={p('/shop')} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-apc-blue hover:bg-apc-blue-dark text-white font-bold px-6 py-3.5">
          Shop All Products <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Helmet><title>Cart — All Print Club</title></Helmet>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-apc-ink mb-6">Cart</h1>

      <div className="grid lg:grid-cols-[1fr,320px] gap-8">
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.key} className="flex gap-4 rounded-xl border border-apc-paper-deep p-4">
              <div className="flex-1 min-w-0">
                <Link to={p(`/product/${encodeURIComponent(item.code)}`)}
                  className="font-semibold text-apc-ink hover:text-apc-blue">
                  {item.name}
                </Link>
                <p className="mt-1 text-xs text-apc-slate">
                  {Object.entries(item.options).map(([g, v]) => `${g}: ${v}`).join(' · ')}
                </p>
                <p className="mt-0.5 text-xs text-apc-slate">
                  Artwork: {item.artwork.map((f) => f.side).join(' + ') || 'none'}
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center rounded-full border border-apc-paper-deep">
                    <button type="button" aria-label="Fewer runs" disabled={item.qty <= 1}
                      onClick={() => setQty(item.key, item.qty - 1)}
                      className="p-2 text-apc-ink disabled:opacity-40">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-bold text-apc-ink">{item.qty}</span>
                    <button type="button" aria-label="More runs"
                      onClick={() => setQty(item.key, item.qty + 1)}
                      className="p-2 text-apc-ink">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-xs text-apc-slate">run{item.qty === 1 ? '' : 's'}</span>
                  <button type="button" onClick={() => remove(item.key)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-apc-slate hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove
                  </button>
                </div>
              </div>
              <div className="text-right font-bold text-apc-ink whitespace-nowrap">
                {money(item.priceCents * item.qty)}
              </div>
            </li>
          ))}
        </ul>

        <aside className="rounded-xl border border-apc-paper-deep p-5 h-fit lg:sticky lg:top-32">
          <h2 className="font-extrabold text-apc-ink text-lg">Order Summary</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-apc-slate">Subtotal</dt>
              <dd className="font-bold text-apc-ink">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-apc-slate">Shipping</dt>
              <dd className="text-apc-charcoal">Chosen at checkout</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={checkout}
            disabled={busy}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-apc-blue hover:bg-apc-blue-dark text-white font-bold px-6 py-3.5 transition-colors disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
            {busy ? 'Starting checkout…' : 'Checkout'}
          </button>
          <p className="mt-3 text-xs text-apc-slate">
            Secure card payment via Stripe. Free local pickup available in Fairburn, GA.
          </p>
        </aside>
      </div>
    </div>
  );
}
