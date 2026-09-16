import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { XCircle, CheckCircle2, Loader2 } from 'lucide-react';

// Landing page for the "Decline this quote" link in the price email.
// Token-gated server-side; a decline archives the quote and tells the shop.
export default function QuoteDeclinePage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decline() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes/decline/${id}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to decline the quote');
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
          <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
          <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Quote Declined</h1>
          <p className="text-gray-500 max-w-md mb-6">
            Thanks for letting us know — we won't follow up on this one. If anything changes,
            we'd love another shot at your business.
          </p>
          <Link to="/quote" className="inline-flex items-center justify-center bg-orange-700 hover:bg-orange-800 text-white font-semibold px-6 py-2.5 rounded-lg">
            Start a New Quote
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <h1 className="text-xl font-display font-bold text-gray-900 mb-2">Decline Quote #{id}?</h1>
          <p className="text-sm text-gray-500 mb-4">
            No hard feelings — but if you tell us why, it helps us do better.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional: too pricey, timeline, went another way…"
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          <button
            onClick={decline}
            disabled={submitting}
            className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold rounded-lg mb-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Decline This Quote'}
          </button>
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 underline">
            Never mind — keep my quote open
          </Link>
        </div>
      </div>
    </Layout>
  );
}
