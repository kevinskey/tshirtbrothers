import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, ExternalLink } from 'lucide-react';

// S&S-style product dossier for the admin Products list: colorway
// swatches that switch the photo, a per-size wholesale price row, and
// per-warehouse inventory — all live from the S&S API via
// GET /api/products/detail/:id.

interface LiveColor { name: string; hex: string | null; swatch: string | null; image: string | null }
interface LiveSku { sku: string; colorName: string; sizeName: string; price: number | null; caseQty: number | null }
interface Detail {
  product: {
    id: number; name: string; brand: string | null; category: string | null;
    style_number: string | null; ss_id: string | null; image_url: string | null;
    retail_price: string | null; custom_price: string | null;
    specifications: { description?: string; material?: string; weight?: string } | null;
  };
  live: null | {
    style: null | {
      name: string; brand: string; style_number: string;
      image_url: string | null;
      specifications?: { description?: string; material?: string; weight?: string };
    };
    colors: LiveColor[];
    skus: LiveSku[];
    inventory: Record<string, { total: number; warehouses: Record<string, number> }>;
  };
}

const SIZE_ORDER = ['XS', 'S', 'S/M', 'M', 'L', 'L/XL', 'XL', '2XL', '2/3XL', '3XL', '4XL', '4/5XL', '5XL', '6XL'];
const sizeRank = (s: string) => {
  const i = SIZE_ORDER.indexOf(s.toUpperCase());
  return i === -1 ? 100 + s.charCodeAt(0) : i;
};

