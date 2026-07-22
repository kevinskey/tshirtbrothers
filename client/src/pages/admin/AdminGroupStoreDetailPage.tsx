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
  type GroupStoreDetail, type SsCatalogItem,
} from '@/lib/api';

function usd(cents: number | null) { return cents == null ? '—' : `$${(cents / 100).toFixed(2)}`; }

export default function AdminGroupStoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const storeId = parseInt(id ?? '', 10);
  const [data, setData] = useState<GroupStoreDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
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
            <Link to={`/stores/${store.slug}`} target="_blank" rel="noreferrer"
              className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
              /stores/{store.slug} <ExternalLink className="w-3 h-3" />
            </Link>
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
            <button onClick={() => setShowPicker(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-md text-sm">
              <Plus className="w-4 h-4" /> Add from S&S catalog
            </button>
          </div>
          {products.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-lg p-10 text-center text-gray-500">
              No products yet. Click <strong>Add from S&S catalog</strong> to curate the first one.
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

function PublishProductForm({ storeId, item, onClose, onAdded }: {
  storeId: number; item: SsCatalogItem; onClose: () => void; onAdded: () => void;
}) {
  const baseCostCents = Math.round(Number(item.base_cost || 0) * 100);
  const [title, setTitle] = useState(item.name);
  const [slug, setSlug] = useState(item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  const [retailDollars, setRetailDollars] = useState(((baseCostCents + 900) / 100).toFixed(2));
  const [decorationDollars, setDecorationDollars] = useState('5.00');
  const [description, setDescription] = useState('');
  const [minQty, setMinQty] = useState(1);
  const [sizes, setSizes] = useState<string[]>(item.sizes.length > 0 ? item.sizes : ['S', 'M', 'L', 'XL']);
  const [colors, setColors] = useState<string[]>(item.colors.length > 0 ? item.colors.slice(0, 3) : []);
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
      <form onSubmit={submit} className="bg-white rounded-lg max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
          {item.image_url && <img src={item.image_url} alt="" className="w-12 h-12 object-contain rounded" />}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">{item.brand} · {item.ss_id}</p>
            <p className="font-semibold truncate">{item.name}</p>
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
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Decoration cost ($)</label>
            <input type="number" step="0.01" value={decorationDollars} onChange={(e) => setDecorationDollars(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Blank cost (locked from S&S)</label>
            <input disabled value={`$${(baseCostCents / 100).toFixed(2)}`}
              className="w-full border border-gray-200 bg-gray-50 rounded-md px-3 py-2 text-sm text-gray-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Min qty</label>
            <input type="number" min={1} value={minQty}
              onChange={(e) => setMinQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Sizes (comma-separated)</label>
            <input value={sizes.join(', ')}
              onChange={(e) => setSizes(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Colors (comma-separated)</label>
            <input value={colors.join(', ')}
              onChange={(e) => setColors(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
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
          {margin > 0 && ' — fundraiser split (if any) comes from this'}
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
