import { useState } from 'react';
import { X, Loader2, Package } from 'lucide-react';

interface Rate {
  id: string;
  carrier: string;
  service: string;
  rate: number;
  deliveryDays: number | null;
}

interface Props {
  quote: any; // admin quote row — shipping_address jsonb when the customer chose ship
  onClose: () => void;
  onShipped: () => void;
}

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('tsb_token')}`,
});

// Buy an EasyPost label for a ready order and mark it shipped in one flow:
// confirm address + weight → pick a live rate → buy → fulfill (customer
// tracking email) → open the label PDF for printing.
export default function ShipLabelModal({ quote, onClose, onShipped }: Props) {
  const saved = (quote.shipping_address && typeof quote.shipping_address === 'object') ? quote.shipping_address : {};
  const [addr, setAddr] = useState({
    name: saved.name || quote.customer_name || '',
    street1: saved.address || saved.address1 || saved.street1 || '',
    street2: saved.address2 || saved.street2 || '',
    city: saved.city || '',
    state: saved.state || '',
    zip: saved.zip || '',
  });
  // ~6 oz per printed tee + packaging; the admin corrects it from the scale.
  const [weight, setWeight] = useState(String((Number(quote.quantity) || 1) * 6 + 8));
  const [rates, setRates] = useState<Rate[] | null>(null);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [busy, setBusy] = useState<'rates' | 'buy' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addrComplete = addr.street1.trim() && addr.city.trim() && addr.state.trim() && addr.zip.trim();

  async function getRates() {
    setBusy('rates');
    setError(null);
    setRates(null);
    try {
      const res = await fetch('/api/shipping/rates', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ toAddress: addr, weight: Number(weight) || 16 }),
      });
      const data = await res.json();
      if (!res.ok || !data.rates) throw new Error(data.error || 'Could not get rates');
      setShipmentId(data.shipmentId);
      setRates(data.rates);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function buyAndShip(rate: Rate) {
    if (!shipmentId || busy) return;
    if (!confirm(`Buy ${rate.carrier} ${rate.service} label for $${rate.rate.toFixed(2)} and mark this order shipped?`)) return;
    setBusy('buy');
    setError(null);
    try {
      const buyRes = await fetch('/api/shipping/buy', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ shipmentId, rateId: rate.id, quoteId: quote.id }),
      });
      const bought = await buyRes.json();
      if (!buyRes.ok || !bought.trackingNumber) throw new Error(bought.error || 'Label purchase failed');

      const fulfillRes = await fetch(`/api/quotes/admin/${quote.id}/fulfill`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ method: 'ship', tracking_number: bought.trackingNumber, carrier: bought.carrier }),
      });
      if (!fulfillRes.ok) {
        throw new Error(
          `Label bought (tracking ${bought.trackingNumber}) but marking shipped failed — use Mark Shipped with that number. `
          + ((await fulfillRes.json().catch(() => ({}))).error || ''),
        );
      }
      if (bought.labelUrl) window.open(bought.labelUrl, '_blank');
      alert(`Shipped! ${bought.carrier} ${bought.service}, tracking ${bought.trackingNumber}. Tracking email sent to the customer.`);
      onShipped();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-600" /> Buy Label & Ship — Order #{quote.id}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-2 mb-3">
          <input value={addr.name} onChange={(e) => setAddr({ ...addr, name: e.target.value })} placeholder="Recipient name" className={input} />
          <input value={addr.street1} onChange={(e) => setAddr({ ...addr, street1: e.target.value })} placeholder="Street address" className={input} />
          <input value={addr.street2} onChange={(e) => setAddr({ ...addr, street2: e.target.value })} placeholder="Apt / suite (optional)" className={input} />
          <div className="grid grid-cols-3 gap-2">
            <input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} placeholder="City" className={input} />
            <input value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} placeholder="State" className={input} />
            <input value={addr.zip} onChange={(e) => setAddr({ ...addr, zip: e.target.value })} placeholder="ZIP" className={input} />
          </div>
          <div className="flex items-center gap-2">
            <input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" min="1" className={`${input} w-28`} />
            <span className="text-sm text-gray-500">total weight (oz) — packed, from the scale</span>
          </div>
        </div>

        <button
          onClick={getRates}
          disabled={!addrComplete || busy !== null}
          className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 disabled:opacity-50 text-white text-sm font-semibold rounded-lg mb-3"
        >
          {busy === 'rates' ? <Loader2 className="w-4 h-4 animate-spin inline" /> : rates ? 'Refresh Rates' : 'Get Live Rates'}
        </button>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        {rates && (
          <div className="space-y-2">
            {rates.length === 0 && <p className="text-sm text-gray-500">No rates returned — check the address.</p>}
            {rates.map((r) => (
              <button
                key={r.id}
                onClick={() => buyAndShip(r)}
                disabled={busy !== null}
                className="w-full flex items-center justify-between border border-gray-200 hover:border-indigo-500 rounded-lg px-4 py-3 text-left disabled:opacity-50"
              >
                <div>
                  <div className="text-sm font-semibold text-gray-900">{r.carrier} {r.service}</div>
                  <div className="text-xs text-gray-500">{r.deliveryDays ? `~${r.deliveryDays} day${r.deliveryDays === 1 ? '' : 's'}` : 'delivery estimate unavailable'}</div>
                </div>
                <div className="text-base font-bold text-indigo-600">
                  {busy === 'buy' ? <Loader2 className="w-4 h-4 animate-spin" /> : `$${r.rate.toFixed(2)}`}
                </div>
              </button>
            ))}
            <p className="text-xs text-gray-400">Buying a label charges the EasyPost account, emails the customer tracking, and completes the order.</p>
          </div>
        )}
      </div>
    </div>
  );
}
