// One storefront order, as a pack slip.
//
// Clicking a store order on the dashboard used to land on the DTF queue
// (every non-quote row did), and nothing in the admin ever showed the
// ship-to address — it only existed inside the Stripe session. This page
// is what the shop needs to actually fill the order: who, what sizes,
// where it's going, and the button that advances it.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Printer, Copy, Store as StoreIcon, Mail, Truck, ExternalLink } from 'lucide-react';
import {
  fetchAdminStoreOrder, updateStoreOrderStatus, setStoreOrderTracking,
  fetchStoreOrderRates, buyStoreOrderLabel,
  type AdminStoreOrderDetail, type ShippingRate,
} from '@/lib/api';
import { slipCouponHtml } from '@/lib/packingSlip';

const usd = (cents: number | null | undefined) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`);

const TSB_LOGO = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png';

// These four are the only values store_orders_status_check allows.
const NEXT_STEP: Record<string, { next: AdminStoreOrderDetail['status']; label: string } | undefined> = {
  paid: { next: 'printing', label: 'Start printing' },
  printing: { next: 'shipped', label: 'Mark shipped' },
  shipped: { next: 'delivered', label: 'Mark delivered' },
};

function addressLines(a: AdminStoreOrderDetail['shipping_address']): string[] {
  if (!a) return [];
  return [
    a.name,
    a.line1,
    a.line2,
    [a.city, a.state, a.postal_code].filter(Boolean).join(', '),
    a.country && a.country !== 'US' ? a.country : null,
    a.phone,
  ].filter((l): l is string => !!l && l.trim() !== '');
}


/** The sheet that goes in the box.
 *
 *  Print-only, and deliberately a different document from the admin screen:
 *  the screen carries the split and TSB's margin, and printing the screen
 *  put "Sensory Seasons's share $12.00 / TSB $19.95" in a customer's parcel.
 *  Nothing on this slip is internal. It is branded for the store the buyer
 *  actually bought from, thanks them for supporting that organization, and
 *  carries the TSB mark as the maker, not the seller.
 */
function PackingSlip({ order, ship, isPickup, brandColor, storeLogo }: {
  order: AdminStoreOrderDetail;
  ship: string[];
  isPickup: boolean;
  brandColor: string;
  storeLogo: string | null;
}) {
  const lines = order.lines ?? [];
  const units = lines.reduce((n, l) => n + (Number(l.qty) || 0), 0);
  return (
    <div className="hidden print:block packing-slip">
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          body { background: #fff; }
          .packing-slip { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; color: #111827; }
        }
      `}</style>

      {/* Brand band — the store's colour, because that is who they bought from */}
      <div style={{ borderBottom: `4px solid ${brandColor}`, paddingBottom: 12, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {storeLogo
              ? <img src={storeLogo} alt={order.store_name} style={{ height: 46, width: 'auto', objectFit: 'contain' }} />
              : <div style={{ height: 46, width: 46, borderRadius: 8, background: brandColor }} />}
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>{order.store_name}</div>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280' }}>
                Packing Slip
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.02em' }}>#{order.id}</div>
            {new Date(order.created_at).toLocaleDateString()}<br />
            {units} item{units === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      {/* Ship to — positioned for a window envelope */}
      <div style={{ display: 'flex', gap: 40, marginBottom: 24 }}>
        <div style={{ minWidth: '3.2in' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>
            {isPickup ? 'Pickup' : 'Ship to'}
          </div>
          <div style={{ fontSize: 15, lineHeight: 1.5 }}>
            {ship.length > 0
              ? ship.map((l, i) => <div key={i} style={{ fontWeight: i === 0 ? 700 : 400 }}>{l}</div>)
              : <div style={{ fontWeight: 700 }}>{order.buyer_name || order.buyer_email}</div>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6b7280', marginBottom: 6 }}>
            {isPickup ? 'Collect at' : 'Delivery'}
          </div>
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
            {isPickup
              ? (order.pickup_location_json?.name || 'Local pickup')
              : (order.shipping_label || 'Standard shipping')}
            {order.tracking_number && (
              <div style={{ marginTop: 4 }}>
                {order.tracking_carrier} <span style={{ fontFamily: 'ui-monospace, monospace' }}>{order.tracking_number}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* What is in the box — quantities and sizes, no prices */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#0f172a', color: '#fff' }}>
            <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Item</th>
            <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Size / colour</th>
            <th style={{ textAlign: 'right', padding: '8px 10px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Qty</th>
            <th style={{ width: 34 }} />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {l.cover_image && (
                    <img src={l.cover_image} alt="" style={{ width: 38, height: 38, objectFit: 'cover', borderRadius: 4, border: '1px solid #e5e7eb' }} />
                  )}
                  <span style={{ fontWeight: 600 }}>{l.title}</span>
                </div>
              </td>
              <td style={{ padding: '10px', color: '#374151' }}>
                {[l.variant?.size, l.variant?.color].filter(Boolean).join(' · ') || '—'}
              </td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{l.qty}</td>
              {/* A box to tick while packing */}
              <td style={{ padding: '10px' }}>
                <span style={{ display: 'inline-block', width: 16, height: 16, border: '1.5px solid #9ca3af', borderRadius: 3 }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* The thank-you — the whole point of a fundraiser slip */}
      <div style={{ marginTop: 28, padding: '16px 18px', background: '#f8fafc', borderLeft: `4px solid ${brandColor}`, borderRadius: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
          Thank you for supporting {order.store_name}.
        </div>
        <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
          {order.is_fundraiser && order.fundraiser_json?.headline
            ? order.fundraiser_json.headline
            : 'Your purchase goes directly to their work.'}
          {' '}Questions about your order? Reply to your confirmation email and we will take care of it.
        </div>
      </div>

      {/* Same 20%-off thank-you code that goes in every TSB box */}
      <div dangerouslySetInnerHTML={{ __html: slipCouponHtml() }} />

      {/* Powered by — TSB is the maker, not the seller */}
      <div style={{ marginTop: 26, paddingTop: 14, borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '6px 12px',
        }}>
          <img src={TSB_LOGO} alt="" style={{ height: 24, width: 24, objectFit: 'contain' }} />
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#fff' }}>Powered by</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#f97316' }}>tshirtbrothers.com</span>
          </span>
        </span>
        <span style={{ fontSize: 11, color: '#9ca3af', textAlign: 'right', lineHeight: 1.5 }}>
          Printed and shipped by T-Shirt Brothers<br />
          6010 Renaissance Parkway, Fairburn, GA 30213
        </span>
      </div>
    </div>
  );
}

export default function AdminStoreOrderPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id ?? '', 10);
  const [order, setOrder] = useState<AdminStoreOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rates, setRates] = useState<ShippingRate[] | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [ratesBusy, setRatesBusy] = useState(false);
  const [manualTracking, setManualTracking] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      setOrder(await fetchAdminStoreOrder(orderId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  };
  useEffect(() => { if (Number.isFinite(orderId)) void load(); }, [orderId]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-gray-50"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }
  if (!order) {
    return <div className="min-h-screen grid place-items-center bg-gray-50 text-gray-500">Order not found.</div>;
  }

  const ship = addressLines(order.shipping_address);
  const isPickup = order.fulfillment_type === 'pickup';
  const step = NEXT_STEP[order.status];

  const advance = async (status: AdminStoreOrderDetail['status']) => {
    setBusy(true);
    try {
      await updateStoreOrderStatus(order.id, status);
      toast.success(`Order marked ${status.replace('_', ' ')}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(ship.join('\n'));
      toast.success('Address copied');
    } catch {
      toast.error('Could not copy — select the text instead');
    }
  };

  const brandColor = order.brand_json?.primary_color || '#0f172a';
  const storeLogo = order.brand_json?.logo_url || null;

  return (
    <div className="min-h-screen bg-gray-50">
      <PackingSlip order={order} ship={ship} isPickup={isPickup} brandColor={brandColor} storeLogo={storeLogo} />
      <div className="max-w-3xl mx-auto px-4 py-8 print:hidden">
        <div className="flex items-center justify-between gap-3 mb-6 print:hidden">
          <Link to="/admin?section=quotes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black">
            <ArrowLeft className="w-4 h-4" /> Back to Workflow
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
              title="Prints the customer's packing slip — no internal figures on it">
              <Printer className="w-4 h-4" /> Print packing slip
            </button>
            {step && (
              <button onClick={() => advance(step.next)} disabled={busy}
                className="px-3 py-1.5 rounded-md text-sm font-semibold text-white bg-gray-900 hover:bg-black disabled:opacity-50">
                {busy ? 'Saving…' : step.label}
              </button>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Store order #{order.id}</h1>
              <p className="text-sm text-gray-500">
                {order.store_name} · placed {new Date(order.created_at).toLocaleString()}
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 uppercase tracking-wide">
              {order.status.replace('_', ' ')}
            </span>
          </div>

          {/* Ship to — the thing that was missing entirely */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {isPickup ? 'Pickup — contact' : 'Ship to'}
                </h2>
                {ship.length > 0 && (
                  <button onClick={copyAddress} className="print:hidden text-xs text-gray-400 hover:text-gray-700 inline-flex items-center gap-1">
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                )}
              </div>
              {ship.length > 0 ? (
                <address className="not-italic text-sm text-gray-900 leading-relaxed">
                  {ship.map((l, i) => <div key={i}>{l}</div>)}
                </address>
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  No address on this order. Open the Stripe session
                  {order.tsb_order_ref ? ` (${order.tsb_order_ref})` : ''} to find it.
                </p>
              )}
              <p className="mt-2 text-sm">
                <a href={`mailto:${order.buyer_email}`} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" /> {order.buyer_email}
                </a>
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Fulfillment</h2>
              <p className="text-sm text-gray-900">
                {isPickup ? 'Local pickup' : 'Ship'}
                {order.shipping_label ? ` · ${order.shipping_label}` : ''}
              </p>
              <p className="text-sm text-gray-500">Shipping paid: {usd(order.shipping_cents)}</p>
              {isPickup && order.pickup_location_json?.name && (
                <p className="mt-1 text-sm text-gray-500">
                  {order.pickup_location_json.name}
                </p>
              )}
              <Link to={`/stores/${order.store_slug}`} className="print:hidden mt-2 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-black">
                <StoreIcon className="w-3.5 h-3.5" /> View storefront
              </Link>
            </div>
          </div>

          {/* Shipping — rates, label, tracking. A store order used to have
              nowhere to put a tracking number and no way to tell the buyer. */}
          {!isPickup && (
            <div className="border-t border-gray-100 pt-4 print:hidden">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 inline-flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" /> Shipping
              </h2>

              {order.tracking_number ? (
                <div className="space-y-2">
                  <p className="text-sm text-gray-900">
                    <span className="font-medium">{order.tracking_carrier || 'Carrier'}</span>
                    {' · '}
                    <span className="font-mono">{order.tracking_number}</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {order.label_url && (
                      <a href={order.label_url} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50">
                        <Printer className="w-4 h-4" /> Print label <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    )}
                    {order.status !== 'shipped' && order.status !== 'delivered' && (
                      <button onClick={() => advance('shipped')} disabled={busy}
                        className="px-3 py-1.5 rounded-md text-sm font-semibold text-white bg-gray-900 hover:bg-black disabled:opacity-50">
                        {busy ? 'Saving…' : 'Mark shipped & email buyer'}
                      </button>
                    )}
                  </div>
                  {order.shipped_email_sent_at && (
                    <p className="text-xs text-green-700">
                      Tracking emailed to the buyer {new Date(order.shipped_email_sent_at).toLocaleString()}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={async () => {
                        setRatesBusy(true);
                        try {
                          const r = await fetchStoreOrderRates(order.id);
                          setRates(r.rates);
                          setShipmentId(r.shipmentId);
                          if (r.rates.length === 0) toast.error('No rates came back for this address');
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : String(err));
                        } finally { setRatesBusy(false); }
                      }}
                      disabled={ratesBusy || ship.length === 0}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      {ratesBusy ? 'Getting rates…' : 'Get shipping rates'}
                    </button>
                    <span className="text-xs text-gray-400">or paste a tracking number you bought elsewhere:</span>
                    <input
                      value={manualTracking}
                      onChange={(e) => setManualTracking(e.target.value)}
                      placeholder="1Z… / 9400…"
                      className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-44"
                    />
                    <button
                      onClick={async () => {
                        if (!manualTracking.trim()) return;
                        setBusy(true);
                        try {
                          await setStoreOrderTracking(order.id, manualTracking.trim());
                          setManualTracking('');
                          await load();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : String(err));
                        } finally { setBusy(false); }
                      }}
                      disabled={busy || !manualTracking.trim()}
                      className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>

                  {rates && rates.length > 0 && (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                      {rates.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <span className="font-medium text-gray-900">{r.carrier}</span>{' '}
                            <span className="text-gray-600">{r.service}</span>
                            {r.deliveryDays ? <span className="text-gray-400"> · {r.deliveryDays} day{r.deliveryDays === 1 ? '' : 's'}</span> : null}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-semibold text-gray-900">${r.rate.toFixed(2)}</span>
                            <button
                              onClick={async () => {
                                if (!shipmentId) return;
                                if (!window.confirm(`Buy this label for $${r.rate.toFixed(2)}? This charges the EasyPost account.`)) return;
                                setBusy(true);
                                try {
                                  await buyStoreOrderLabel({ shipmentId, rateId: r.id, storeOrderId: order.id });
                                  toast.success('Label purchased');
                                  setRates(null);
                                  await load();
                                } catch (err) {
                                  toast.error(err instanceof Error ? err.message : String(err));
                                } finally { setBusy(false); }
                              }}
                              disabled={busy}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-gray-900 hover:bg-black disabled:opacity-50"
                            >
                              Buy label
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* What to make */}
          <div>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Items</h2>
            <table className="w-full text-sm">
              <thead className="text-xs text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="text-left py-1.5 font-medium">Product</th>
                  <th className="text-left py-1.5 font-medium">Size / colour</th>
                  <th className="text-right py-1.5 font-medium">Qty</th>
                  <th className="text-right py-1.5 font-medium">Each</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(order.lines ?? []).map((l, i) => (
                  <tr key={i}>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {l.cover_image && (
                          <img src={l.cover_image} alt="" className="w-10 h-10 rounded object-cover border border-gray-200" />
                        )}
                        <span className="font-medium text-gray-900">{l.title}</span>
                      </div>
                    </td>
                    <td className="py-2 text-gray-700">
                      {[l.variant?.size, l.variant?.color].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="py-2 text-right font-semibold text-gray-900">{l.qty}</td>
                    <td className="py-2 text-right text-gray-600">{usd(l.retail_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Money — INTERNAL. This is the block that ended up in a
              customer's box telling her the charity got $12 of her $32
              (Kevin, 2026-10-02). It lives on the admin screen only; the
              printed slip is a separate document below and carries no
              split, no TSB figure, and no margin. */}
          <div className="border-t border-gray-100 pt-4 grid gap-1 text-sm max-w-xs ml-auto">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-1">
              Internal — never printed
            </div>
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{usd(order.subtotal_cents)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Shipping</span><span>{usd(order.shipping_cents)}</span></div>
            <div className="flex justify-between font-semibold text-gray-900"><span>Buyer paid</span><span>{usd(order.gross_total_cents)}</span></div>
            <div className="flex justify-between text-emerald-700 mt-1">
              <span>To {order.store_name}</span><span>{usd(order.store_earnings_cents)}</span>
            </div>
            <div className="flex justify-between text-gray-500"><span>TSB</span><span>{usd(order.tsb_earnings_cents)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
