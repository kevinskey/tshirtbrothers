import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { CheckCircle2, XCircle, Loader2, Download } from 'lucide-react';

// Cross-origin images (DO Spaces) ignore the <a download> attribute, so
// route through our same-origin image proxy and save the blob. Falls back
// to opening the image in a new tab if anything fails.
async function downloadImage(url: string, filename: string) {
  try {
    const r = await fetch(`/api/products/image-proxy?url=${encodeURIComponent(url)}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const blob = await r.blob();
    const obj = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = obj;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(obj);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

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
  preview_image_url_back: string | null;
  preview_image_url_sleeve: string | null;
  preview_image_url_sleeve_left: string | null;
  notes: string | null;
  created_at: string;
  /**
   * Every mockup attached to the same quote, the tokened one included.
   * A quote can carry several garments and each can be printed on more than
   * one side, so approval has to show the whole set — the link only names
   * where the conversation started.
   */
  mockups?: PublicMockup[];
  quote_id?: number | null;
  /** The order itself — what the proofs are for. */
  quote?: QuoteProductData | null;
}

interface QuoteLine {
  product_name: string | null;
  color: string | null;
  sizes: string | null;
  quantity: number | null;
  print_areas: string | null;
  unit_price: number | null;
  line_total: number | null;
  notes: string | null;
}

interface QuoteProductData {
  estimated_price: number | null;
  deposit_amount: number | null;
  status: string | null;
  product_name: string | null;
  quantity: number | null;
  items: QuoteLine[];
}

const money = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
    : null;

/** The printed sides of one mockup, in the order a shop proofs them. */
function sidesOf(m: PublicMockup): Array<{ url: string; label: string }> {
  return [
    { url: m.preview_image_url, label: 'Front' },
    { url: m.preview_image_url_back, label: 'Back' },
    { url: m.preview_image_url_sleeve, label: 'Right Sleeve' },
    { url: m.preview_image_url_sleeve_left, label: 'Left Sleeve' },
  ].filter((v): v is { url: string; label: string } => Boolean(v.url));
}

// The changes the shop actually gets asked for. Tapping one is a shortcut,
// not a substitute for the written detail — the note is required either way.
const REVISION_REASONS = [
  'Size or placement',
  'Colors',
  'Spelling or wording',
  'Wrong artwork',
  'Product or garment color',
  'Something else',
];

export default function MockupApprovalPage() {
  const { token } = useParams<{ token: string }>();
  const [mockup, setMockup] = useState<PublicMockup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState<null | 'approved' | 'rejected'>(null);
  const [done, setDone] = useState<'approved' | 'rejected' | null>(null);
  // "Request Changes" opens its own panel rather than submitting straight
  // away: a rejection with no detail costs a phone call before anyone can
  // redraw, so the note is required on that path (optional on approve).
  const [revising, setRevising] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);

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

  // The shop reads one field, so the tapped categories ride in front of the
  // customer's own words rather than in a parallel column nobody opens.
  function composeNote(action: 'approved' | 'rejected') {
    const text = note.trim();
    if (action === 'approved') return text || undefined;
    return reasons.length > 0 ? `${reasons.join(', ')} — ${text}` : text;
  }

  async function respond(action: 'approved' | 'rejected') {
    if (!token || submitting) return;
    if (action === 'rejected' && !note.trim()) return;
    setSubmitting(action);
    try {
      const res = await fetch(`/api/mockup/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: composeNote(action) }),
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
  // Fall back to the single mockup for links created before the approval
  // view understood sets.
  const allMockups = mockup.mockups?.length ? mockup.mockups : [mockup];
  const totalSides = allMockups.reduce((sum, m) => sum + sidesOf(m).length, 0);
  const alreadyResponded = ['approved', 'rejected', 'converted_to_quote'].includes(mockup.status);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-3xl font-display font-bold text-gray-900 mb-2">Mockup Approval</h1>
        <p className="text-sm text-gray-500 mb-6">
          {mockup.customer_name ? `Hi ${mockup.customer_name}, ` : ''}
          {allMockups.length > 1
            ? `please review all ${allMockups.length} mockups below — every printed side is shown — and let us know if they're approved.`
            : "please take a look at your mockup below and let us know if it's approved."}
        </p>

        {allMockups.map((m, index) => {
          const sides = sidesOf(m);
          return (
            <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
              {allMockups.length > 1 && (
                <p className="mb-3 text-sm font-semibold text-gray-900">
                  Mockup {index + 1} of {allMockups.length}
                  {m.name ? <span className="font-normal text-gray-600"> — {m.name}</span> : null}
                </p>
              )}

              {sides.length > 0 ? (
                sides.map((v, i) => (
                  <div key={v.label} className={i === 0 ? '' : 'mt-4'}>
                    <img
                      src={v.url}
                      alt={`${m.name || 'Mockup'} - ${v.label}`}
                      className="w-full rounded-lg"
                    />
                    {/* Label even a lone side: on a multi-garment proof the
                        customer needs to know which side they are signing off. */}
                    <p className="mt-2 text-center text-xs uppercase tracking-wide text-gray-400">{v.label}</p>
                  </div>
                ))
              ) : (
                <div className="relative inline-block w-full">
                  {m.product_image_url && (
                    <img src={m.product_image_url} alt={m.product_name || 'Product'} className="w-full rounded-lg" />
                  )}
                  {m.graphic_url && (
                    <img
                      src={m.graphic_url}
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

              {sides.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {sides.map((v) => (
                    <button
                      key={v.label}
                      type="button"
                      onClick={() => downloadImage(
                        v.url,
                        `${(m.name || 'mockup').replace(/[^a-zA-Z0-9-_ ]/g, '')}-${v.label.toLowerCase().replace(/ /g, '-')}.png`,
                      )}
                      className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Download className="w-4 h-4" />
                      {sides.length > 1 ? v.label : 'Download Mockup'}
                    </button>
                  ))}
                </div>
              )}
              {m.product_name && (
                <p className="mt-3 text-sm text-gray-600"><span className="font-medium">Product:</span> {m.product_name}</p>
              )}
              {m.notes && (
                <p className="mt-1 text-sm text-gray-600"><span className="font-medium">Notes:</span> {m.notes}</p>
              )}
            </div>
          );
        })}

        {allMockups.length > 1 && (
          <p className="-mt-2 mb-6 text-xs text-gray-500">
            Approving covers all {allMockups.length} mockups ({totalSides} print locations) on this order.
          </p>
        )}

        {/* What the proofs are for. A customer should never be asked to
            approve artwork without being shown the garments, quantities and
            price they are approving alongside it. */}
        {mockup.quote && mockup.quote.items.length > 0 && (
          <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Your Order
            </div>
            <ul className="divide-y divide-gray-100">
              {mockup.quote.items.map((line, i) => {
                // Colour, sizes and print areas are often folded into the
                // description instead of their own columns, so only the ones
                // actually filled in get shown.
                const details = [
                  line.color ? `Color: ${line.color}` : null,
                  line.sizes ? `Sizes: ${line.sizes}` : null,
                  line.print_areas ? `Print: ${line.print_areas}` : null,
                ].filter(Boolean);
                return (
                  <li key={i} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">{line.product_name || 'Item'}</p>
                      {details.length > 0 && (
                        <p className="mt-0.5 text-xs text-gray-500">{details.join(' · ')}</p>
                      )}
                      {line.notes && <p className="mt-0.5 text-xs text-gray-500">{line.notes}</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      {line.quantity != null && (
                        <p className="text-sm text-gray-900">Qty {line.quantity}</p>
                      )}
                      {money(line.unit_price) && (
                        <p className="text-xs text-gray-500">{money(line.unit_price)} ea</p>
                      )}
                      {money(line.line_total) && (
                        <p className="text-xs font-medium text-gray-700">{money(line.line_total)}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {money(mockup.quote.estimated_price) && (
              <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2">
                <span className="text-sm font-semibold text-gray-700">Quote total</span>
                <span className="text-sm font-semibold text-gray-900">{money(mockup.quote.estimated_price)}</span>
              </div>
            )}
            {/* A TSB quote total is tax-inclusive, so say so rather than
                leaving the customer to wonder what gets added later. Nothing
                is said about payment here: some of these customers have
                already paid a deposit. */}
            <p className="px-4 pb-3 pt-2 text-[11px] text-gray-400">
              Total includes tax. Approving the mockups doesn't charge anything.
            </p>
          </div>
        )}

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
            {revising ? (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-gray-900">What needs to change?</p>
                <div className="flex flex-wrap gap-2">
                  {REVISION_REASONS.map((r) => {
                    const on = reasons.includes(r);
                    return (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setReasons((prev) => (on ? prev.filter((x) => x !== r) : [...prev, r]))}
                        className={`px-3 py-1.5 rounded-full border text-xs font-medium ${
                          on
                            ? 'bg-orange-600 border-orange-600 text-white'
                            : 'bg-white border-gray-300 text-gray-700 hover:border-orange-400'
                        }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  autoFocus
                  placeholder="Tell us exactly what to change — the more specific, the faster we can turn it around. Example: “Make the logo on the front about 2 inches smaller and move it up; the back is perfect.”"
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
                <p className="text-xs text-gray-500">
                  {note.trim()
                    ? 'Thanks — this goes straight to the shop.'
                    : 'Please describe the change so we can redraw it without calling you.'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setRevising(false); setNote(''); setReasons([]); }}
                    disabled={!!submitting}
                    className="px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => respond('rejected')}
                    disabled={!!submitting || !note.trim()}
                    className="flex-1 px-4 py-3 rounded-lg text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting === 'rejected' ? 'Submitting…' : 'Send Change Request'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add a note (optional)"
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setRevising(true)}
                    disabled={!!submitting}
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Request Changes
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
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
