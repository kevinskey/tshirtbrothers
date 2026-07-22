// TSB-internal detail page for one group store. Shows/edits the store,
// lists products, and offers an S&S catalog picker to publish new
// products. Route: /admin/group-stores/:id.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Plus, Search, ExternalLink, X, Trash2 } from 'lucide-react';
import {
  fetchGroupStore, updateGroupStore, addGroupStoreProduct,
  searchSsCatalog, addGroupStoreAdmin, removeGroupStoreAdmin,
  fetchGroupStoreMockups, addGroupStoreProductFromMockup,
  type GroupStoreDetail, type SsCatalogItem, type MockupCatalogItem,
} from '@/lib/api';

function usd(cents: number | null) { return cents == null ? '—' : `$${(cents / 100).toFixed(2)}`; }

export default function AdminGroupStoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const storeId = parseInt(id ?? '', 10);
  const [data, setData] = useState<GroupStoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [showMockupPicker, setShowMockupPicker] = useState(false);
  const [showAddAdmin, setShowAddAdmin] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetchGroupStore(storeId);
      setData(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  };
  useEffect(() => { if (Number.isFinite(storeId)) void load(); }, [storeId]);

  if (loading || !data) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>;
  }
  const { store, products, admins } = data;

  const toggleStatus = async () => {
    const next = store.status === 'active' ? 'paused' : 'active';
    try {
      await updateGroupStore(storeId, { status: next });
      toast.success(`Store ${next}`);
      void load();
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center gap-4">
          <Link to="/admin/group-stores" className="text-sm text-gray-500 hover:text-gray-900 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Group stores
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              <Link to={`/stores/${store.slug}`} target="_blank" rel="noreferrer"
                className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                /stores/{store.slug} <ExternalLink className="w-3 h-3" />
              </Link>
              {store.subdomain ? (
                <a href={`https://${store.subdomain}.tshirtbrothers.com`} target="_blank" rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                  {store.subdomain}.tshirtbrothers.com <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <SubdomainSetter storeId={storeId} onSet={() => void load()} />
              )}
            </div>
          </div>
          <button onClick={toggleStatus}
            className={`px-3 py-1.5 text-sm rounded-md border ${
              store.status === 'active' ? 'border-yellow-300 text-yellow-700 hover:bg-yellow-50' : 'border-green-300 text-green-700 hover:bg-green-50'
            }`}>
            {store.status === 'active' ? 'Pause store' : 'Reactivate store'}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Products ({products.length})</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowMockupPicker(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50">
                <Plus className="w-4 h-4" /> Add from mockup
              </button>
              <button onClick={() => setShowPicker(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-md text-sm">
                <Plus className="w-4 h-4" /> Add from S&S catalog
              </button>
            </div>
          </div>
          {products.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">
              No products yet. Click <strong>Add from mockup</strong> to publish an existing design, or <strong>Add from S&S catalog</strong> to build a new one.
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">S&S SKU</th>
                    <th className="px-4 py-3 text-left">Retail</th>
                    <th className="px-4 py-3 text-left">Blank</th>
                    <th className="px-4 py-3 text-left">Decoration</th>
                    <th className="px-4 py-3 text-left">Margin</th>
                    <th className="px-4 py-3 text-left">Min Qty</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map((p) => {
                    const margin = (p.blank_cost_cents != null && p.decoration_cost_cents != null)
                      ? p.retail_price_cents - p.blank_cost_cents - p.decoration_cost_cents
                      : null;
                    return (
                      <tr key={p.id}>
                        <td className="px-4 py-3 font-semibold text-gray-900">{p.title}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.tsb_blank_ss_id}</td>
                        <td className="px-4 py-3 text-gray-900">{usd(p.retail_price_cents)}</td>
                        <td className="px-4 py-3 text-gray-600">{usd(p.blank_cost_cents)}</td>
                        <td className="px-4 py-3 text-gray-600">{usd(p.decoration_cost_cents)}</td>
                        <td className={`px-4 py-3 font-semibold ${margin != null && margin > 0 ? 'text-green-700' : 'text-gray-500'}`}>
                          {usd(margin)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{p.min_qty}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                            p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>{p.is_active ? 'Active' : 'Off'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Group admins ({admins.length})</h2>
            <button onClick={() => setShowAddAdmin(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50">
              <Plus className="w-4 h-4" /> Invite admin
            </button>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {admins.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">No group admins yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Last login</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {admins.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 text-gray-900">{a.email}</td>
                      <td className="px-4 py-3 text-gray-600">{a.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{a.role.replace('_', ' ')}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{a.last_login_at ? new Date(a.last_login_at).toLocaleString() : 'never'}</td>
                      <td className="px-4 py-3 text-right">
                        <button className="text-gray-400 hover:text-red-600" onClick={async () => {
                          if (!confirm(`Remove ${a.email}?`)) return;
                          try {
                            await removeGroupStoreAdmin(storeId, a.id);
                            toast.success('Admin removed');
                            void load();
                          } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>

      {showPicker && (
        <SsCatalogPicker storeId={storeId} onClose={() => setShowPicker(false)} onAdded={() => { setShowPicker(false); void load(); }} />
      )}
      {showMockupPicker && (
        <MockupPicker storeId={storeId} onClose={() => setShowMockupPicker(false)} onAdded={() => { setShowMockupPicker(false); void load(); }} />
      )}
      {showAddAdmin && (
        <AddAdminModal storeId={storeId} onClose={() => setShowAddAdmin(false)} onAdded={() => { setShowAddAdmin(false); void load(); }} />
      )}
    </div>
  );
}

// ── S&S catalog picker + product publish form ────────────────────────────
function SsCatalogPicker({ storeId, onClose, onAdded }: { storeId: number; onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('');
  const [results, setResults] = useState<SsCatalogItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<SsCatalogItem | null>(null);

  // Debounced live search
  useEffect(() => {
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const data = await searchSsCatalog(q, brand);
        setResults(data.results);
      } catch (err) { console.error(err); }
      finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, brand]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900 flex-1">S&S catalog</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 border-b border-gray-100 flex gap-2">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              placeholder="Search style name or SKU…"
              className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm" />
          </div>
          <input value={brand} onChange={(e) => setBrand(e.target.value)}
            placeholder="Brand (Bella+Canvas, Gildan…)"
            className="w-56 border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>

        <div className="flex-1 overflow-y-auto">
          {busy && <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div>}
          {!busy && results.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">No results.</div>
          )}
          {!busy && results.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
              {results.map((r) => (
                <button key={r.ss_id} onClick={() => setPicked(r)}
                  className="text-left bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                  <div className="aspect-square bg-white">
                    {r.image_url ? (
                      <img src={r.image_url} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">No image</div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-gray-500">{r.brand} · {r.ss_id}</p>
                    <p className="text-sm font-semibold line-clamp-2">{r.name}</p>
                    <p className="text-xs text-gray-500 mt-1">Cost ${Number(r.base_cost || 0).toFixed(2)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {picked && <PublishProductForm storeId={storeId} item={picked} onClose={() => setPicked(null)} onAdded={onAdded} />}
    </div>
  );
}

// Convert S&S HTML descriptions (unordered lists, tags, entities) into
// clean plain text for the storefront description field.
function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return '';
  return String(html)
    .replace(/<\/(li|p|div|br|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
    .trim();
}

// Normalize S&S sizes/colors that may arrive as [] / [""] / strings.
function cleanList(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((v) => String(v).trim()).filter(Boolean);
}

// Reusable pill toggle. Selected state uses filled dark; unselected is
// bordered. Keyboard-accessible via <button>.
function PillToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
        active
          ? 'bg-gray-900 border-gray-900 text-white'
          : 'bg-white border-gray-300 text-gray-700 hover:border-gray-500'
      }`}
    >{label}</button>
  );
}

function PublishProductForm({ storeId, item, onClose, onAdded }: {
  storeId: number; item: SsCatalogItem; onClose: () => void; onAdded: () => void;
}) {
  const baseCostCents = Math.round(Number(item.base_cost || 0) * 100);
  const availableSizes  = useMemo(() => cleanList(item.sizes),  [item.sizes]);
  const availableColors = useMemo(() => cleanList(item.colors), [item.colors]);
  const fallbackSizes   = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
  const sizeOptions     = availableSizes.length > 0 ? availableSizes : fallbackSizes;

  const [title, setTitle] = useState(item.name);
  const [slug, setSlug] = useState(item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  const [retailDollars, setRetailDollars] = useState(((baseCostCents + 900) / 100).toFixed(2));
  const [decorationDollars, setDecorationDollars] = useState('5.00');
  const [description, setDescription] = useState(() => htmlToPlainText(item.description_html));
  const [minQty, setMinQty] = useState(1);
  const [sizes, setSizes] = useState<string[]>(() =>
    availableSizes.length > 0
      ? availableSizes.filter((s) => ['S', 'M', 'L', 'XL', '2XL'].includes(s.toUpperCase()))
      : ['S', 'M', 'L', 'XL'],
  );
  const [colors, setColors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const margin = useMemo(() => {
    const r = Math.round(parseFloat(retailDollars || '0') * 100);
    const d = Math.round(parseFloat(decorationDollars || '0') * 100);
    return r - baseCostCents - d;
  }, [retailDollars, decorationDollars, baseCostCents]);

  const toggle = (arr: string[], setArr: (v: string[]) => void, value: string) => {
    setArr(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await addGroupStoreProduct(storeId, {
        tsb_blank_ss_id: item.ss_id,
        title,
        slug,
        retail_price_cents: Math.round(parseFloat(retailDollars) * 100),
        description: description || undefined,
        cover_image: item.image_url || undefined,
        variants: { sizes, colors },
        blank_cost_cents: baseCostCents,
        decoration_cost_cents: Math.round(parseFloat(decorationDollars) * 100),
        min_qty: minQty,
      });
      toast.success('Product published');
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <form onSubmit={submit}
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        {/* Sticky header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-gray-100 z-10 px-6 py-4 flex items-center gap-4">
          {item.image_url && (
            <img src={item.image_url} alt=""
              className="w-14 h-14 object-contain rounded-lg bg-gray-50 flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">
              {item.brand} · {item.ss_id}
            </p>
            <p className="font-semibold text-gray-900 truncate">{item.name}</p>
          </div>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-900 rounded-full p-1 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basics */}
          <section className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title on store</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:border-gray-900 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">URL slug</label>
              <div className="flex items-center gap-2 rounded-lg border border-gray-300 focus-within:border-gray-900">
                <span className="pl-3 text-xs text-gray-400 font-mono">/product/</span>
                <input required value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  className="flex-1 px-1 py-2.5 text-sm font-mono bg-transparent focus:outline-none" />
              </div>
            </div>
          </section>

          {/* Pricing grid */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pricing</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Retail</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input required type="number" step="0.01" value={retailDollars}
                    onChange={(e) => setRetailDollars(e.target.value)}
                    className="w-full pl-6 pr-2 py-2 rounded-lg border border-gray-300 text-sm focus:border-gray-900 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Decoration</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input type="number" step="0.01" value={decorationDollars}
                    onChange={(e) => setDecorationDollars(e.target.value)}
                    className="w-full pl-6 pr-2 py-2 rounded-lg border border-gray-300 text-sm focus:border-gray-900 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Blank (S&S)</label>
                <input disabled value={`$${(baseCostCents / 100).toFixed(2)}`}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500" />
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-1">Min qty</label>
                <input type="number" min={1} value={minQty}
                  onChange={(e) => setMinQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:border-gray-900 focus:outline-none" />
              </div>
            </div>
          </section>

          {/* Sizes */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Sizes offered</p>
              <span className="text-[11px] text-gray-400">
                {sizes.length} selected {availableSizes.length > 0 && `· of ${availableSizes.length} available`}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {sizeOptions.map((s) => (
                <PillToggle key={s} label={s} active={sizes.includes(s)} onClick={() => toggle(sizes, setSizes, s)} />
              ))}
            </div>
            {availableSizes.length === 0 && (
              <p className="mt-2 text-[11px] text-amber-600">
                S&S didn't return specific sizes for this style — fallbacks shown. Verify with the S&S catalog before publishing.
              </p>
            )}
          </section>

          {/* Colors */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Colors offered</p>
              <span className="text-[11px] text-gray-400">
                {colors.length} selected {availableColors.length > 0 && `· of ${availableColors.length} available`}
              </span>
            </div>
            {availableColors.length > 0 ? (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-1">
                {availableColors.map((c) => (
                  <PillToggle key={c} label={c} active={colors.includes(c)} onClick={() => toggle(colors, setColors, c)} />
                ))}
              </div>
            ) : (
              <div>
                <input value={colors.join(', ')}
                  onChange={(e) => setColors(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  placeholder="Type colors, comma-separated"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:outline-none" />
                <p className="mt-1 text-[11px] text-amber-600">
                  S&S didn't return colors for this style — enter them manually.
                </p>
              </div>
            )}
          </section>

          {/* Description */}
          <section>
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</p>
              {item.description_html && (
                <button type="button"
                  onClick={() => setDescription(htmlToPlainText(item.description_html))}
                  className="text-[11px] text-blue-600 hover:underline">
                  Reset to S&S copy
                </button>
              )}
            </div>
            <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this shirt for? Feel free to add campaign context…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:outline-none" />
          </section>

          {/* Margin summary */}
          <div className={`rounded-lg p-4 text-sm ${margin > 0 ? 'bg-green-50 text-green-900' : 'bg-red-50 text-red-800'}`}>
            <p className="font-semibold">Margin per item: ${(margin / 100).toFixed(2)}</p>
            {margin > 0 && <p className="text-xs opacity-80 mt-0.5">Fundraiser split (if configured) comes from this margin.</p>}
            {margin <= 0 && <p className="text-xs opacity-80 mt-0.5">Retail doesn't cover blank + decoration cost.</p>}
          </div>
        </div>

        {/* Sticky footer */}
        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg">
            Back
          </button>
          <button type="submit" disabled={busy}
            className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-black">
            {busy ? 'Publishing…' : 'Publish to store'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SubdomainSetter({ storeId, onSet }: { storeId: number; onSet: () => void }) {
  const [value, setValue] = useState('');
  const [busy, setBusy]   = useState(false);
  const save = async () => {
    if (!value) return;
    setBusy(true);
    try {
      await updateGroupStore(storeId, { subdomain: value });
      toast.success('Subdomain set');
      onSet();
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <input value={value} onChange={(e) => setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        placeholder="set subdomain"
        className="border border-gray-300 rounded px-2 py-0.5 font-mono text-[11px] w-32" />
      <span className="text-gray-400">.tshirtbrothers.com</span>
      <button onClick={save} disabled={busy || !value}
        className="ml-1 px-2 py-0.5 bg-gray-900 text-white rounded text-[10px] disabled:opacity-50">
        {busy ? '…' : 'Set'}
      </button>
    </span>
  );
}

// ── Mockup picker + publish form ─────────────────────────────────────────
function MockupPicker({ storeId, onClose, onAdded }: { storeId: number; onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MockupCatalogItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<MockupCatalogItem | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const data = await fetchGroupStoreMockups(q);
        setResults(data.mockups);
      } catch (err) { console.error(err); }
      finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900 flex-1">Mockups</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 border-b border-gray-100">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
              placeholder="Search by mockup name, product, or customer…"
              className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {busy && <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div>}
          {!busy && results.length === 0 && (
            <div className="p-8 text-center text-gray-500 text-sm">
              No mockups yet. Create one in <strong>/admin</strong> → Mockups.
            </div>
          )}
          {!busy && results.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4">
              {results.map((r) => {
                const img = r.preview_image_url || r.product_image_url;
                const canPublish = !!r.product_ss_id;
                return (
                  <button key={r.id}
                    onClick={() => canPublish && setPicked(r)}
                    disabled={!canPublish}
                    className={`text-left bg-gray-50 rounded-lg border border-gray-200 overflow-hidden ${
                      canPublish ? 'hover:bg-gray-100 hover:border-gray-400' : 'opacity-50 cursor-not-allowed'
                    }`}>
                    <div className="aspect-square bg-white">
                      {img ? (
                        <img src={img} alt="" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">No image</div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-sm font-semibold line-clamp-1">{r.name || `Mockup #${r.id}`}</p>
                      <p className="text-xs text-gray-500 line-clamp-1">
                        {r.product_name || (canPublish ? 'S&S SKU set' : 'No S&S blank — can\'t publish')}
                      </p>
                      {r.customer_name && (
                        <p className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">For {r.customer_name}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {picked && <PublishFromMockupForm storeId={storeId} mockup={picked} onClose={() => setPicked(null)} onAdded={onAdded} />}
    </div>
  );
}

function PublishFromMockupForm({ storeId, mockup, onClose, onAdded }: {
  storeId: number; mockup: MockupCatalogItem; onClose: () => void; onAdded: () => void;
}) {
  const baseCostCents = mockup.product_base_price != null
    ? Math.round(Number(mockup.product_base_price) * 100)
    : 0;
  const [title, setTitle] = useState(mockup.name || mockup.product_name || 'Custom Product');
  const [slug, setSlug] = useState(
    (mockup.name || mockup.product_name || 'custom-product')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
  );
  const [retailDollars, setRetailDollars] = useState(((baseCostCents + 900) / 100).toFixed(2));
  const [decorationDollars, setDecorationDollars] = useState('5.00');
  const [description, setDescription] = useState('');
  const [minQty, setMinQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const margin = useMemo(() => {
    const r = Math.round(parseFloat(retailDollars || '0') * 100);
    const d = Math.round(parseFloat(decorationDollars || '0') * 100);
    return r - baseCostCents - d;
  }, [retailDollars, decorationDollars, baseCostCents]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await addGroupStoreProductFromMockup(storeId, {
        mockup_id: mockup.id,
        title, slug,
        retail_price_cents: Math.round(parseFloat(retailDollars) * 100),
        decoration_cost_cents: Math.round(parseFloat(decorationDollars) * 100),
        min_qty: minQty,
        description: description || undefined,
      });
      toast.success('Product published from mockup');
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const previewImage = mockup.preview_image_url || mockup.product_image_url;

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-lg max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
          {previewImage && <img src={previewImage} alt="" className="w-14 h-14 object-contain rounded bg-gray-50" />}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">Mockup #{mockup.id} · {mockup.product_ss_id}</p>
            <p className="font-semibold truncate">{mockup.name || mockup.product_name}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-900"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Title on store</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">URL slug</label>
            <input required value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Retail ($)</label>
            <input required type="number" step="0.01" value={retailDollars} onChange={(e) => setRetailDollars(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Decoration ($)</label>
            <input type="number" step="0.01" value={decorationDollars} onChange={(e) => setDecorationDollars(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Blank cost (locked)</label>
            <input disabled value={baseCostCents ? `$${(baseCostCents / 100).toFixed(2)}` : '—'}
              className="w-full border border-gray-200 bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Min qty</label>
            <input type="number" min={1} value={minQty}
              onChange={(e) => setMinQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Description</label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
        </div>

        <div className={`rounded-md p-3 text-sm ${margin > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
          Margin per item: <strong>${(margin / 100).toFixed(2)}</strong>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Back</button>
          <button type="submit" disabled={busy}
            className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-semibold disabled:opacity-50">
            {busy ? 'Publishing…' : 'Publish to store'}
          </button>
        </div>
      </form>
    </div>
  );
}

function AddAdminModal({ storeId, onClose, onAdded }: { storeId: number; onClose: () => void; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'viewer' | 'bulk_buyer' | 'owner'>('viewer');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await addGroupStoreAdmin(storeId, { email, name: name || undefined, role });
      toast.success('Admin added');
      onAdded();
    } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Invite group admin</h2>
        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value as 'viewer' | 'bulk_buyer' | 'owner')}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="viewer">Viewer (orders only)</option>
            <option value="bulk_buyer">Bulk buyer (orders + submit bulk orders)</option>
            <option value="owner">Owner (all of above + manage admins)</option>
          </select>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
          <button type="submit" disabled={busy}
            className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-semibold disabled:opacity-50">
            {busy ? 'Adding…' : 'Add admin'}
          </button>
        </div>
      </form>
    </div>
  );
}
