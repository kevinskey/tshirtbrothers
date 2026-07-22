// Post-checkout success page for a franchise store buyer. Stripe
// redirects here with ?session_id=<cs_...>. We don't need to do
// anything server-side (the webhook already captured the order) —
// this page just shows a confirmation + link back to the store.
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Seo from '@/components/Seo';
import { CheckCircle2 } from 'lucide-react';

export default function StoreSuccessPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <Seo title="Order confirmed" description="Your order has been received." path={`/store/${slug}/success`} />
      <div className="max-w-md w-full bg-white rounded-lg border border-gray-200 p-8 text-center">
        <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-500" />
        <h1 className="text-2xl font-bold mt-4">Thank you for your order</h1>
        <p className="text-gray-600 mt-2">
          You'll receive a receipt by email shortly. Your item will ship in 5-10 business days.
        </p>
        {sessionId && (
          <p className="text-xs text-gray-400 mt-4">
            Reference: <code>{sessionId.slice(0, 20)}…</code>
          </p>
        )}
        <Link
          to={`/store/${slug}`}
          className="mt-6 inline-block bg-gray-900 text-white text-sm font-semibold px-5 py-2 rounded-md hover:bg-gray-800"
        >
          Back to store
        </Link>
      </div>
    </div>
  );
}
