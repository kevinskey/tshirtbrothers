import { useState } from 'react';
import { Loader2, Package, Search } from 'lucide-react';

// Blanks (JDS): SKU lookup against the JDS Industries product API — pricing
// tiers, images, and live inventory. JDS has no ordering API, so unlike the
// S&S section this is a read-only pricing/stock reference; orders still go
// through the JDS website or a rep.

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

export default function JdsAdmin() {
  const [skuText, setSkuText] = useState('');
  const [products, setProducts] = useState<JdsProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => {
                const sku = String(p.sku || '');
                if (p.notFound) {
                  return (
                    <tr key={`${sku}-${i}`} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-mono text-gray-900">{sku}</td>
                      <td colSpan={tiersInUse.length + 2} className="px-3 py-3 text-red-600">
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
