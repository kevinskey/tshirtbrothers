// Post-checkout success page for a franchise store buyer. Stripe
// redirects here with ?session_id=<cs_...>. We don't need to do
// anything server-side (the webhook already captured the order) —
// this page just shows a confirmation + link back to the store.
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import Seo from '@/components/Seo';
import { CheckCircle2 } from 'lucide-react';
import { getStoreSubdomain, useStoreSlug } from '@/lib/storeSubdomain';
import StoreMark from '@/components/stores/StoreMark';
import PoweredByFooter from '@/components/stores/PoweredByFooter';

interface StoreBrand {
  name: string;
  brand_json: { logo_url?: string; primary_color?: string; footer_note?: string };
}

export default function StoreSuccessPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const location = useLocation();
  const sessionId = params.get('session_id');
  // This page serves three route shapes: /store/:slug/success (franchise),
  // /stores/:slug/success (group/business), and /success on a store
  // subdomain — send the buyer back to the storefront they came from.
  const backTo = getStoreSubdomain()
    ? '/'
    : location.pathname.startsWith('/stores/') ? `/stores/${slug}` : `/store/${slug}`;

  // Brand the receipt page like the store it came from. The confirmation
  // renders fine without it; the chrome just fills in once it arrives.
  const shopSlug = useStoreSlug();
  const [store, setStore] = useState<StoreBrand | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/store-shop/${encodeURIComponent(shopSlug)}`);
        if (!res.ok) return;
        const s = await res.json() as StoreBrand;
        if (!cancelled) setStore(s);
      } catch { /* unbranded confirmation is still a confirmation */ }
    })();
    return () => { cancelled = true; };
  }, [shopSlug]);
  const primary = store?.brand_json.primary_color || '#111827';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Seo title="Order confirmed" description="Your order has been received." path={`/store/${slug}/success`} />
      {store && (
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
            <StoreMark name={store.name} logoUrl={store.brand_json.logo_url} color={primary} size="sm" />
            <Link to={backTo} className="font-bold text-lg truncate" style={{ color: primary }}>{store.name}</Link>
          </div>
        </header>
      )}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
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
          to={backTo}
          className="mt-6 inline-block text-white text-sm font-semibold px-5 py-2 rounded-md hover:opacity-90"
          style={{ background: primary }}
        >
          Back to store
        </Link>
      </div>
      </div>
      <PoweredByFooter storeName={store?.name} logoUrl={store?.brand_json.logo_url} color={primary}
        note={store?.brand_json.footer_note} />
    </div>
  );
}
