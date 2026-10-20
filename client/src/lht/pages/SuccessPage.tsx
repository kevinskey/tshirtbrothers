import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useLhtPath } from '../lib/base';
import { useLhtCart } from '../lib/cart';

export default function SuccessPage() {
  const p = useLhtPath();
  const [params] = useSearchParams();
  const { clear } = useLhtCart();

  // Stripe only lands here after payment, so the bag is done.
  useEffect(() => {
    if (params.get('session_id')) clear();
  }, [params, clear]);

  return (
    <div className="bg-lht-ink text-lht-cream font-lht-sans min-h-[60vh] flex items-center">
      <Helmet><title>Order Confirmed — Live Hard Truth</title></Helmet>
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <CheckCircle2 className="h-14 w-14 mx-auto text-lht-cyan" aria-hidden />
        <h1 className="mt-5 font-lht-display uppercase text-3xl">Worn loud, coming soon</h1>
        <p className="mt-4 text-lht-cream/80">
          Your order is confirmed and a receipt is on its way to your email.
          Every piece is finished and shipped from Fairburn, GA — we'll email
          tracking as soon as it's on the move.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link to={p('/#shop')} className="inline-flex items-center gap-2 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors">
            Keep shopping <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link to={p('/truth')} className="inline-flex items-center border border-lht-cream/40 font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:border-lht-cyan hover:text-lht-cyan transition-colors">
            Find your Truth Color
          </Link>
        </div>
      </div>
    </div>
  );
}
