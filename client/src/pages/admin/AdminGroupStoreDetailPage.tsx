// TSB-internal detail page for one group store. Shows/edits the store,
// lists products, and offers an S&S catalog picker to publish new
// products. Route: /admin/group-stores/:id.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, Plus, Search, ExternalLink, X, Trash2, AlertTriangle } from 'lucide-react';
import {
  fetchGroupStore, updateGroupStore, addGroupStoreProduct,
  searchSsCatalog, addGroupStoreAdmin, removeGroupStoreAdmin, fetchSsStyleDetail,
  setGroupStoreProductActive, deleteGroupStoreProduct,
  uploadGroupStoreMockup, updateGroupStoreProduct,
  fetchGroupStoreCoupons, createGroupStoreCoupon, deactivateGroupStoreCoupon, type StoreCoupon,
  fetchGroupStoreMockups, addGroupStoreProductFromMockup,
  fetchGroupStoreDesignDrafts, approveGroupStoreDesignDraft, rejectGroupStoreDesignDraft,
  deleteGroupStore,
  type GroupStoreDetail, type SsCatalogItem, type MockupCatalogItem, type DesignDraft,
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
  // Change-cover flow: one shared hidden file input; the row's camera
  // button records which product the next picked file belongs to.
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [coverTargetId, setCoverTargetId] = useState<number | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [editProduct, setEditProduct] = useState<GroupStoreDetail['products'][number] | null>(null);

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

  const setStatus = async (next: 'active' | 'paused' | 'off') => {
    try {
      await updateGroupStore(storeId, { status: next });
      toast.success(next === 'off' ? 'Store retired' : `Store ${next}`);
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
        <DangerZone
          store={store}
          productCount={products.length}
          onRetire={() => void setStatus('off')}
          onReactivate={() => void setStatus('active')}
        />
        <input
          ref={coverInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file || coverTargetId == null) return;
            setCoverBusy(true);
            try {
              const url = await uploadGroupStoreMockup(file, store.slug);
              await updateGroupStoreProduct(storeId, coverTargetId, { cover_image: url });
              toast.success('Product photo updated');
              void load();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : String(err));
            } finally {
              setCoverBusy(false);
              setCoverTargetId(null);
            }
          }}
        />
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
                    <th className="px-4 py-3 text-left">Photo</th>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">S&S SKU</th>
                    <th className="px-4 py-3 text-left">Retail</th>
                    <th className="px-4 py-3 text-left">Blank</th>
                    <th className="px-4 py-3 text-left">Decoration</th>
                    <th className="px-4 py-3 text-left">Margin</th>
                    <th className="px-4 py-3 text-left">Min Qty</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {products.map((p) => {
                    const margin = (p.blank_cost_cents != null && p.decoration_cost_cents != null)
                      ? p.retail_price_cents - p.blank_cost_cents - p.decoration_cost_cents
                      : null;
                    return (
                      <tr key={p.id}>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            title="Click to upload a new product photo"
                            disabled={coverBusy}
                            onClick={() => { setCoverTargetId(p.id); coverInputRef.current?.click(); }}
                            className="relative w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden group/cover disabled:opacity-50"
                          >
                            {p.cover_image ? (
                              <img src={p.cover_image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="w-full h-full flex items-center justify-center text-gray-300 text-[9px]">no photo</span>
                            )}
                            <span className="absolute inset-0 hidden group-hover/cover:flex items-center justify-center bg-black/50 text-white text-[9px] font-semibold">
                              {coverBusy && coverTargetId === p.id ? '…' : 'Change'}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => setEditProduct(p)}
                            className="font-semibold text-gray-900 hover:underline text-left">
                            {p.title}
                          </button>
                          {p.campaign_ref && (
                            <span className="block mt-0.5 text-[10px] font-mono text-purple-600">
                              ◆ {p.campaign_ref}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.tsb_blank_ss_id}</td>
                        <td className="px-4 py-3 text-gray-900">{usd(p.retail_price_cents)}</td>
                        <td className="px-4 py-3 text-gray-600">{usd(p.blank_cost_cents)}</td>
                        <td className="px-4 py-3 text-gray-600">{usd(p.decoration_cost_cents)}</td>
                        <td className={`px-4 py-3 font-semibold ${margin != null && margin > 0 ? 'text-green-700' : 'text-gray-500'}`}>
                          {usd(margin)}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{p.min_qty}</td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            title={p.is_active ? 'Click to pause selling' : 'Click to resume selling'}
                            onClick={async () => {
                              try {
                                await setGroupStoreProductActive(storeId, p.id, !p.is_active);
                                toast.success(p.is_active ? `"${p.title}" paused` : `"${p.title}" active`);
                                void load();
                              } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
                            }}
                            className={`inline-block px-2 py-0.5 rounded-full text-xs cursor-pointer hover:ring-2 hover:ring-offset-1 ${
                              p.is_active ? 'bg-green-100 text-green-700 hover:ring-green-300' : 'bg-gray-100 text-gray-600 hover:ring-gray-300'
                            }`}>{p.is_active ? 'Active' : 'Off'}</button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            title="Delete product"
                            className="text-gray-400 hover:text-red-600"
                            onClick={async () => {
                              if (!confirm(`Delete "${p.title}" from this store?`)) return;
                              try {
                                const r = await deleteGroupStoreProduct(storeId, p.id);
                                toast.success(r.deleted
                                  ? `"${r.title}" deleted`
                                  : `"${r.title}" has orders — deactivated instead`);
                                void load();
                              } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
                            }}>
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

        <CouponsSection storeId={storeId} />

        <PendingDesignsSection storeId={storeId} />
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
      {editProduct && (
        <EditProductModal
          storeId={storeId}
          storeSlug={store.slug}
          product={editProduct}
          onClose={() => setEditProduct(null)}
          onSaved={() => { setEditProduct(null); void load(); }}
        />
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
  return x
    .map((v) => {
      // Colors are stored as { name, hex, swatch, image } objects; sizes
      // as plain strings. Accept both so neither renders "[object Object]".
      if (v && typeof v === 'object' && 'name' in v) return String((v as { name: unknown }).name).trim();
      return String(v).trim();
    })
    .filter((v) => Boolean(v) && v !== '[object Object]');
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
  const itemBaseCostCents = Math.round(Number(item.base_cost || 0) * 100);
  const itemSizes  = useMemo(() => cleanList(item.sizes),  [item.sizes]);
  const itemColors = useMemo(() => cleanList(item.colors), [item.colors]);
  const fallbackSizes = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

  // Live enrichment: the picker row comes from the products table, whose
  // nightly sync doesn't carry SKU-level data — most styles have empty
  // colors/sizes and a $0 blank cost. Pull the real SKU list from S&S
  // on demand (the server heals the products row as a side effect).
  const [liveSizes, setLiveSizes] = useState<string[]>([]);
  const [liveColors, setLiveColors] = useState<string[]>([]);
  const [liveBaseCostCents, setLiveBaseCostCents] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const availableSizes  = itemSizes.length > 0 ? itemSizes : liveSizes;
  const availableColors = itemColors.length > 0 ? itemColors : liveColors;
  const baseCostCents   = itemBaseCostCents > 0 ? itemBaseCostCents : (liveBaseCostCents ?? 0);
  const sizeOptions     = availableSizes.length > 0 ? availableSizes : fallbackSizes;

  const [title, setTitle] = useState(item.name);
  const [slug, setSlug] = useState(item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
  const [retailDollars, setRetailDollars] = useState(((itemBaseCostCents + 900) / 100).toFixed(2));
  const retailTouched = useRef(false);
  const [decorationDollars, setDecorationDollars] = useState('5.00');
  const [description, setDescription] = useState(() => htmlToPlainText(item.description_html));
  const [minQty, setMinQty] = useState(1);
  const [sizes, setSizes] = useState<string[]>(() =>
    itemSizes.length > 0
      ? itemSizes.filter((s) => ['S', 'M', 'L', 'XL', '2XL'].includes(s.toUpperCase()))
      : ['S', 'M', 'L', 'XL'],
  );
  const [colors, setColors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [collection, setCollection] = useState('');
  const [coverUrl, setCoverUrl] = useState<string | null>(item.image_url);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (itemSizes.length > 0 && itemColors.length > 0 && itemBaseCostCents > 0) return;
    let cancelled = false;
    setDetailLoading(true);
    fetchSsStyleDetail(item.ss_id)
      .then((d) => {
        if (cancelled) return;
        const dSizes = cleanList(d.sizes);
        const dColors = cleanList(d.colors);
        setLiveSizes(dSizes);
        setLiveColors(dColors);
        const cost = Math.round(Number(d.base_cost || 0) * 100);
        if (cost > 0) {
          setLiveBaseCostCents(cost);
          // Re-derive the suggested retail (blank + $9) if the admin
          // hasn't typed their own price yet.
          if (itemBaseCostCents <= 0 && !retailTouched.current) {
            setRetailDollars(((cost + 900) / 100).toFixed(2));
          }
        }
        // Seed the size selection from the real size run if the form
        // started on fallbacks and the admin hasn't toggled anything.
        if (itemSizes.length === 0 && dSizes.length > 0) {
          setSizes((prev) =>
            prev.join('|') === 'S|M|L|XL'
              ? dSizes.filter((s) => ['S', 'M', 'L', 'XL', '2XL'].includes(s.toUpperCase()))
              : prev.filter((s) => dSizes.includes(s)),
          );
        }
      })
      .catch(() => { /* fall back to manual entry — warnings below cover it */ })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.ss_id]);

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
        cover_image: coverUrl || undefined,
        campaign_ref: collection.trim() || undefined,
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

          {/* Cover photo + collection */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Product photo</p>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden shrink-0">
                  {coverUrl ? <img src={coverUrl} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px]">none</div>}
                </div>
                <div>
                  <button type="button" disabled={coverUploading} onClick={() => coverRef.current?.click()}
                    className="px-3 py-1.5 border border-gray-300 rounded-md text-xs hover:bg-gray-50 disabled:opacity-50">
                    {coverUploading ? 'Uploading…' : 'Upload photo'}
                  </button>
                  {coverUrl !== item.image_url && item.image_url && (
                    <button type="button" onClick={() => setCoverUrl(item.image_url)}
                      className="block mt-1 text-[11px] text-blue-600 hover:underline">Use S&S photo</button>
                  )}
                  <input ref={coverRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0]; e.target.value = '';
                      if (!f) return;
                      setCoverUploading(true);
                      try { setCoverUrl(await uploadGroupStoreMockup(f, `store-${storeId}`)); }
                      catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
                      finally { setCoverUploading(false); }
                    }} />
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Collection</p>
              <input value={collection}
                onChange={(e) => setCollection(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="e.g. halloween (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-gray-900 focus:outline-none" />
              <p className="mt-1 text-[11px] text-gray-400">
                Tag matching the storefront's featured collection key.
              </p>
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
                    onChange={(e) => { retailTouched.current = true; setRetailDollars(e.target.value); }}
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
                {detailLoading
                  ? 'Fetching the size run from S&S…'
                  : "S&S didn't return specific sizes for this style — fallbacks shown. Verify with the S&S catalog before publishing."}
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
                  {detailLoading
                    ? 'Fetching colors from S&S…'
                    : "S&S didn't return colors for this style — enter them manually."}
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
// ── Coupons ──────────────────────────────────────────────────────────────
// Stripe promotion codes scoped to this store. Buyers enter the code on
// the Stripe checkout page ("Add promotion code" link).
function CouponsSection({ storeId }: { storeId: number }) {
  const [coupons, setCoupons] = useState<StoreCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('10');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await fetchGroupStoreCoupons(storeId);
      setCoupons(d.coupons);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const v = parseFloat(value || '0');
      await createGroupStoreCoupon(storeId, {
        code,
        ...(kind === 'percent' ? { percent_off: v } : { amount_off_cents: Math.round(v * 100) }),
        ...(maxRedemptions ? { max_redemptions: parseInt(maxRedemptions, 10) } : {}),
        ...(expiresAt ? { expires_at: expiresAt } : {}),
      });
      toast.success(`Coupon ${code.toUpperCase()} created`);
      setCode(''); setValue(kind === 'percent' ? '10' : '5'); setMaxRedemptions(''); setExpiresAt('');
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <section>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Coupons</h2>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <form onSubmit={create} className="p-4 border-b border-gray-100 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
          <div className="col-span-2 md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Code</label>
            <input required value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
              placeholder="SPOOKY10"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <select value={kind} onChange={(e) => setKind(e.target.value as 'percent' | 'amount')}
              className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm">
              <option value="percent">% off</option>
              <option value="amount">$ off</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{kind === 'percent' ? 'Percent' : 'Dollars'}</label>
            {/* step="any": min 0.01 + step 1 put valid values on a
                .01 grid (…, 99.01) and made 100 fail validation. */}
            <input required type="number" step="any"
              min={kind === 'percent' ? 1 : 0.01}
              max={kind === 'percent' ? 100 : undefined}
              value={value} onChange={(e) => setValue(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max uses</label>
            <input type="number" min="1" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="∞"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Expires</label>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-2 py-2 text-sm" />
            </div>
            <button type="submit" disabled={busy}
              className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-semibold disabled:opacity-50">
              {busy ? '…' : 'Create'}
            </button>
          </div>
        </form>

        {loading ? (
          <div className="p-6 text-center"><Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" /></div>
        ) : coupons.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 text-center">
            No coupons yet. Codes are redeemed on the Stripe checkout page via "Add promotion code."
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Discount</th>
                <th className="px-4 py-3 text-left">Used</th>
                <th className="px-4 py-3 text-left">Expires</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-mono font-semibold">{c.code}</td>
                  <td className="px-4 py-3">
                    {c.percent_off != null ? `${c.percent_off}% off` : `$${((c.amount_off_cents ?? 0) / 100).toFixed(2)} off`}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.times_redeemed}{c.max_redemptions ? ` / ${c.max_redemptions}` : ''}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                      c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>{c.active ? 'Active' : 'Off'}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {c.active && (
                      <button className="text-gray-400 hover:text-red-600" title="Deactivate coupon"
                        onClick={async () => {
                          if (!confirm(`Deactivate ${c.code}?`)) return;
                          try {
                            await deactivateGroupStoreCoupon(storeId, c.id);
                            toast.success(`${c.code} deactivated`);
                            void load();
                          } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
                        }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

// ── Edit product modal ───────────────────────────────────────────────────
// Title, pricing, description, sizes/colors, collection tag, cover photo.
function EditProductModal({ storeId, storeSlug, product, onClose, onSaved }: {
  storeId: number;
  storeSlug: string;
  product: GroupStoreDetail['products'][number];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(product.title);
  const [retail, setRetail] = useState((product.retail_price_cents / 100).toFixed(2));
  const [deco, setDeco] = useState(product.decoration_cost_cents != null ? (product.decoration_cost_cents / 100).toFixed(2) : '');
  const [minQty, setMinQty] = useState(product.min_qty);
  const [descr, setDescr] = useState(product.description ?? '');
  const [collection, setCollection] = useState(product.campaign_ref ?? '');
  const [sizesText, setSizesText] = useState((product.variants_json?.sizes ?? []).join(', '));
  const [colorsText, setColorsText] = useState((product.variants_json?.colors ?? []).join(', '));
  const [cover, setCover] = useState(product.cover_image);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const pickCover = async (file: File) => {
    setUploading(true);
    try {
      setCover(await uploadGroupStoreMockup(file, storeSlug));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setUploading(false); }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const list = (s: string) => s.split(',').map((v) => v.trim()).filter(Boolean);
      await updateGroupStoreProduct(storeId, product.id, {
        title,
        retail_price_cents: Math.round(parseFloat(retail || '0') * 100),
        decoration_cost_cents: deco ? Math.round(parseFloat(deco) * 100) : null,
        min_qty: minQty,
        description: descr || null,
        campaign_ref: collection.trim() || null,
        variants: { sizes: list(sizesText), colors: list(colorsText) },
        ...(cover ? { cover_image: cover } : {}),
      });
      toast.success('Product updated');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <form onSubmit={save} className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-gray-100 z-10 px-6 py-4 flex items-center gap-3">
          <p className="font-semibold text-gray-900 flex-1 truncate">Edit · {product.title}</p>
          <button type="button" onClick={onClose}
            className="text-gray-400 hover:text-gray-900 rounded-full p-1 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Cover photo */}
          <section className="flex items-center gap-4">
            <div className="w-24 h-24 rounded-xl border border-gray-200 bg-gray-50 overflow-hidden shrink-0">
              {cover ? <img src={cover} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">no photo</div>}
            </div>
            <div>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="px-3 py-1.5 border border-gray-300 rounded-md text-sm hover:bg-gray-50 disabled:opacity-50">
                {uploading ? 'Uploading…' : 'Upload photo'}
              </button>
              <p className="mt-1 text-[11px] text-gray-400">PNG/JPG — shown on the storefront card and product page.</p>
              <input ref={fileRef} type="file" accept=".png,.jpg,.jpeg,.webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pickCover(f); }} />
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title</label>
              <input required value={title} onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Retail ($)</label>
              <input required type="number" step="0.01" min="0.01" value={retail} onChange={(e) => setRetail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Decoration ($)</label>
              <input type="number" step="0.01" min="0" value={deco} onChange={(e) => setDeco(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Min qty</label>
              <input type="number" min={1} value={minQty}
                onChange={(e) => setMinQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Collection</label>
              <input value={collection} onChange={(e) => setCollection(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="e.g. halloween"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:border-gray-900 focus:outline-none" />
              <p className="mt-1 text-[11px] text-gray-400">
                Matches the storefront's featured collection key. Blank = no collection.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Sizes</label>
              <input value={sizesText} onChange={(e) => setSizesText(e.target.value)}
                placeholder="S, M, L, XL, 2XL"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Colors</label>
              <input value={colorsText} onChange={(e) => setColorsText(e.target.value)}
                placeholder="Black, True Navy"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
            <textarea rows={4} value={descr} onChange={(e) => setDescr(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-gray-900 focus:outline-none" />
          </div>
        </div>

        <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 px-6 py-4 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 rounded-lg">Cancel</button>
          <button type="submit" disabled={busy || uploading}
            className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:bg-black">
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

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

        {/* min-h-0 is load-bearing: without it this flex child won't shrink
            below its content height, the parent's overflow-hidden clips the
            grid, and the list can never scroll. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
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

// ── Pending Designs ─────────────────────────────────────────────────────
// Tenant-submitted designs awaiting review. Each row shows the thumb +
// submitter; Approve opens a modal that requires only an S&S blank id +
// retail price (defaults for everything else come from the draft or the
// existing product-create endpoint). Reject writes a review_notes and
// flips status.
function PendingDesignsSection({ storeId }: { storeId: number }) {
  const [drafts, setDrafts] = useState<DesignDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<DesignDraft | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { drafts } = await fetchGroupStoreDesignDrafts(storeId, 'pending');
      setDrafts(drafts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setLoading(false); }
  };
  useEffect(() => { if (Number.isFinite(storeId)) void load(); }, [storeId]);

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">
          Pending designs ({loading ? '…' : drafts.length})
        </h2>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-gray-500 text-center">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading…
          </div>
        ) : drafts.length === 0 ? (
          <p className="p-6 text-sm text-gray-500 text-center">No pending designs.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {drafts.map((d) => (
              <li key={d.id} className="p-4 flex items-start gap-4">
                <a href={d.image_url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img
                    src={d.image_url}
                    alt={d.name}
                    className="w-24 h-24 object-contain border border-gray-200 rounded"
                    style={{
                      // Checkerboard so transparent PNGs (legacy design-only
                      // library-style captures) render visibly instead of
                      // looking like an empty tile.
                      backgroundImage:
                        'linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)',
                      backgroundSize: '16px 16px',
                      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                      backgroundColor: '#f3f4f6',
                    }}
                  />
                </a>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{d.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Submitted by {d.submitted_by_email || '—'} · {new Date(d.created_at).toLocaleString()}
                  </div>
                  {d.notes && <div className="text-sm text-gray-700 mt-2 italic">"{d.notes}"</div>}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => setApproving(d)}
                    className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700"
                  >
                    Approve → Publish
                  </button>
                  <button
                    onClick={async () => {
                      const notes = prompt(`Reject "${d.name}"?\nOptional message to the tenant (they'll see it):`);
                      if (notes === null) return;
                      try {
                        await rejectGroupStoreDesignDraft(storeId, d.id, notes || undefined);
                        toast.success('Rejected');
                        void load();
                      } catch (err) { toast.error(err instanceof Error ? err.message : String(err)); }
                    }}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {approving && (
        <ApproveDraftModal
          storeId={storeId}
          draft={approving}
          onClose={() => setApproving(null)}
          onDone={() => { setApproving(null); void load(); }}
        />
      )}
    </section>
  );
}

function ApproveDraftModal({ storeId, draft, onClose, onDone }: {
  storeId: number; draft: DesignDraft; onClose: () => void; onDone: () => void;
}) {
  const [picked, setPicked] = useState<SsCatalogItem | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SsCatalogItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [priceUsd, setPriceUsd] = useState('25.00');
  const [minQty, setMinQty] = useState('1');
  const [busy, setBusy] = useState(false);

  // If the tenant already picked a blank in the studio, resolve it via
  // the catalog once so the modal opens with that choice pre-filled and
  // the reviewer can just hit Publish. They can still 'Change' it.
  useEffect(() => {
    if (!draft.tsb_blank_ss_id) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await searchSsCatalog(draft.tsb_blank_ss_id!, '');
        const match = data.results.find((r) => r.ss_id === draft.tsb_blank_ss_id) ?? data.results[0];
        if (!cancelled && match) setPicked(match);
      } catch { /* silent — the manual picker still works */ }
    })();
    return () => { cancelled = true; };
  }, [draft.tsb_blank_ss_id]);

  // Live search over the S&S catalog. Fires on mount too (empty q) so the
  // most-recently-synced blanks show up immediately — the reviewer usually
  // wants a familiar Gildan/Bella tee, not to hunt by SKU. Debounced.
  useEffect(() => {
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchSsCatalog(search, '');
        setResults(data.results.slice(0, 12));
      } catch (err) { console.error(err); }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked) { toast.error('Pick a blank shirt first'); return; }
    const priceCents = Math.round(parseFloat(priceUsd) * 100);
    if (!Number.isFinite(priceCents) || priceCents <= 0) { toast.error('Price must be > $0'); return; }
    setBusy(true);
    try {
      const { product } = await approveGroupStoreDesignDraft(storeId, draft.id, {
        tsb_blank_ss_id: picked.ss_id,
        retail_price_cents: priceCents,
        min_qty: parseInt(minQty, 10) || 1,
      });
      toast.success(`Published "${product.title}" (id ${product.id})`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit}
        className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Publish draft as product</h3>
          <button type="button" onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="flex gap-3">
          <img src={draft.image_url} alt={draft.name} className="w-16 h-16 object-contain bg-gray-50 border border-gray-200 rounded" />
          <div>
            <div className="font-medium text-gray-900">{draft.name}</div>
            <div className="text-xs text-gray-500 mt-0.5">{draft.submitted_by_email}</div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Blank shirt *</label>
          {picked ? (
            <div className="flex items-center gap-3 border border-emerald-300 bg-emerald-50 rounded-md p-2">
              {picked.image_url ? (
                <img src={picked.image_url} alt="" className="w-14 h-14 object-contain bg-white border border-gray-200 rounded" />
              ) : (
                <div className="w-14 h-14 flex items-center justify-center bg-white border border-gray-200 rounded text-gray-300 text-xs">No image</div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate">{picked.name}</div>
                <div className="text-xs text-gray-500">{picked.brand} · {picked.ss_id} · cost ${Number(picked.base_cost || 0).toFixed(2)}</div>
              </div>
              <button type="button" onClick={() => setPicked(null)} className="text-xs text-emerald-700 hover:underline">Change</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} autoFocus
                  placeholder="Search style name, brand, or SKU…"
                  className="w-full border border-gray-300 rounded-md pl-9 pr-3 py-2 text-sm" />
              </div>
              <div className="mt-2 border border-gray-200 rounded-md max-h-64 overflow-y-auto bg-white">
                {searching && (
                  <div className="p-4 text-center text-xs text-gray-500">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Searching…
                  </div>
                )}
                {!searching && results.length === 0 && (
                  <div className="p-4 text-center text-xs text-gray-500">No results.</div>
                )}
                {!searching && results.map((r) => (
                  <button type="button" key={r.ss_id} onClick={() => setPicked(r)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left border-b border-gray-100 last:border-b-0">
                    {r.image_url ? (
                      <img src={r.image_url} alt="" className="w-10 h-10 object-contain bg-white shrink-0" />
                    ) : (
                      <div className="w-10 h-10 shrink-0 flex items-center justify-center text-gray-300 text-[10px]">No image</div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.brand} · {r.ss_id} · ${Number(r.base_cost || 0).toFixed(2)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Retail price ($)</label>
            <input required type="number" step="0.01" min="0.01" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">Min qty</label>
            <input type="number" min="1" step="1" value={minQty} onChange={(e) => setMinQty(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
          <button type="submit" disabled={busy || !picked}
            className="px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-semibold disabled:opacity-50">
            {busy ? 'Publishing…' : 'Publish product'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Danger zone ──────────────────────────────────────────────────────────
// Two different operations, deliberately not the same button:
//
//   Retire  → status 'off'. Reversible, keeps every row. This is what you
//             want ~always; a store that ever sold anything can ONLY be
//             retired, because the ledger/orders/payouts/returns FKs are
//             ON DELETE RESTRICT.
//   Delete  → gone, along with its products, designs, admins, agreements
//             and design drafts (all CASCADE). The API refuses with 409 if
//             any financial history exists, so this is only ever reachable
//             for a store that never traded — a test store, basically.
//
// Delete requires typing the slug. No native confirm() dialog: those block
// the whole page and are trivially muscle-memoried through.
function DangerZone({ store, productCount, onRetire, onReactivate }: {
  store: { id: number; slug: string; name: string; status: string };
  productCount: number;
  onRetire: () => void;
  onReactivate: () => void;
}) {
  const navigate = useNavigate();
  const [confirmSlug, setConfirmSlug] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const armed = confirmSlug.trim() === store.slug;

  const doDelete = async () => {
    if (!armed) return;
    setDeleting(true);
    try {
      const res = await deleteGroupStore(store.id);
      toast.success(`Deleted "${res.name}"`);
      if (res.gleeworld_tenant_slug) {
        // The link lives in GleeWorld's database, which TSB can't write to.
        toast.warning(
          `GleeWorld tenant "${res.gleeworld_tenant_slug}" still points at this store — `
          + `clear its store link there, or its Fundraising page will 404.`,
          { duration: 12000 },
        );
      }
      navigate('/admin/group-stores');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setDeleting(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-500 hover:text-gray-900"
      >
        <AlertTriangle className="w-4 h-4" />
        <span className="font-medium">Danger zone</span>
        <span className="ml-auto text-xs">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 py-4 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {store.status === 'off' ? 'Reactivate store' : 'Retire store'}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
                {store.status === 'off'
                  ? 'Bring it back to active — it reappears in the directory and can take orders again.'
                  : 'Sets status to “off”: hidden from the store directory and closed to orders, but every product, design and order stays put. Reversible at any time.'}
              </p>
            </div>
            <button
              type="button"
              onClick={store.status === 'off' ? onReactivate : onRetire}
              className={`shrink-0 px-3 py-1.5 text-sm rounded-md border ${
                store.status === 'off'
                  ? 'border-green-300 text-green-700 hover:bg-green-50'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {store.status === 'off' ? 'Reactivate' : 'Retire'}
            </button>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="text-sm font-semibold text-red-700">Delete permanently</div>
            <p className="text-xs text-gray-500 mt-0.5 max-w-xl">
              Removes the store along with its {productCount} product{productCount === 1 ? '' : 's'},
              design drafts, store admins and agreements. Blocked if the store has any orders,
              ledger entries, payouts or returns — retire it instead. This cannot be undone.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <input
                value={confirmSlug}
                onChange={(e) => setConfirmSlug(e.target.value)}
                placeholder={`Type "${store.slug}" to confirm`}
                className="flex-1 max-w-xs border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={doDelete}
                disabled={!armed || deleting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-md text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting…' : 'Delete store'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
