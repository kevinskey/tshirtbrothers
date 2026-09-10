import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Package, Plus, RefreshCw, Search, Trash2, Truck, X, FlaskConical,
} from 'lucide-react';

// Blanks purchasing: build and place S&S Activewear orders, prefilled from a
// quote or from scratch, and track each PO through to delivery.

interface SkuRow {
  sku: string;
  colorName: string;
  sizeName: string;
  price: number | null;
  caseQty: number | null;
  stock: number;
  warehouses: Record<string, number>;
}

interface PoLine {
  key: string;
  styleId: string | null;
  productName: string;
  color: string;
  size: string;
  qty: number;
  sku: string | null;
  price: number | null;
  stock: number | null;
}

interface SsOrderSummary {
  orderNumber: string;
  warehouseAbbr: string;
  orderStatus: string;
  expectedDeliveryDate: string | null;
  total: number;
}

interface TrackingEntry {
  orderNumber: string;
  carrier: string | null;
  method: string | null;
  trackingNumbers: string[];
}

interface PurchaseOrder {
  id: number;
  quote_id: number | null;
  quote_customer: string | null;
  po_number: string;
  is_test: boolean;
  status: string;
  ship_to: { customer?: string; city?: string; state?: string };
  lines: Array<{ sku?: string; qty?: number; productName?: string; color?: string; size?: string }>;
  ss_orders: SsOrderSummary[];
  tracking: TrackingEntry[];
  total: string | null;
  expected_delivery: string | null;
  notes: string | null;
  created_at: string;
}

interface ProductHit {
  id: number;
  ss_id: string | null;
  name: string;
  brand: string | null;
}

interface ShipTo {
  customer: string;
  attn: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  residential: boolean;
}

const SHIPPING_METHODS: Array<[string, string]> = [
  ['1', 'Ground (S&S picks carrier)'],
  ['40', 'UPS Ground'],
  ['14', 'FedEx Ground'],
  ['16', 'UPS 3 Day Select'],
  ['3', 'UPS 2nd Day Air'],
  ['2', 'UPS Next Day Air'],
  ['54', 'Cheapest (USPS/UPS/FedEx)'],
];

