import { useEffect, useState } from 'react';
import { Loader2, Package, Search, Gift, ExternalLink } from 'lucide-react';

// Blanks (JDS): SKU lookup against the JDS Industries product API — pricing
// tiers, images, and live inventory. JDS has no ordering API, so blanks are
// still ordered on the JDS website — but looked-up SKUs can be PUBLISHED to
// the public /gifts store, where customers buy them through Stripe. Orders
// land below for manual fulfillment on jdsindustries.com.

type JdsProduct = Record<string, unknown> & { sku?: string; notFound?: boolean };

// Quantity-break price fields the API returns, in display order. Anything
// numeric outside this list (and the inventory fields) is ignored.
const PRICE_TIERS: Array<[string, string]> = [
  ['lessThanCase', '< case'],
  ['onePiece', '1 pc'],
  ['oneCase', '1 case'],
  ['fiveCases', '5 cases'],
  ['tenCases', '10 cases'],
  ['twentyCases', '20 cases'],
  ['fortyCases', '40 cases'],
];

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}`,
  };
}

function str(p: JdsProduct, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

function num(p: JdsProduct, key: string): number | null {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

interface PublishedProduct {
  id: number;
  sku: string;
  name: string;
  image_url: string | null;
  cost_cents: number | null;
  retail_price_cents: number;
  active: boolean;
}

interface JdsOrder {
  id: number;
  sku: string;
  product_name: string | null;
  qty: number;
  total_cents: number;
  customer_email: string | null;
  customer_name: string | null;
  shipping_address: Record<string, string> | null;
  status: string;
  created_at: string;
}

export default function JdsAdmin() {
  const [skuText, setSkuText] = useState('');
  const [products, setProducts] = useState<JdsProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // /gifts store publishing state
  const [sellSku, setSellSku] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<PublishedProduct[]>([]);
  const [orders, setOrders] = useState<JdsOrder[]>([]);
  // Bulk publish: apply cost × multiplier (rounded to .99) to every
  // looked-up SKU that isn't already listed.
  const [bulkMult, setBulkMult] = useState('3');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<string | null>(null);

  const loadStore = async () => {
    try {
      const [p, o] = await Promise.all([
        fetch('/api/jds-store/admin/products', { headers: authHeaders() }).then((r) => r.json()),
        fetch('/api/jds-store/admin/orders', { headers: authHeaders() }).then((r) => r.json()),
      ]);
      setPublished(p.products ?? []);
      setOrders(o.orders ?? []);
    } catch { /* section just stays empty */ }
  };
  useEffect(() => { loadStore(); }, []);

  const publish = async (sku: string) => {
    const dollars = parseFloat(sellPrice);
    if (!Number.isFinite(dollars) || dollars <= 0 || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const r = await fetch('/api/jds-store/admin/publish', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ sku, retail_price_cents: Math.round(dollars * 100) }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || 'Publish failed');
      setSellSku(null);
      setSellPrice('');
      await loadStore();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const bulkPublish = async () => {
    const skus = products.filter((p) => !p.notFound && p.sku).map((p) => String(p.sku));
    const mult = parseFloat(bulkMult);
    if (!skus.length || !Number.isFinite(mult) || mult <= 0 || bulkBusy) return;
    setBulkBusy(true);
    setBulkSummary(null);
    setError(null);
    try {
      const r = await fetch('/api/jds-store/admin/bulk-publish', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ skus, multiplier: mult }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Bulk publish failed');
      const skippedByReason: Record<string, number> = {};
      for (const s of body.skipped ?? []) skippedByReason[s.reason] = (skippedByReason[s.reason] ?? 0) + 1;
      const skippedText = Object.entries(skippedByReason).map(([r2, n]) => `${n} ${r2}`).join(', ');
      setBulkSummary(`Published ${body.published?.length ?? 0} to /gifts${skippedText ? ` · skipped: ${skippedText}` : ''}`);
      await loadStore();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bulk publish failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleActive = async (p: PublishedProduct) => {
    await fetch(`/api/jds-store/admin/products/${p.id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ active: !p.active }),
    });
    loadStore();
  };

  const setOrderStatus = async (id: number, status: string) => {
    await fetch(`/api/jds-store/admin/orders/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status }),
    });
    loadStore();
  };

  const lookup = async () => {
    const skus = skuText.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!skus.length || loading) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/jds/lookup', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ skus }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Lookup failed (${r.status})`);
      setProducts(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  const tiersInUse = PRICE_TIERS.filter(([key]) => products.some((p) => num(p, key) !== null));

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Package className="w-6 h-6 text-orange-500" />
        <div>
          <h2 className="text-xl font-bold text-gray-900">Blanks (JDS)</h2>
          <p className="text-sm text-gray-500">
            Pricing, quantity breaks, and stock from JDS Industries. Lookup only — place orders on jdsindustries.com.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          SKUs <span className="font-normal text-gray-400">(comma, space, or one per line — up to 100)</span>
        </label>
        <textarea
          value={skuText}
          onChange={(e) => setSkuText(e.target.value)}
          rows={3}
          placeholder={'LWB101\nBRA462F, BRA463'}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={lookup}
            disabled={loading || !skuText.trim()}
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Look up
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </div>

      {products.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <Gift className="w-4 h-4 text-orange-600 shrink-0" />
          <span className="text-sm text-gray-700">
            Publish all {products.filter((p) => !p.notFound).length} results to the Gifts store at cost ×
          </span>
          <input
            type="number"
            min="1"
            step="0.1"
            value={bulkMult}
            onChange={(e) => setBulkMult(e.target.value)}
            className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-right bg-white"
          />
          <span className="text-xs text-gray-500">rounded to .99 · already-listed SKUs keep their price</span>
          <button
            onClick={bulkPublish}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
          >
            {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gift className="w-4 h-4" />}
            Publish all
          </button>
          {bulkSummary && <span className="text-sm font-medium text-green-700">{bulkSummary}</span>}
        </div>
      )}

      {products.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="px-4 py-3">Product</th>
                {tiersInUse.map(([key, label]) => (
                  <th key={key} className="px-3 py-3 text-right whitespace-nowrap">{label}</th>
                ))}
                <th className="px-3 py-3 text-right">Local stock</th>
                <th className="px-4 py-3 text-right">All warehouses</th>
                <th className="px-4 py-3 text-right">Gifts store</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => {
                const sku = String(p.sku || '');
                if (p.notFound) {
                  return (
                    <tr key={`${sku}-${i}`} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-mono text-gray-900">{sku}</td>
                      <td colSpan={tiersInUse.length + 3} className="px-3 py-3 text-red-600">
                        Not found — check the SKU on jdsindustries.com
                      </td>
                    </tr>
                  );
                }
                const thumb = str(p, 'thumbnail', 'quickImage', 'image');
                const name = str(p, 'name', 'description', 'title');
                const local = num(p, 'localQuantity');
                const avail = num(p, 'availableQuantity');
                return (
                  <tr key={`${sku}-${i}`} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {thumb && (
                          <a href={str(p, 'image') || thumb} target="_blank" rel="noreferrer" className="shrink-0">
                            <img src={thumb} alt={sku} className="w-12 h-12 object-contain rounded border border-gray-200 bg-white" />
                          </a>
                        )}
                        <div>
                          <div className="font-mono font-medium text-gray-900">{sku}</div>
                          {name && <div className="text-xs text-gray-500 max-w-xs truncate">{name}</div>}
                        </div>
                      </div>
                    </td>
                    {tiersInUse.map(([key]) => {
                      const v = num(p, key);
                      return (
                        <td key={key} className="px-3 py-3 text-right tabular-nums text-gray-900">
                          {v !== null ? `$${v.toFixed(2)}` : '—'}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-right tabular-nums">{local ?? '—'}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${avail === 0 ? 'text-red-600 font-medium' : ''}`}>
                      {avail ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {sellSku === sku ? (
                        <span className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            autoFocus
                            value={sellPrice}
                            onChange={(e) => setSellPrice(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && publish(sku)}
                            placeholder="Retail $"
                            className="w-20 border border-gray-300 rounded px-2 py-1 text-right text-sm"
                          />
                          <button
                            onClick={() => publish(sku)}
                            disabled={publishing}
                            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium px-2.5 py-1.5 rounded"
                          >
                            {publishing ? '…' : 'Publish'}
                          </button>
                          <button onClick={() => setSellSku(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                        </span>
                      ) : published.some((pp) => pp.sku === sku) ? (
                        <span className="text-xs font-medium text-green-700">Listed</span>
                      ) : (
                        <button
                          onClick={() => { setSellSku(sku); setSellPrice(''); }}
                          className="text-xs font-medium text-orange-600 hover:text-orange-700"
                        >
                          Sell on site
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Published /gifts products */}
      {published.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <Gift className="w-4 h-4 text-orange-500" /> Listed on the Gifts store
            </h3>
            <a href="/gifts" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700">
              View /gifts <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-3">Product</th>
                  <th className="px-3 py-3 text-right">Cost</th>
                  <th className="px-3 py-3 text-right">Retail</th>
                  <th className="px-3 py-3 text-right">Margin</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {published.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.image_url && <img src={p.image_url} alt="" className="w-10 h-10 object-contain rounded border border-gray-200 bg-white" />}
                        <div>
                          <div className="font-medium text-gray-900 max-w-xs truncate">{p.name}</div>
                          <div className="font-mono text-xs text-gray-500">{p.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{p.cost_cents != null ? `$${(p.cost_cents / 100).toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">${(p.retail_price_cents / 100).toFixed(2)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-green-700">
                      {p.cost_cents != null ? `$${((p.retail_price_cents - p.cost_cents) / 100).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => toggleActive(p)}
                        className={`text-xs font-medium px-2.5 py-1 rounded-full ${p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {p.active ? 'Active' : 'Hidden'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stripe orders awaiting JDS fulfillment */}
      {orders.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Gifts store orders</h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-3">Order</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Ship to</th>
                  <th className="px-3 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 max-w-[220px] truncate">{o.product_name || o.sku}</div>
                      <div className="text-xs text-gray-500 font-mono">{o.sku} × {o.qty} · {new Date(o.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-gray-900">{o.customer_name || '—'}</div>
                      <div className="text-xs text-gray-500">{o.customer_email || ''}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600 max-w-[200px]">
                      {o.shipping_address
                        ? `${o.shipping_address.line1 || ''}, ${o.shipping_address.city || ''} ${o.shipping_address.state || ''} ${o.shipping_address.postal_code || ''}`
                        : 'Pickup'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">${(o.total_cents / 100).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <select
                        value={o.status}
                        onChange={(e) => setOrderStatus(o.id, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                      >
                        <option value="paid">Paid — order from JDS</option>
                        <option value="ordered">Ordered from JDS</option>
                        <option value="shipped">Shipped / picked up</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
