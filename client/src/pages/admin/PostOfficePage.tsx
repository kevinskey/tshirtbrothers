// The Post Office — the shipping desk.
//
// Three tabs, in the order the work actually happens: what's waiting to
// go out, the labels already bought (print, SCAN form, refund), and where
// the parcels are. Everything hits EasyPost through
// /api/admin/post-office.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Loader2, ArrowLeft, Printer, RefreshCw, Truck, PackageCheck, MapPin,
  CheckSquare, Square, ExternalLink, AlertTriangle, Undo2, CalendarClock,
} from 'lucide-react';
import {
  fetchShipQueue, fetchShipRates, buyShipLabel, buyCheapestLabels, verifyShipAddress,
  fetchShipments, refundShipment, refreshTracking, createScanForm,
  fetchPickups, schedulePickup, cancelPickup,
  type PostOfficeQueueItem, type Shipment, type Pickup, type ShippingRate,
} from '@/lib/api';

const usd = (cents: number | null | undefined) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`);

// What TSB actually ships in. Dimensions are inches; a carrier prices a
// parcel on weight AND size, so guessing the box is guessing the price.
const PARCELS = [
  { key: 'poly_sm',  name: 'Poly mailer — small (1–2 shirts)', length: 12, width: 10, height: 2 },
  { key: 'poly_lg',  name: 'Poly mailer — large (3–6 shirts)', length: 16, width: 12, height: 4 },
  { key: 'box_sm',   name: 'Box — small (up to 8 shirts)',     length: 12, width: 10, height: 6 },
  { key: 'box_md',   name: 'Box — medium (up to 20 shirts)',   length: 16, width: 12, height: 10 },
  { key: 'box_lg',   name: 'Box — large (case / bulk)',        length: 20, width: 16, height: 14 },
  { key: 'tube',     name: 'Tube (banners, transfers)',        length: 26, width: 6,  height: 6 },
  { key: 'custom',   name: 'Custom…',                          length: 12, width: 10, height: 2 },
];

/** lb + oz boxes, because that's what a shop scale reads. */
function WeightInput({ oz, onChange }: { oz: number; onChange: (oz: number) => void }) {
  const lb = Math.floor(oz / 16);
  const rem = +(oz - lb * 16).toFixed(1);
  return (
    <div className="flex items-center gap-1">
      <input type="number" min={0} value={lb}
        onChange={(e) => onChange(Math.max(0, (Number(e.target.value) || 0) * 16 + rem))}
        className="w-16 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
      <span className="text-xs text-gray-500">lb</span>
      <input type="number" min={0} max={15.9} step={0.1} value={rem}
        onChange={(e) => onChange(Math.max(0, lb * 16 + (Number(e.target.value) || 0)))}
        className="w-16 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
      <span className="text-xs text-gray-500">oz</span>
    </div>
  );
}

/** Parcel picker shared by the queue rows and the one-off label form. */
function ParcelPicker({ value, onChange }: {
  value: { preset: string; length: number; width: number; height: number };
  onChange: (v: { preset: string; length: number; width: number; height: number }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.preset}
        onChange={(e) => {
          const p = PARCELS.find((x) => x.key === e.target.value) ?? PARCELS[0]!;
          onChange({ preset: p.key, length: p.length, width: p.width, height: p.height });
        }}
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm max-w-[260px]"
      >
        {PARCELS.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
      </select>
      {value.preset === 'custom' && (
        <div className="flex items-center gap-1">
          {(['length', 'width', 'height'] as const).map((dim) => (
            <input key={dim} type="number" min={1} value={value[dim]} aria-label={dim}
              onChange={(e) => onChange({ ...value, [dim]: Number(e.target.value) || 1 })}
              className="w-14 border border-gray-300 rounded-md px-2 py-1.5 text-sm" />
          ))}
          <span className="text-xs text-gray-500">in (L×W×H)</span>
        </div>
      )}
    </div>
  );
}
const keyOf = (i: { subject_type: string; subject_id: number }) => `${i.subject_type}:${i.subject_id}`;

// EasyPost carrier account names (UPSDAP, FedExDefault…) aren't what a
// human scans for in a rate list. Map to the shipper's own name and
// colors so the carrier jumps out before the price does — the post office
// won't take a UPS label, so which shipper you're buying is the one thing
// that must be unmistakable.
function carrierName(raw: string | null | undefined): string {
  const c = (raw || '').toLowerCase();
  if (c.startsWith('ups')) return 'UPS';
  if (c.startsWith('usps')) return 'USPS';
  if (c.startsWith('fedex')) return 'FedEx';
  if (c.startsWith('dhl')) return 'DHL';
  return raw || '—';
}

const CARRIER_STYLE: Record<string, string> = {
  UPS:   'bg-[#351c15] text-[#ffb500]',
  USPS:  'bg-[#004b87] text-white',
  FedEx: 'bg-[#4d148c] text-white',
  DHL:   'bg-[#ffcc00] text-[#d40511]',
};

function CarrierBadge({ carrier }: { carrier: string | null | undefined }) {
  const name = carrierName(carrier);
  const style = CARRIER_STYLE[name] || 'bg-gray-800 text-white';
  return (
    <span title={carrier || undefined}
      className={`inline-block align-middle rounded px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wider ${style}`}>
      {name}
    </span>
  );
}

// Where the parcel has to go once the label is on it. USPS labels can be
// dropped at any post office; everything else has to reach that carrier.
function DropoffHint({ carrier }: { carrier: string | null | undefined }) {
  const name = carrierName(carrier);
  if (name === 'USPS') return <span className="text-[11px] text-emerald-700"> · post office OK</span>;
  if (name === '—') return null;
  return <span className="text-[11px] text-amber-700"> · {name} drop-off only</span>;
}

function addressLine(a: PostOfficeQueueItem['address']): string {
  if (!a) return 'No address';
  return [a.street1, a.street2, [a.city, a.state, a.zip].filter(Boolean).join(', ')]
    .filter(Boolean).join(' · ');
}

const STATUS_TONE: Record<string, string> = {
  delivered: 'bg-green-100 text-green-800',
  out_for_delivery: 'bg-blue-100 text-blue-800',
  in_transit: 'bg-amber-100 text-amber-800',
  pre_transit: 'bg-gray-100 text-gray-600',
  available_for_pickup: 'bg-teal-100 text-teal-800',
  return_to_sender: 'bg-red-100 text-red-700',
  failure: 'bg-red-100 text-red-700',
  unknown: 'bg-gray-100 text-gray-500',
};

export default function PostOfficePage() {
  const [tab, setTab] = useState<'queue' | 'newlabel' | 'labels' | 'tracking'>('queue');

  // Queue
  const [queue, setQueue] = useState<PostOfficeQueueItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rateFor, setRateFor] = useState<string | null>(null);
  const [rates, setRates] = useState<{ shipmentId: string; weight_oz: number; rates: ShippingRate[] } | null>(null);
  const [busy, setBusy] = useState(false);
  // Per-row parcel override: the scale and the box on the bench beat
  // anything derived from a blank's spec sheet.
  const [parcel, setParcel] = useState({ preset: 'poly_sm', length: 12, width: 10, height: 2 });
  const [weightOverride, setWeightOverride] = useState<number | null>(null);

  // One-off label (no order behind it)
  const [manualTo, setManualTo] = useState({ name: '', street1: '', street2: '', city: '', state: '', zip: '', phone: '' });
  const [manualParcel, setManualParcel] = useState({ preset: 'poly_sm', length: 12, width: 10, height: 2 });
  const [manualWeight, setManualWeight] = useState(12);
  const [manualRef, setManualRef] = useState('');
  const [manualRates, setManualRates] = useState<{ shipmentId: string; rates: ShippingRate[] } | null>(null);

  // Labels + tracking
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [month, setMonth] = useState<{ spent_cents: number; live: number; refunded: number } | null>(null);
  const [pickedLabels, setPickedLabels] = useState<Set<number>>(new Set());
  const [pickups, setPickups] = useState<Pickup[]>([]);

  const loadQueue = async () => {
    setQueueLoading(true);
    try {
      const d = await fetchShipQueue();
      setQueue(d.items);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setQueueLoading(false); }
  };
  const loadShipments = async (status = 'all') => {
    try {
      const d = await fetchShipments(status);
      setShipments(d.shipments);
      setMonth(d.month);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };
  const loadPickups = async () => {
    try { setPickups((await fetchPickups()).pickups); } catch { /* panel is optional */ }
  };

  useEffect(() => { void loadQueue(); void loadShipments(); void loadPickups(); }, []);

  const noAddress = useMemo(() => queue.filter((q) => !q.address).length, [queue]);
  const selectedItems = useMemo(
    () => queue.filter((q) => picked.has(keyOf(q)) && q.address),
    [queue, picked],
  );

  const toggle = (k: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const openRates = async (item: PostOfficeQueueItem, override = false) => {
    setRateFor(keyOf(item));
    setRates(null);
    try {
      const r = await fetchShipRates({
        subject_type: item.subject_type,
        subject_id: item.subject_id,
        ...(override && weightOverride ? { weight_oz: weightOverride } : {}),
        ...(override ? { length: parcel.length, width: parcel.width, height: parcel.height } : {}),
      });
      setRates({ shipmentId: r.shipmentId, weight_oz: r.weight_oz, rates: r.rates });
      if (weightOverride == null) setWeightOverride(r.weight_oz);
      if (r.rates.length === 0) toast.error('No rates for that address');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setRateFor(null);
    }
  };

  const buy = async (item: PostOfficeQueueItem, rate: ShippingRate) => {
    if (!rates) return;
    if (!window.confirm(`Buy ${rate.carrier} ${rate.service} for $${rate.rate.toFixed(2)}?`)) return;
    setBusy(true);
    try {
      await buyShipLabel({
        shipmentId: rates.shipmentId, rateId: rate.id,
        subject_type: item.subject_type, subject_id: item.subject_id,
      });
      toast.success('Label bought');
      setRateFor(null); setRates(null);
      await Promise.all([loadQueue(), loadShipments()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const buyAllCheapest = async () => {
    if (selectedItems.length === 0) return;
    if (!window.confirm(`Buy the cheapest label for ${selectedItems.length} order${selectedItems.length === 1 ? '' : 's'}? This charges the EasyPost account.`)) return;
    setBusy(true);
    try {
      const r = await buyCheapestLabels(selectedItems.map((i) => ({ subject_type: i.subject_type, subject_id: i.subject_id })));
      toast[r.failed ? 'warning' : 'success'](
        `${r.bought} label${r.bought === 1 ? '' : 's'} bought${r.failed ? `, ${r.failed} failed` : ''}`,
      );
      r.results.filter((x) => !x.ok).forEach((x) => toast.error(`#${x.subject_id}: ${x.error}`));
      setPicked(new Set());
      await Promise.all([loadQueue(), loadShipments()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const verify = async (item: PostOfficeQueueItem) => {
    if (!item.address) return;
    try {
      const r = await verifyShipAddress(item.address);
      if (r.success && r.verified) {
        toast.success(`USPS: ${r.verified.street1}, ${r.verified.city} ${r.verified.state} ${r.verified.zip}`);
      } else {
        toast.error(`Not deliverable: ${r.messages.join('; ') || 'USPS could not match it'}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const live = shipments.filter((s) => s.status === 'purchased');
  const unformed = live.filter((s) => !s.scan_form_id);

  return (
    <div className="min-h-screen bg-gray-50 border-t-4 border-orange-500">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-black mb-1">
              <ArrowLeft className="w-4 h-4" /> Admin
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Truck className="w-6 h-6 text-orange-500" /> Post Office
            </h1>
            <p className="text-sm text-gray-500">Rates, labels, tracking, pickups — every order TSB mails.</p>
          </div>
          {month && (
            <div className="flex gap-4 text-right">
              <div>
                <div className="text-xs text-gray-500">Postage this month</div>
                <div className="text-xl font-bold text-orange-600">{usd(month.spent_cents)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">In the mail</div>
                <div className="text-xl font-bold text-orange-600">{month.live}</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-1 mb-4 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {([['queue', `Ready to ship (${queue.length})`], ['newlabel', 'New label'], ['labels', `Labels (${live.length})`], ['tracking', 'Tracking']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === k ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-orange-50 hover:text-orange-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* ── READY TO SHIP ─────────────────────────────────────────── */}
        {tab === 'queue' && (
          <div className="space-y-3">
            {noAddress > 0 && (
              <div className="flex items-start gap-2 text-sm rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{noAddress} order{noAddress === 1 ? ' has' : 's have'} no shipping address — they can't be labelled until one is added.</span>
              </div>
            )}

            {selectedItems.length > 0 && (
              <div className="sticky top-2 z-10 flex items-center justify-between gap-3 bg-orange-500 text-white rounded-xl px-4 py-3 shadow-lg">
                <span className="text-sm font-semibold">{selectedItems.length} selected</span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPicked(new Set())} className="text-xs text-orange-100 hover:text-white">Clear</button>
                  <button onClick={buyAllCheapest} disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-white text-orange-700 text-sm font-semibold hover:bg-orange-50 disabled:opacity-50">
                    {busy ? 'Buying…' : 'Buy cheapest labels'}
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {queueLoading ? (
                <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" /></div>
              ) : queue.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <PackageCheck className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  Nothing waiting to ship.
                </div>
              ) : queue.map((item) => {
                const k = keyOf(item);
                const open = rateFor === k;
                return (
                  <div key={k} className="border-b border-gray-100 last:border-0">
                    <div className="flex items-start gap-3 px-4 py-3">
                      <button onClick={() => item.address && toggle(k)} disabled={!item.address}
                        className="mt-0.5 text-gray-400 hover:text-gray-900 disabled:opacity-30">
                        {picked.has(k) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-gray-900">{item.label}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{item.status}</span>
                          <span className="text-sm text-gray-600 truncate">{item.qty}× {item.items}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{item.customer} · {addressLine(item.address)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.address && (
                          <button onClick={() => verify(item)} title="Check with USPS"
                            className="p-1.5 text-gray-400 hover:text-gray-900" aria-label="Verify address">
                            <MapPin className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => (open ? setRateFor(null) : openRates(item))} disabled={!item.address}
                          className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-40">
                          {open ? 'Hide rates' : 'Rates'}
                        </button>
                      </div>
                    </div>

                    {open && (
                      <div className="px-4 pb-4 pl-11 space-y-3">
                        <div className="flex flex-wrap items-end gap-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                          <div>
                            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Parcel</div>
                            <ParcelPicker value={parcel} onChange={setParcel} />
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Weight</div>
                            <WeightInput oz={weightOverride ?? 0} onChange={setWeightOverride} />
                          </div>
                          <button onClick={() => openRates(item, true)}
                            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white hover:bg-gray-50">
                            Re-rate
                          </button>
                        </div>
                        {!rates ? (
                          <div className="py-4 text-sm text-gray-400 inline-flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Getting live rates…
                          </div>
                        ) : (
                          <>
                            <div className="text-xs text-gray-500 mb-1">Parcel {rates.weight_oz} oz</div>
                            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-56 overflow-y-auto">
                              {rates.rates.map((r) => (
                                <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                  <div className="min-w-0">
                                    <CarrierBadge carrier={r.carrier} />{' '}
                                    <span className="font-medium text-gray-800">{r.service}</span>
                                    {r.deliveryDays ? <span className="text-gray-400"> · {r.deliveryDays}d</span> : null}
                                    <DropoffHint carrier={r.carrier} />
                                  </div>
                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="font-semibold">${r.rate.toFixed(2)}</span>
                                    <button onClick={() => buy(item, r)} disabled={busy}
                                      className="px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-gray-900 hover:bg-orange-600 disabled:opacity-50">
                                      Buy
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── NEW LABEL (no order behind it) ────────────────────────── */}
        {tab === 'newlabel' && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-900">Ship anything</h2>
                <p className="text-sm text-gray-500">
                  A sample, a replacement, a vendor return — no order required. It lands in
                  the postage ledger like any other label.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">What is it?</label>
                <input value={manualRef} onChange={(e) => setManualRef(e.target.value)}
                  placeholder="Replacement hoodie — Cheryl"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Ship to</label>
                <input value={manualTo.name} onChange={(e) => setManualTo({ ...manualTo, name: e.target.value })}
                  placeholder="Name" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input value={manualTo.street1} onChange={(e) => setManualTo({ ...manualTo, street1: e.target.value })}
                  placeholder="Street address" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input value={manualTo.street2} onChange={(e) => setManualTo({ ...manualTo, street2: e.target.value })}
                  placeholder="Apt / suite (optional)" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <div className="grid grid-cols-6 gap-2">
                  <input value={manualTo.city} onChange={(e) => setManualTo({ ...manualTo, city: e.target.value })}
                    placeholder="City" className="col-span-3 border border-gray-300 rounded-md px-3 py-2 text-sm" />
                  <input value={manualTo.state} onChange={(e) => setManualTo({ ...manualTo, state: e.target.value.toUpperCase().slice(0, 2) })}
                    placeholder="GA" className="col-span-1 border border-gray-300 rounded-md px-3 py-2 text-sm" />
                  <input value={manualTo.zip} onChange={(e) => setManualTo({ ...manualTo, zip: e.target.value })}
                    placeholder="ZIP" className="col-span-2 border border-gray-300 rounded-md px-3 py-2 text-sm" />
                </div>
                <input value={manualTo.phone} onChange={(e) => setManualTo({ ...manualTo, phone: e.target.value })}
                  placeholder="Phone (optional — some carriers want it)" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <button
                  onClick={async () => {
                    if (!manualTo.street1) return toast.error('Street address first');
                    try {
                      const r = await verifyShipAddress(manualTo);
                      if (r.success && r.verified) {
                        setManualTo({ ...manualTo, ...r.verified, street2: r.verified.street2 || manualTo.street2 });
                        toast.success('Address verified and corrected');
                      } else {
                        toast.error(`Not deliverable: ${r.messages.join('; ') || 'USPS could not match it'}`);
                      }
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : String(err));
                    }
                  }}
                  className="text-xs font-medium text-gray-600 hover:text-black inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Verify with USPS
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Parcel</label>
                  <ParcelPicker value={manualParcel} onChange={setManualParcel} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Weight</label>
                  <WeightInput oz={manualWeight} onChange={setManualWeight} />
                </div>
              </div>

              <button
                onClick={async () => {
                  if (!manualTo.street1 || !manualTo.city || !manualTo.state || !manualTo.zip) {
                    return toast.error('Street, city, state and ZIP are required');
                  }
                  if (!manualWeight) return toast.error('Weigh it first — carriers price on weight');
                  setBusy(true);
                  setManualRates(null);
                  try {
                    const r = await fetchShipRates({
                      address: manualTo,
                      weight_oz: manualWeight,
                      length: manualParcel.length, width: manualParcel.width, height: manualParcel.height,
                    });
                    setManualRates({ shipmentId: r.shipmentId, rates: r.rates });
                    if (r.rates.length === 0) toast.error('No rates for that address and parcel');
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err));
                  } finally { setBusy(false); }
                }}
                disabled={busy}
                className="w-full py-2.5 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">
                {busy ? 'Getting rates…' : 'Get rates'}
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="font-semibold text-gray-900 mb-3">Rates</h2>
              {!manualRates ? (
                <p className="text-sm text-gray-400 py-8 text-center">
                  Fill in the address and parcel, then get rates.
                </p>
              ) : (
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                  {manualRates.rates.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <CarrierBadge carrier={r.carrier} />{' '}
                        <span className="font-medium text-gray-800">{r.service}</span>
                        {r.deliveryDays ? <span className="text-gray-400"> · {r.deliveryDays}d</span> : null}
                        <DropoffHint carrier={r.carrier} />
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-semibold">${r.rate.toFixed(2)}</span>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Buy ${r.carrier} ${r.service} for $${r.rate.toFixed(2)}?`)) return;
                            setBusy(true);
                            try {
                              const sh = await buyShipLabel({
                                shipmentId: manualRates.shipmentId, rateId: r.id,
                                subject_type: 'manual',
                                reference: manualRef || undefined,
                              });
                              toast.success('Label bought');
                              if (sh.label_url) window.open(sh.label_url, '_blank');
                              setManualRates(null);
                              setManualRef('');
                              setManualTo({ name: '', street1: '', street2: '', city: '', state: '', zip: '', phone: '' });
                              await loadShipments();
                              setTab('labels');
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : String(err));
                            } finally { setBusy(false); }
                          }}
                          disabled={busy}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold text-white bg-gray-900 hover:bg-orange-600 disabled:opacity-50">
                          Buy
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── LABELS ────────────────────────────────────────────────── */}
        {tab === 'labels' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={async () => {
                  const ids = [...pickedLabels];
                  if (ids.length === 0) return toast.error('Select labels first');
                  try {
                    const f = await createScanForm(ids);
                    toast.success(`SCAN form for ${f.shipments} parcels`);
                    if (f.url) window.open(f.url, '_blank');
                    setPickedLabels(new Set());
                    await loadShipments();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err));
                  }
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 bg-white">
                <Printer className="w-4 h-4 inline mr-1.5" /> SCAN form for selected
              </button>
              <button
                onClick={async () => {
                  const ids = [...pickedLabels];
                  if (ids.length === 0) return toast.error('Select labels first');
                  const day = window.prompt('Pickup date (YYYY-MM-DD):', new Date(Date.now() + 86400000).toISOString().slice(0, 10));
                  if (!day) return;
                  try {
                    const p = await schedulePickup({
                      shipment_ids: ids,
                      min_datetime: `${day}T10:00:00`,
                      max_datetime: `${day}T16:00:00`,
                    });
                    toast.success(`${p.carrier} pickup scheduled — ${p.confirmation || p.status}`);
                    setPickedLabels(new Set());
                    await loadPickups();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err));
                  }
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 bg-white">
                <CalendarClock className="w-4 h-4 inline mr-1.5" /> Schedule pickup
              </button>
              {unformed.length > 0 && (
                <span className="text-xs text-gray-500">{unformed.length} label{unformed.length === 1 ? '' : 's'} not on a SCAN form yet</span>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="w-8" />
                    <th className="px-3 py-2 text-left font-medium">Bought</th>
                    <th className="px-3 py-2 text-left font-medium">For</th>
                    <th className="px-3 py-2 text-left font-medium">To</th>
                    <th className="px-3 py-2 text-left font-medium">Service</th>
                    <th className="px-3 py-2 text-right font-medium">Cost</th>
                    <th className="px-3 py-2 text-left font-medium">Tracking</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shipments.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">No labels bought yet.</td></tr>
                  )}
                  {shipments.map((s) => (
                    <tr key={s.id} className={s.status !== 'purchased' ? 'opacity-50' : ''}>
                      <td className="pl-3">
                        {s.status === 'purchased' && (
                          <button onClick={() => setPickedLabels((prev) => {
                            const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n;
                          })} className="text-gray-400 hover:text-gray-900">
                            {pickedLabels.has(s.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{new Date(s.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-gray-900">
                        {s.subject_label || '—'}
                        {s.reference && s.reference !== s.subject_label && (
                          <div className="text-[11px] text-gray-500 truncate max-w-[200px]">{s.reference}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600 truncate max-w-[180px]">{s.to_name || s.to_address?.name || '—'}</td>
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap"><CarrierBadge carrier={s.carrier} /> {s.service}</td>
                      <td className="px-3 py-2 text-right">{usd(s.rate_cents)}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs">{s.tracking_code || '—'}</span>
                        {s.refund_status && <div className="text-[11px] text-amber-700">refund: {s.refund_status}</div>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {s.label_url && (
                          <a href={s.label_url} target="_blank" rel="noreferrer"
                            className="text-xs font-medium text-gray-700 hover:underline mr-3">
                            Print <ExternalLink className="w-3 h-3 inline" />
                          </a>
                        )}
                        {s.status === 'purchased' && (
                          <button
                            onClick={async () => {
                              if (!window.confirm('Refund this label? The order goes back in the queue.')) return;
                              try {
                                await refundShipment(s.id);
                                toast.success('Refund requested');
                                await Promise.all([loadShipments(), loadQueue()]);
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : String(err));
                              }
                            }}
                            className="text-xs font-medium text-red-600 hover:underline">
                            <Undo2 className="w-3 h-3 inline" /> Refund
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pickups.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Scheduled pickups</h3>
                <ul className="space-y-1 text-sm">
                  {pickups.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3">
                      <span className="text-gray-700">
                        {p.carrier} · {new Date(p.min_datetime).toLocaleDateString()} ·{' '}
                        <span className="text-gray-500">{p.shipment_ids.length} parcels · {p.status}</span>
                        {p.confirmation && <span className="text-gray-400"> · {p.confirmation}</span>}
                      </span>
                      {p.status !== 'canceled' && (
                        <button onClick={async () => {
                          try { await cancelPickup(p.id); toast.success('Pickup cancelled'); await loadPickups(); }
                          catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
                        }} className="text-xs text-red-600 hover:underline">Cancel</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* ── TRACKING ──────────────────────────────────────────────── */}
        {tab === 'tracking' && (
          <div className="space-y-3">
            <button
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await refreshTracking();
                  toast.success(`Checked ${r.checked} parcels`);
                  await loadShipments();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : String(err));
                } finally { setBusy(false); }
              }}
              disabled={busy}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 bg-white disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 inline mr-1.5 ${busy ? 'animate-spin' : ''}`} /> Refresh tracking
            </button>
            <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              {shipments.filter((s) => s.tracking_code).length === 0 && (
                <div className="py-10 text-center text-gray-400">Nothing in the mail.</div>
              )}
              {shipments.filter((s) => s.tracking_code).map((s) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{s.subject_label}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_TONE[s.tracking_status || 'unknown'] || STATUS_TONE.unknown}`}>
                        {(s.tracking_status || 'unknown').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      {s.to_name} · <CarrierBadge carrier={s.carrier} /> {s.service} · <span className="font-mono">{s.tracking_code}</span>
                    </div>
                    {s.tracking_detail && <div className="text-xs text-gray-400 mt-0.5">{s.tracking_detail}</div>}
                  </div>
                  <div className="text-xs text-gray-500 text-right shrink-0">
                    {s.delivered_at
                      ? `Delivered ${new Date(s.delivered_at).toLocaleDateString()}`
                      : s.est_delivery_date
                      ? `Due ${new Date(s.est_delivery_date).toLocaleDateString()}`
                      : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