const STATUS_STYLE: Record<string, string> = {
  submitted:   'bg-blue-100 text-blue-800',
  in_progress: 'bg-amber-100 text-amber-800',
  shipped:     'bg-purple-100 text-purple-800',
  received:    'bg-green-100 text-green-800',
  cancelled:   'bg-red-100 text-red-700',
  test:        'bg-gray-100 text-gray-600',
};

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}`,
  };
}

const money = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === '' ? '—' : `$${Number(n).toFixed(2)}`;

let lineKeySeq = 0;
const nextKey = () => `line-${++lineKeySeq}`;

export default function PurchasingAdmin({ prefillQuoteId, onPrefillConsumed }: {
  prefillQuoteId?: number | null;
  onPrefillConsumed?: () => void;
}) {
  const [view, setView] = useState<'list' | 'builder'>('list');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  // Builder state
  const [lines, setLines] = useState<PoLine[]>([]);
  const [skuCache, setSkuCache] = useState<Record<string, SkuRow[]>>({});
  const [loadingStyles, setLoadingStyles] = useState<Record<string, boolean>>({});
  const [quoteId, setQuoteId] = useState<number | null>(null);
  const [quoteCustomer, setQuoteCustomer] = useState<string>('');
  const [shipTo, setShipTo] = useState<ShipTo | null>(null);
  const [defaultShipTo, setDefaultShipTo] = useState<ShipTo | null>(null);
  const [shippingMethod, setShippingMethod] = useState('1');
  const [testOrder, setTestOrder] = useState(true);
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [placedResult, setPlacedResult] = useState<{ po: PurchaseOrder; ssOrders: SsOrderSummary[] } | null>(null);

  // Product search (standalone lines)
  const [productSearch, setProductSearch] = useState('');
  const [productHits, setProductHits] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const r = await fetch('/api/purchasing/orders', { headers: authHeaders() });
      if (r.ok) setOrders(await r.json());
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  useEffect(() => {
    void (async () => {
      const r = await fetch('/api/purchasing/defaults', { headers: authHeaders() });
      if (r.ok) {
        const d = await r.json();
        setDefaultShipTo(d.shipTo);
        setShipTo((prev) => prev ?? d.shipTo);
      }
    })();
  }, []);

  const loadStyleSkus = useCallback(async (styleId: string) => {
    setLoadingStyles((m) => ({ ...m, [styleId]: true }));
    try {
      const r = await fetch(`/api/purchasing/skus/${encodeURIComponent(styleId)}`, { headers: authHeaders() });
      if (r.ok) {
        const skus: SkuRow[] = await r.json();
        setSkuCache((m) => ({ ...m, [styleId]: skus }));
        return skus;
      }
    } finally {
      setLoadingStyles((m) => ({ ...m, [styleId]: false }));
    }
    return [];
  }, []);

  // Prefill from a quote
  useEffect(() => {
    if (!prefillQuoteId) return;
    void (async () => {
      const r = await fetch(`/api/purchasing/quote-lines/${prefillQuoteId}`, { headers: authHeaders() });
      if (!r.ok) return;
      const data = await r.json();
      const newLines: PoLine[] = (data.lines || []).map((l: { styleId: string | null; productName: string; color: string; size: string; qty: number }) => ({
        key: nextKey(),
        styleId: l.styleId,
        productName: l.productName,
        color: l.color,
        size: l.size,
        qty: l.qty,
        sku: null, price: null, stock: null,
      }));
      setQuoteId(data.quote?.id ?? prefillQuoteId);
      setQuoteCustomer(data.quote?.customer_name || '');
      setLines(newLines);
      setPlacedResult(null);
      setView('builder');
      onPrefillConsumed?.();
      // Resolve SKUs per distinct style
      const styleIds = [...new Set(newLines.map((l) => l.styleId).filter(Boolean))] as string[];
      for (const sid of styleIds) {
        const skus = await loadStyleSkus(sid);
        setLines((prev) => prev.map((ln) => (ln.styleId === sid ? resolveLineWith(ln, skus) : ln)));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillQuoteId]);

  // Try to resolve a line's (color, size) to a SKU from the loaded style data.
  function resolveLineWith(line: PoLine, skus: SkuRow[]): PoLine {
    const norm = (s: string) => s.trim().toLowerCase();
    const match = skus.find(
      (s) => norm(s.colorName) === norm(line.color) && norm(s.sizeName) === norm(line.size)
    );
    if (!match) return { ...line, sku: null, price: null, stock: null };
    return { ...line, sku: match.sku, price: match.price, stock: match.stock };
  }

  // Debounced product search for standalone lines
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (productSearch.trim().length < 2) { setProductHits([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/products?search=${encodeURIComponent(productSearch)}&limit=8`, { headers: authHeaders() });
        if (r.ok) {
          const data = await r.json();
          const items = Array.isArray(data) ? data : (data.products || []);
          setProductHits(items.filter((p: ProductHit) => p.ss_id));
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [productSearch]);

  async function addProductLine(p: ProductHit) {
    if (!p.ss_id) return;
    setProductSearch('');
    setProductHits([]);
    if (!skuCache[p.ss_id]) await loadStyleSkus(p.ss_id);
    setLines((prev) => [...prev, {
      key: nextKey(),
      styleId: p.ss_id,
      productName: `${p.brand ? `${p.brand} ` : ''}${p.name}`,
      color: '', size: '', qty: 12,
      sku: null, price: null, stock: null,
    }]);
  }

  function updateLine(key: string, patch: Partial<PoLine>) {
    setLines((prev) => prev.map((l) => {
      if (l.key !== key) return l;
      const next = { ...l, ...patch };
      const skus = next.styleId ? skuCache[next.styleId] : undefined;
      return skus ? resolveLineWith(next, skus) : next;
    }));
  }

  const readyLines = lines.filter((l) => l.sku && l.qty > 0);
  const unresolved = lines.filter((l) => !l.sku);
  const estSubtotal = readyLines.reduce((sum, l) => sum + (l.price || 0) * l.qty, 0);

  async function placeOrder() {
    if (readyLines.length === 0 || !shipTo) return;
    setPlacing(true);
    setPlaceError(null);
    try {
      const r = await fetch('/api/purchasing/orders', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          lines: readyLines.map((l) => ({
            sku: l.sku, qty: l.qty,
            productName: l.productName, color: l.color, size: l.size,
          })),
          shipTo,
          shippingMethod,
          testOrder,
          quoteId,
          notes: notes || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setPlaceError(data.error || `Order failed (HTTP ${r.status})`);
        return;
      }
      setPlacedResult({ po: data.purchaseOrder, ssOrders: data.ssOrders });
      void loadOrders();
    } catch (e) {
      setPlaceError(e instanceof Error ? e.message : 'Order failed');
    } finally {
      setPlacing(false);
    }
  }

  function resetBuilder() {
    setLines([]);
    setQuoteId(null);
    setQuoteCustomer('');
    setNotes('');
    setTestOrder(true);
    setPlacedResult(null);
    setPlaceError(null);
    setShipTo(defaultShipTo);
  }

  async function refreshPo(id: number) {
    setRefreshingId(id);
    try {
      const r = await fetch(`/api/purchasing/orders/${id}/refresh`, { method: 'POST', headers: authHeaders() });
      if (r.ok) {
        const updated = await r.json();
        setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
      }
    } finally {
      setRefreshingId(null);
    }
  }

  async function markReceived(id: number) {
    const r = await fetch(`/api/purchasing/orders/${id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: 'received' }),
    });
    if (r.ok) {
      const updated = await r.json();
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)));
    }
  }

  // Options for a line's color/size selects, from its style's loaded SKUs
  function styleOptions(styleId: string | null) {
    const skus = styleId ? skuCache[styleId] || [] : [];
    const colors = [...new Set(skus.map((s) => s.colorName))];
    return { skus, colors };
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package className="w-5 h-5" /> Blanks purchasing — S&S Activewear
          </h2>
          <p className="text-sm text-gray-500">
            Order blank garments at wholesale, shipped to the shop or drop-shipped.
          </p>
        </div>
        {view === 'list' ? (
          <button
            onClick={() => { resetBuilder(); setView('builder'); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
          >
            <Plus className="w-4 h-4" /> New purchase order
          </button>
        ) : (
          <button
            onClick={() => setView('list')}
            className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            <X className="w-4 h-4" /> Back to list
          </button>
        )}
      </div>

      {view === 'builder' && (
        <div className="space-y-5">
          {quoteId && (
            <div className="text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              Prefilled from Quote #{quoteId}{quoteCustomer ? ` — ${quoteCustomer}` : ''}. Quantities are the quoted counts; add spoilage extras if needed.
            </div>
          )}

          {/* Line items */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b font-medium text-sm">Line items</div>
            {lines.length === 0 && (
              <div className="px-4 py-6 text-sm text-gray-500">No lines yet — search a product below to add blanks.</div>
            )}
            {lines.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="px-4 py-2 font-medium">Product</th>
                      <th className="px-2 py-2 font-medium">Color</th>
                      <th className="px-2 py-2 font-medium">Size</th>
                      <th className="px-2 py-2 font-medium">Qty</th>
                      <th className="px-2 py-2 font-medium">SKU</th>
                      <th className="px-2 py-2 font-medium text-right">Each</th>
                      <th className="px-2 py-2 font-medium text-right">Stock</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const { skus, colors } = styleOptions(l.styleId);
                      const sizesForColor = [...new Set(
                        skus.filter((s) => s.colorName.toLowerCase() === l.color.toLowerCase()).map((s) => s.sizeName)
                      )];
                      const loading = l.styleId ? loadingStyles[l.styleId] : false;
                      return (
                        <tr key={l.key} className="border-b last:border-0">
                          <td className="px-4 py-2 max-w-[220px]">
                            <div className="truncate" title={l.productName}>{l.productName || '—'}</div>
                            {!l.styleId && (
                              <div className="text-xs text-red-600">Not linked to an S&S style — remove and re-add via search</div>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {colors.length > 0 ? (
                              <select
                                value={l.color}
                                onChange={(e) => updateLine(l.key, { color: e.target.value, size: '' })}
                                className="border rounded px-2 py-1 text-sm max-w-[140px]"
                              >
                                <option value="">Pick color…</option>
                                {colors.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            ) : (
                              <span className="text-gray-500">{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : l.color || '—'}</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {sizesForColor.length > 0 ? (
                              <select
                                value={l.size}
                                onChange={(e) => updateLine(l.key, { size: e.target.value })}
                                className="border rounded px-2 py-1 text-sm"
                              >
                                <option value="">Size…</option>
                                {sizesForColor.map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            ) : (
                              <span className="text-gray-500">{l.size || '—'}</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <input
                              type="number" min={1} value={l.qty}
                              onChange={(e) => updateLine(l.key, { qty: parseInt(e.target.value, 10) || 0 })}
                              className="border rounded px-2 py-1 w-16 text-sm"
                            />
                          </td>
                          <td className="px-2 py-2 font-mono text-xs">
                            {l.sku || <span className="text-amber-600 font-sans">unmatched</span>}
                          </td>
                          <td className="px-2 py-2 text-right">{money(l.price)}</td>
                          <td className={`px-2 py-2 text-right ${l.stock !== null && l.stock < l.qty ? 'text-red-600 font-medium' : ''}`}>
                            {l.stock ?? '—'}
                          </td>
                          <td className="px-2 py-2">
                            <button onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} className="text-gray-400 hover:text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add product */}
            <div className="px-4 py-3 border-t bg-gray-50 relative">
              <div className="flex items-center gap-2 max-w-md">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search catalog to add blanks (e.g. Gildan 5000, hoodie)…"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                />
                {searching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
              </div>
              {productHits.length > 0 && (
                <div className="absolute z-10 mt-1 bg-white border rounded-lg shadow-lg max-w-md w-full">
                  {productHits.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => void addProductLine(p)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {p.brand ? `${p.brand} — ` : ''}{p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Ship-to + options */}
          {shipTo && (
            <div className="grid md:grid-cols-2 gap-5">
              <div className="bg-white border rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm flex items-center gap-2"><Truck className="w-4 h-4" /> Ship to</div>
                  {defaultShipTo && (
                    <button onClick={() => setShipTo(defaultShipTo)} className="text-xs text-brand-600 hover:underline">
                      Use shop address
                    </button>
                  )}
                </div>
                <input value={shipTo.customer} onChange={(e) => setShipTo({ ...shipTo, customer: e.target.value })} placeholder="Company / name" className="w-full border rounded px-3 py-2 text-sm" />
                <input value={shipTo.attn} onChange={(e) => setShipTo({ ...shipTo, attn: e.target.value })} placeholder="Attn" className="w-full border rounded px-3 py-2 text-sm" />
                <input value={shipTo.address} onChange={(e) => setShipTo({ ...shipTo, address: e.target.value })} placeholder="Street address" className="w-full border rounded px-3 py-2 text-sm" />
                <div className="grid grid-cols-3 gap-2">
                  <input value={shipTo.city} onChange={(e) => setShipTo({ ...shipTo, city: e.target.value })} placeholder="City" className="border rounded px-3 py-2 text-sm" />
                  <input value={shipTo.state} onChange={(e) => setShipTo({ ...shipTo, state: e.target.value.toUpperCase().slice(0, 2) })} placeholder="ST" className="border rounded px-3 py-2 text-sm" />
                  <input value={shipTo.zip} onChange={(e) => setShipTo({ ...shipTo, zip: e.target.value })} placeholder="Zip" className="border rounded px-3 py-2 text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={shipTo.residential} onChange={(e) => setShipTo({ ...shipTo, residential: e.target.checked })} />
                  Residential address
                </label>
              </div>

              <div className="bg-white border rounded-xl p-4 space-y-3">
                <div className="font-medium text-sm">Options</div>
                <label className="block text-sm">
                  <span className="text-gray-600">Shipping method</span>
                  <select value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value)} className="mt-1 w-full border rounded px-3 py-2 text-sm">
                    {SHIPPING_METHODS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-gray-600">Notes (internal)</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full border rounded px-3 py-2 text-sm" />
                </label>
                <label className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border ${testOrder ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-300'}`}>
                  <input type="checkbox" checked={testOrder} onChange={(e) => setTestOrder(e.target.checked)} />
                  <FlaskConical className="w-4 h-4" />
                  {testOrder
                    ? 'Test order — S&S validates then auto-cancels; nothing is charged'
                    : 'LIVE ORDER — this will be charged to the S&S account'}
                </label>
              </div>
            </div>
          )}

          {/* Summary + place */}
          <div className="bg-white border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm">
              <span className="font-medium">{readyLines.reduce((s, l) => s + l.qty, 0)} pieces</span>
              {' · '}est. blanks subtotal <span className="font-medium">{money(estSubtotal)}</span>
              <span className="text-gray-500"> (+ shipping/tax at S&S)</span>
              {unresolved.length > 0 && (
                <div className="text-amber-600 mt-1">
                  {unresolved.length} line{unresolved.length === 1 ? '' : 's'} unmatched — pick a color and size, or remove. Unmatched lines are not sent.
                </div>
              )}
            </div>
            <button
              onClick={() => void placeOrder()}
              disabled={placing || readyLines.length === 0}
              className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${testOrder ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}`}
            >
              {placing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
              {testOrder ? 'Place test order' : 'Place LIVE order'}
            </button>
          </div>

          {placeError && (
            <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 whitespace-pre-wrap">
              {placeError}
            </div>
          )}
          {placedResult && (
            <div className="text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3 space-y-1">
              <div className="font-medium text-green-800">
                {placedResult.po.is_test ? 'Test order accepted by S&S ✓ (auto-cancelled, nothing charged)' : 'Order placed with S&S ✓'}
              </div>
              <div>PO {placedResult.po.po_number} · total {money(placedResult.po.total)}</div>
              {placedResult.ssOrders.map((o) => (
                <div key={o.orderNumber}>
                  S&S order <span className="font-mono">{o.orderNumber}</span> from {o.warehouseAbbr}
                  {o.expectedDeliveryDate ? ` · expected ${new Date(o.expectedDeliveryDate).toLocaleDateString()}` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'list' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          {loadingOrders ? (
            <div className="p-8 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No purchase orders yet. Start one with “New purchase order”, or from a quote's “Order blanks” button.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b bg-gray-50">
                    <th className="px-4 py-2 font-medium">PO</th>
                    <th className="px-2 py-2 font-medium">Placed</th>
                    <th className="px-2 py-2 font-medium">For</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium text-right">Total</th>
                    <th className="px-2 py-2 font-medium">Expected</th>
                    <th className="px-2 py-2 font-medium">Tracking</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((po) => (
                    <tr key={po.id} className={`border-b last:border-0 ${po.is_test ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-2">
                        <div className="font-mono text-xs">{po.po_number}</div>
                        <div className="text-xs text-gray-500">
                          {(po.ss_orders || []).map((o) => o.orderNumber).filter(Boolean).join(', ')}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{new Date(po.created_at).toLocaleDateString()}</td>
                      <td className="px-2 py-2">
                        {po.quote_id ? `Quote #${po.quote_id}${po.quote_customer ? ` — ${po.quote_customer}` : ''}` : 'Restock'}
                      </td>
                      <td className="px-2 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[po.status] || 'bg-gray-100 text-gray-600'}`}>
                          {po.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">{money(po.total)}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {po.expected_delivery ? new Date(po.expected_delivery).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-2 py-2 max-w-[180px]">
                        {(po.tracking || []).flatMap((t) => t.trackingNumbers || []).map((tn) => (
                          <div key={tn} className="font-mono text-xs truncate" title={tn}>{tn}</div>
                        ))}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {!po.is_test && (
                          <>
                            <button
                              onClick={() => void refreshPo(po.id)}
                              disabled={refreshingId === po.id}
                              title="Refresh status from S&S"
                              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline mr-3"
                            >
                              {refreshingId === po.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              Refresh
                            </button>
                            {po.status !== 'received' && (
                              <button onClick={() => void markReceived(po.id)} className="text-xs text-green-700 hover:underline">
                                Mark received
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
