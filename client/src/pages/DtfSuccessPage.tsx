// Post-checkout thank-you page for the DTF gang sheet store. Stripe
// redirects here as /dtf/success?order=<id> (see server/routes/
// gangsheetStore.js's success_url). Kept deliberately dumb per spec: no
// auth, no data fetch — the order number is display-only, and the tier
// promise text (if present) comes from a same-browser sessionStorage
// stash DtfStorePage writes right before the Stripe redirect, not from
// the network.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

const STASH_KEY = 'dtf_last_order';

type StashedOrderMeta = { promise?: string };

function readStashedPromise(): string | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StashedOrderMeta;
    return typeof parsed.promise === 'string' && parsed.promise.length > 0 ? parsed.promise : null;
  } catch {
    return null;
  }
}

export default function DtfSuccessPage() {
  const [params] = useSearchParams();
  const orderId = params.get('order');
  // Lazy initializer reads the stash once, synchronously, before the
  // clear-up effect below runs.
  const [promise] = useState<string | null>(() => readStashedPromise());

  useEffect(() => {
    try { sessionStorage.removeItem(STASH_KEY); } catch { /* private mode etc. — non-fatal */ }
  }, []);

  return (
    <Layout>
      <Seo
        title="Order Received · TShirt Brothers DTF Store"
        description="Your DTF gang sheet order was received."
        path="/dtf/success"
        noindex
      />
      <main className="container mx-auto max-w-lg px-4 py-16">
        <div className="rounded-2xl border-2 border-gray-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-14 w-14 text-orange-600" />
          <h1 className="mt-4 font-display text-2xl font-bold text-gray-900">
            Payment received{orderId ? ` — order #${orderId}` : ''}
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            We emailed your confirmation.{promise ? ` ${promise}.` : ''}
          </p>
          <Link
            to="/dtf"
            className="mt-6 inline-block rounded-xl bg-orange-600 px-6 py-3 text-sm font-bold text-white hover:bg-orange-700 transition"
          >
            Start another order
          </Link>
        </div>
      </main>
    </Layout>
  );
}
