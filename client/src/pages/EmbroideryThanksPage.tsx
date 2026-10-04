// Post-payment landing for an embroidery request. Stripe's success_url
// points here with the request id + access token; the page confirms the fee
// landed (webhook race: payment can take a few seconds to register, hence
// the gentle poll) and tells the customer what happens next.
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import Seo from '@/components/Seo';
import { Check, Loader2 } from 'lucide-react';

interface RequestStatus {
  id: number;
  status: string;
  digitization_paid_at: string | null;
  stitch_count: number | null;
  quote_cents: number | null;
}

export default function EmbroideryThanksPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') || '';
  const [req, setReq] = useState<RequestStatus | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/embroidery/requests/${id}/status?t=${encodeURIComponent(token)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setReq(data);
      } catch { /* poll will retry */ }
    };
    load();
    // Webhook race: Stripe redirects before checkout.session.completed is
    // processed, so "awaiting_payment" right after paying is normal for a
    // few seconds. Poll briefly rather than alarming anyone.
    if (!req?.digitization_paid_at && tries < 10) {
      const t = setTimeout(() => setTries((n) => n + 1), 2000);
      return () => { cancelled = true; clearTimeout(t); };
    }
    return () => { cancelled = true; };
  }, [id, token, tries, req?.digitization_paid_at]);

  const paid = !!req?.digitization_paid_at;

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <Seo path="/embroidery/thanks" title="Embroidery Request Received — T-Shirt Brothers" description="Your digitization is underway." />
      {paid ? (
        <>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <Check className="h-7 w-7 text-green-600" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold">You&rsquo;re in the queue</h1>
          <p className="mt-3 text-sm text-gray-600">
            Digitization fee received for request #{req?.id}. We&rsquo;re converting
            your artwork into a stitch file now — your quote (stitching + garment)
            will land in your inbox as soon as it&rsquo;s done. A receipt is on the
            way from Stripe.
          </p>
        </>
      ) : (
        <>
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-gray-400" aria-hidden />
          <h1 className="text-xl font-semibold">Confirming your payment…</h1>
          <p className="mt-3 text-sm text-gray-600">
            This usually takes a few seconds. If this page doesn&rsquo;t update,
            your card was still charged only once — email us and we&rsquo;ll sort it.
          </p>
        </>
      )}
      <Link to="/" className="mt-8 inline-block text-sm text-gray-500 underline">Back to T-Shirt Brothers</Link>
    </div>
  );
}
