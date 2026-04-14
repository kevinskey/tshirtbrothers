import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';

interface PublicMockup {
  id: number;
  name: string | null;
  status: string;
  customer_name: string | null;
  product_name: string | null;
  product_image_url: string | null;
  graphic_url: string | null;
  placement: { x: number; y: number; width: number; rotation?: number } | null;
  preview_image_url: string | null;
  notes: string | null;
  created_at: string;
}

export default function MockupApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const [mockup, setMockup] = useState<PublicMockup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState<null | 'approved' | 'rejected'>(null);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/mockup/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Mockup link invalid or expired');
        return r.json();
      })
      .then(setMockup)
      .catch((e) => setError(e?.message || 'Failed to load mockup'));
  }, [token]);

  async function respond(action: 'approved' | 'rejected') {
    if (!token || submitting) return;
    setSubmitting(action);
    try {
      const res = await fetch(`/api/mockup/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: note || undefined }),
      });
      if (!res.ok) throw new Error('Failed to submit');
      setDone(action);
    } catch (e: any) {
      setError(e?.message || 'Failed to submit');
    } finally {
      setSubmitting(null);
    }
  }

  if (error) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
          <XCircle className="w-16 h-16 text-red-500 mb-4" />
          <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Mockup Not Found</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </Layout>
    );
  }

  if (!mockup) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      </Layout>
    );
  }

  const placement = mockup.placement || { x: 35, y: 30, width: 30 };
  const alreadyResponded = ['approved', 'rejected', 'converted_to_quote'].includes(mockup.status);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Mockup Approval</h1>
        <p className="text-sm text-gray-500 mb-6">
          {mockup.customer_name ? `Hi ${mockup.customer_name}, ` : ''}please take a look at your mockup below and let us know if it's approved.
        </p>

        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          {mockup.preview_image_url ? (
            <img src={mockup.preview_image_url} alt={mockup.name || 'Mockup'} className="w-full rounded-lg" />
          ) : (
            <div className="relative inline-block w-full">
              {mockup.product_image_url && (
                <img src={mockup.product_image_url} alt={mockup.product_name || 'Product'} className="w-full rounded-lg" />
              )}
              {mockup.graphic_url && (
                <img
                  src={mockup.graphic_url}
                  alt="Your design"
                  className="absolute"
                  style={{
                    left: `${placement.x}%`,
                    top: `${placement.y}%`,
                    width: `${placement.width}%`,
                    transform: placement.rotation ? `rotate(${placement.rotation}deg)` : undefined,
                  }}
                />
              )}
            </div>
          )}
          {mockup.product_name && (
            <p className="mt-3 text-sm text-gray-600"><span className="font-medium">Product:</span> {mockup.product_name}</p>
          )}
          {mockup.notes && (
            <p className="mt-1 text-sm text-gray-600"><span className="font-medium">Notes:</span> {mockup.notes}</p>
          )}
        </div>

        {done || alreadyResponded ? (
          <div className={`rounded-xl p-6 text-center ${done === 'approved' || mockup.status === 'approved' ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
            {done === 'approved' || mockup.status === 'approved' ? (
              <>
                <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-2" />
                <p className="text-lg font-semibold text-green-900">Approved — thank you!</p>
                <p className="text-sm text-green-700 mt-1">We'll start on your order right away.</p>
              </>
            ) : (
              <>
                <XCircle className="w-12 h-12 text-gray-500 mx-auto mb-2" />
                <p className="text-lg font-semibold text-gray-900">Response recorded</p>
                <p className="text-sm text-gray-600 mt-1">We'll be in touch shortly.</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional — especially helpful if requesting changes)"
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
            />
            <div className="flex gap-3">
              <button
                onClick={() => respond('rejected')}
                disabled={!!submitting}
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {submitting === 'rejected' ? 'Submitting…' : 'Request Changes'}
              </button>
              <button
                onClick={() => respond('approved')}
                disabled={!!submitting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {submitting === 'approved' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Approve Mockup
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
