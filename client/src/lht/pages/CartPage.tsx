import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { startCartCheckout } from '../lib/api';
import { usd } from '../lib/catalog';
import { sizeUpchargeCents } from '@/lib/sizeUpcharges';
import { useLhtBase, useLhtPath } from '../lib/base';
import { useLhtCart } from '../lib/cart';

export default function CartPage() {
  const p = useLhtPath();
  const base = useLhtBase();
  const { items, setQty, remove, subtotalCents } = useLhtCart();
  const [email, setEmail] = useState('');
  const [paying, setPaying] = useState(false);

  const upchargeTotal = items.reduce(
    (n, i) => n + (i.size ? sizeUpchargeCents(i.size) : 0) * i.qty, 0,
  );

  const checkout = async () => {
    if (!items.length) return;
    setPaying(true);
    try {
      const origin = window.location.origin;
      const { checkoutUrl } = await startCartCheckout({
        items: items.map((i) => ({
          product_slug: i.productSlug,
          qty: i.qty,
          variant: {
            fulfillment: 'ship' as const,
            ...(i.size ? { size: i.size } : {}),
            ...(i.color ? { color: i.color } : {}),
          },
        })),
        buyer_email: email.trim() || undefined,
        success_url: `${origin}${base}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}${base}/cart`,
      });
      window.location.href = checkoutUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Checkout failed — please try again.');
      setPaying(false);
    }
  };

  return (
    <div className="bg-lht-ink text-lht-cream font-lht-sans min-h-[60vh]">
      <Helmet><title>Your Bag — Live Hard Truth</title></Helmet>
      <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-12">
        <h1 className="font-lht-display uppercase text-3xl">Your bag</h1>

        {items.length === 0 ? (
          <div className="mt-10">
            <p className="text-lht-stone">Your bag is empty.</p>
            <Link to={p('/#shop')} className="mt-6 inline-flex items-center gap-2 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors">
              Shop the collection <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr,340px] items-start">
            <ul className="divide-y divide-lht-cream/10 border-y border-lht-cream/10">
              {items.map((i) => (
                <li key={i.key} className="py-5 flex gap-4">
                  {i.image && (
                    <Link to={p(`/product/${encodeURIComponent(i.productSlug)}`)} className="shrink-0">
                      <img src={i.image} alt={i.title} className="h-24 w-24 object-cover border border-lht-cream/10" />
                    </Link>
                  )}
                  <div className="flex-1 min-w-0">
                    <Link to={p(`/product/${encodeURIComponent(i.productSlug)}`)} className="font-lht-display uppercase text-sm hover:text-lht-cyan">
                      {i.title}
                    </Link>
                    <p className="mt-1 text-xs text-lht-stone">
                      {[i.color, i.size].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-3 inline-flex items-center border border-lht-cream/25 text-sm">
                      <button type="button" aria-label="Decrease quantity" onClick={() => setQty(i.key, i.qty - 1)} className="px-3 py-1.5 hover:text-lht-cyan">−</button>
                      <span className="px-3 py-1.5 min-w-[2.5rem] text-center">{i.qty}</span>
                      <button type="button" aria-label="Increase quantity" onClick={() => setQty(i.key, i.qty + 1)} className="px-3 py-1.5 hover:text-lht-cyan">+</button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p>{usd((i.unitCents + (i.size ? sizeUpchargeCents(i.size) : 0)) * i.qty)}</p>
                    <button type="button" onClick={() => remove(i.key)} aria-label={`Remove ${i.title}`} className="mt-3 text-lht-stone hover:text-lht-cyan">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <aside className="border border-lht-cream/15 p-6">
              <h2 className="font-lht-display uppercase text-lg">Summary</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-lht-stone">Subtotal</dt><dd>{usd(subtotalCents + upchargeTotal)}</dd></div>
                <div className="flex justify-between"><dt className="text-lht-stone">Shipping</dt><dd>Calculated at checkout</dd></div>
              </dl>
              <label htmlFor="lht-cart-email" className="block mt-6 text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">
                Email for your receipt (optional)
              </label>
              <input
                id="lht-cart-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-2 w-full bg-transparent border border-lht-cream/25 px-4 py-2.5 text-sm placeholder:text-lht-cream/40 focus:border-lht-cyan focus:outline-none"
              />
              <button
                type="button"
                onClick={checkout}
                disabled={paying}
                className="mt-6 w-full bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors disabled:opacity-60"
              >
                {paying ? 'Opening checkout…' : 'Check out'}
              </button>
              <p className="mt-3 text-xs text-lht-stone">Secure checkout by Stripe.</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