export default function ProductDetailModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [activeColor, setActiveColor] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null); setError(''); setActiveColor(null);
    fetch(`/api/products/detail/${productId}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` },
    })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Detail) => {
        if (!alive) return;
        setDetail(d);
        const first = d.live?.colors[0];
        if (first) setActiveColor(first.name);
      })
      .catch((e) => { if (alive) setError(e.message || 'Failed to load'); });
    return () => { alive = false; };
  }, [productId]);

  const p = detail?.product;
  const live = detail?.live;

  // Rows for the selected color: one per size, with price + stock.
  const colorRows = useMemo(() => {
    if (!live) return [];
    const skus = live.skus.filter((s) => !activeColor || s.colorName === activeColor);
    return skus
      .map((s) => ({ ...s, stock: live.inventory[s.sku] || { total: 0, warehouses: {} } }))
      .sort((a, b) => sizeRank(a.sizeName) - sizeRank(b.sizeName));
  }, [live, activeColor]);

  // Warehouse columns present anywhere in the selected color's rows.
  const warehouses = useMemo(() => {
    const set = new Set<string>();
    for (const r of colorRows) Object.keys(r.stock.warehouses).forEach((w) => set.add(w));
    return [...set].sort();
  }, [colorRows]);

  const activeImage = live?.colors.find((c) => c.name === activeColor)?.image
    || live?.style?.image_url || p?.image_url || null;
  const spec = live?.style?.specifications || p?.specifications || {};
  const fromPrice = useMemo(() => {
    const prices = (live?.skus ?? []).map((s) => Number(s.price)).filter((n) => Number.isFinite(n) && n > 0);
    return prices.length ? Math.min(...prices) : null;
  }, [live]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">{p?.brand}{p?.style_number ? ` · ${p.style_number}` : ''}</p>
            <h3 className="font-display font-semibold text-gray-900 truncate">{p?.name || 'Product'}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4"><X className="w-5 h-5" /></button>
        </div>

        {!detail && !error && (
          <div className="py-16 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /><p className="text-xs mt-2">Loading live S&amp;S data…</p></div>
        )}
        {error && <div className="p-6 text-sm text-red-600">{error}</div>}

        {detail && (
          <div className="p-6">
            <div className="grid md:grid-cols-[280px_1fr] gap-6">
              <div>
                {activeImage ? (
                  <img src={activeImage} alt={p?.name || ''} className="w-full rounded-lg border border-gray-200 bg-white object-contain" />
                ) : (
                  <div className="w-full aspect-square rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center text-gray-300 text-sm">No image</div>
                )}
                <div className="mt-3 text-sm space-y-1">
                  {fromPrice !== null && <p className="text-gray-900 font-semibold">Wholesale from ${fromPrice.toFixed(2)}</p>}
                  {p?.retail_price && Number(p.retail_price) > 0 && <p className="text-gray-600">Retail ${Number(p.retail_price).toFixed(2)}</p>}
                  {p?.custom_price && Number(p.custom_price) > 0 && <p className="text-gray-600">Your price ${Number(p.custom_price).toFixed(2)}</p>}
                  {spec.material && <p className="text-xs text-gray-500">{spec.material}</p>}
                  {spec.weight && <p className="text-xs text-gray-500">{spec.weight}</p>}
                </div>
              </div>

              <div className="min-w-0">
                {live && live.colors.length > 0 ? (
                  <>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">
                      {live.colors.length} color{live.colors.length === 1 ? '' : 's'}
                      {activeColor && <> — selected: <span className="text-gray-900">{activeColor}</span></>}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {live.colors.map((c) => (
                        <button
                          key={c.name}
                          type="button"
                          onClick={() => setActiveColor(c.name)}
                          title={c.name}
                          className={`w-9 h-9 rounded border-2 overflow-hidden ${activeColor === c.name ? 'border-red-600 ring-1 ring-red-300' : 'border-gray-200 hover:border-gray-400'}`}
                          style={!c.swatch && c.hex ? { backgroundColor: `#${c.hex.replace('#', '')}` } : undefined}
                        >
                          {c.swatch && <img src={c.swatch} alt={c.name} className="w-full h-full object-cover" />}
                        </button>
                      ))}
                    </div>

                    <div className="border border-gray-200 rounded-lg overflow-x-auto">
                      <table className="w-full text-sm whitespace-nowrap">
                        <thead>
                          <tr className="bg-gray-50 text-left text-gray-500">
                            <th className="px-3 py-2 font-medium">Size</th>
                            <th className="px-3 py-2 font-medium text-right">Price</th>
                            <th className="px-3 py-2 font-medium text-right">Case</th>
                            <th className="px-3 py-2 font-medium text-right">Stock</th>
                            {warehouses.map((w) => <th key={w} className="px-3 py-2 font-medium text-right">{w}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {colorRows.map((r) => (
                            <tr key={r.sku}>
                              <td className="px-3 py-2 font-medium text-gray-900">{r.sizeName}</td>
                              <td className="px-3 py-2 text-right">{r.price != null ? `$${r.price.toFixed(2)}` : '—'}</td>
                              <td className="px-3 py-2 text-right text-gray-500">{r.caseQty ?? '—'}</td>
                              <td className={`px-3 py-2 text-right font-semibold ${r.stock.total === 0 ? 'text-red-600' : 'text-green-700'}`}>{r.stock.total.toLocaleString()}</td>
                              {warehouses.map((w) => (
                                <td key={w} className="px-3 py-2 text-right text-gray-600">{(r.stock.warehouses[w] ?? 0).toLocaleString()}</td>
                              ))}
                            </tr>
                          ))}
                          {colorRows.length === 0 && (
                            <tr><td colSpan={4 + warehouses.length} className="px-3 py-6 text-center text-gray-400">No SKUs for this color.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">
                    {live === null
                      ? 'This product has no S&S link — no live data available.'
                      : 'No live S&S data came back for this style.'}
                  </p>
                )}
              </div>
            </div>

            {spec.description && (
              <div className="mt-6 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1.5">Description</p>
                <p className="text-sm text-gray-700 whitespace-pre-line">{String(spec.description).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')}</p>
              </div>
            )}

            {p?.ss_id && (
              <a
                href={`https://www.ssactivewear.com/p/${(p.brand || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')}/${(p.style_number || '').toLowerCase()}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-4 text-xs text-blue-600 hover:underline"
              >
                Open on ssactivewear.com <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
