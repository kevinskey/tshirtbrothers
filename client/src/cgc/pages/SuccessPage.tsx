import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useCgcPath } from '../lib/base';
import { useCgcCart } from '../lib/cart';

export default function SuccessPage() {
  const p = useCgcPath();
  const [params] = useSearchParams();
  const { clear } = useCgcCart();

  // The Stripe session only lands here after payment, so the bag is done.
  useEffect(() => {
    if (params.get('session_id')) clear();
  }, [params, clear]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <Helmet><title>Order Confirmed — Custom Gift Club</title></Helmet>
      <CheckCircle2 className="h-14 w-14 mx-auto text-cgc-orange" aria-hidden />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-cgc-ink">Thank you!</h1>
      <p className="mt-3 text-cgc-charcoal">
        Your order is confirmed and a receipt is on its way to your email.
        Personalized pieces go straight to our shop — we’ll reach out if
        anything about your engraving needs a decision.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to={p('/shop')} className="inline-flex items-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3.5">
          Keep Shopping <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link to={p('/account')} className="inline-flex items-center rounded-lg border-2 border-cgc-ink text-cgc-ink font-bold px-6 py-3.5 hover:bg-cgc-ink hover:text-white transition-colors">
          View My Orders
        </Link>
      </div>
    </div>
  );
}
