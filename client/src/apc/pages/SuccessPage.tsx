import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useApcPath } from '../lib/base';
import { useApcCart } from '../lib/cart';

export default function SuccessPage() {
  const p = useApcPath();
  const [params] = useSearchParams();
  const { clear } = useApcCart();

  // The Stripe session only lands here after payment, so the cart is done.
  useEffect(() => {
    if (params.get('session_id')) clear();
  }, [params, clear]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <Helmet><title>Order Confirmed — All Print Club</title></Helmet>
      <CheckCircle2 className="h-14 w-14 mx-auto text-apc-blue" aria-hidden />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-apc-ink">Order confirmed!</h1>
      <p className="mt-3 text-apc-charcoal">
        A receipt is on its way to your email. Your files go straight into
        prepress — we’ll reach out if anything about your artwork needs a
        decision before it prints.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to={p('/shop')} className="inline-flex items-center gap-2 rounded-lg bg-apc-blue hover:bg-apc-blue-dark text-white font-bold px-6 py-3.5">
          Keep Shopping <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <Link to={p('/account')} className="inline-flex items-center rounded-lg border-2 border-apc-ink text-apc-ink font-bold px-6 py-3.5 hover:bg-apc-ink hover:text-white transition-colors">
          View My Orders
        </Link>
      </div>
    </div>
  );
}
