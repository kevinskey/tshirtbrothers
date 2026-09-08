// TSB-internal list + create form for Group Stores. Route: /admin/group-stores.
//
// Styled as a "press floor" — each store renders as a shop-front card with
// its own brand-colored awning, matching the main site's Fraunces/orange
// print-shop identity instead of a database table.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { AddressAutocompleteInput } from '@/components/AddressAutocomplete';
import { Loader2, Plus, ShoppingBag, Target, ArrowLeft, Package, ExternalLink, Globe } from 'lucide-react';
import {
  fetchGroupStores,
  createGroupStore,
  type GroupStoreSummary,
} from '@/lib/api';

const TSB_ORANGE = '#f97316';

function storeColor(s: GroupStoreSummary): string {
  const c = s.brand_json?.primary_color;
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : '#0a0a0a';
}
function storeLogo(s: GroupStoreSummary): string | null {
  const l = s.brand_json?.logo_url;
  return typeof l === 'string' && l ? l : null;
}
function tint(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
// Awning stripes in the store's brand color — the storefront metaphor.
function awning(hex: string) {
  return {
    background: `repeating-linear-gradient(115deg, ${hex} 0 22px, ${tint(hex, 0.55)} 22px 44px)`,
  };
}

export default function AdminGroupStoresPage() {
  const [stores, setStores] = useState<GroupStoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchGroupStores();
      setStores(data.stores);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const totals = stores.reduce(
    (t, s) => ({
      products: t.products + Number(s.active_product_count || 0),
      orders: t.orders + Number(s.order_count || 0),
    }),
    { products: 0, orders: 0 },
  );

  return (
    <div
      className="min-h-screen"
      style={{
        background: '#f7f4ee',
        backgroundImage: 'radial-gradient(rgba(10,10,10,0.05) 1px, transparent 1px)',
        backgroundSize: '22px 22px',
      }}
    >
      {/* ── Inked header band ─────────────────────────────────────────── */}
      <header className="relative overflow-hidden bg-brand-black text-white">
        <div className="tsb-grain" />
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-25 blur-3xl"
          style={{ background: TSB_ORANGE }}
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-10">
          <Link to="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-white/50 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Admin
          </Link>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="tsb-font-display text-5xl sm:text-6xl font-black tracking-tight leading-none">
                Group <span style={{ color: TSB_ORANGE }}>Stores</span>
              </h1>
              <p className="mt-3 text-white/70 max-w-md">
                White-label storefronts TSB runs for schools &amp; organizations —{' '}
                <span className="font-semibold text-white" style={{ fontFamily: "'Caveat', cursive", fontSize: '1.35em', color: TSB_ORANGE }}>
                  every group gets a shop of their own.
                </span>
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden sm:flex items-center gap-5 text-sm">
                <HeaderStat n={stores.length} label={stores.length === 1 ? 'store' : 'stores'} />
                <span className="w-px h-8 bg-white/15" />
                <HeaderStat n={totals.products} label="products" />
                <span className="w-px h-8 bg-white/15" />
                <HeaderStat n={totals.orders} label="orders" />
              </div>
              <button onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:shadow-xl"
                style={{ background: TSB_ORANGE }}>
                <Plus className="w-4 h-4" /> New store
              </button>
            </div>
          </div>
        </div>
        {/* awning edge on the band itself */}
        <div className="relative h-2.5" style={awning(TSB_ORANGE)} />
      </header>

      {/* ── Shop fronts ───────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
        ) : stores.length === 0 ? (
          <div className="relative overflow-hidden rounded-[2rem] bg-white border border-gray-200 p-16 text-center shadow-sm">
            <div className="absolute top-0 inset-x-0 h-2.5" style={awning('#d1d5db')} />
            <ShoppingBag className="w-10 h-10 mx-auto text-gray-300" />
            <p className="tsb-font-display text-2xl font-bold mt-4 text-gray-900">No storefronts on the block yet.</p>
            <p className="text-gray-500 mt-1">Hit <strong>New store</strong> to raise the first awning.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {stores.map((s, i) => {
              const color = storeColor(s);
              const logo = storeLogo(s);
              return (
                <div key={s.id}
                  className="group relative rounded-[1.75rem] bg-white border border-gray-200/80 shadow-sm overflow-hidden transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl"
                  style={{ transform: undefined, transitionDelay: `${Math.min(i, 6) * 20}ms` }}
                >
                  {/* Awning */}
                  <div className="relative h-16" style={awning(color)}>
                    <div className="tsb-grain" />
                    <span className={`absolute top-3 right-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider backdrop-blur-sm ${
                      s.status === 'active' ? 'bg-white/90 text-emerald-700' :
                      s.status === 'paused' ? 'bg-white/90 text-amber-700' : 'bg-white/90 text-gray-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        s.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                        s.status === 'paused' ? 'bg-amber-500' : 'bg-gray-400'
                      }`} />
                      {s.status}
                    </span>
                  </div>

                  {/* Sign / logo hanging off the awning */}
                  <div className="px-6">
                    <div className="-mt-8 w-16 h-16 rounded-2xl rotate-3 group-hover:rotate-0 transition-transform duration-300 bg-white shadow-lg border border-gray-100 flex items-center justify-center overflow-hidden">
                      {logo ? (
                        <img src={logo} alt="" className="w-11 h-11 object-contain" />
                      ) : (
                        <span className="tsb-font-display text-xl font-black" style={{ color }}>
                          {s.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                        </span>
                      )}
                    </div>

                    <Link to={`/admin/group-stores/${s.id}`} className="block mt-4">
                      <h2 className="tsb-font-display text-2xl font-bold leading-tight text-gray-900 group-hover:underline decoration-2 underline-offset-4"
                        style={{ textDecorationColor: color }}>
                        {s.name}
                      </h2>
                    </Link>
                    <p className="mt-1 text-xs text-gray-500 truncate">{s.owner_email}</p>

                    {/* Address pills */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link to={`/stores/${s.slug}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] tsb-font-mono transition-colors border"
                        style={{ background: tint(color, 0.08), borderColor: tint(color, 0.25), color: '#111' }}>
                        <ExternalLink className="w-3 h-3" style={{ color }} /> /stores/{s.slug}
                      </Link>
                      {s.subdomain && (
                        <a href={`https://${s.subdomain}.tshirtbrothers.com`} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] tsb-font-mono border border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-400 transition-colors">
                          <Globe className="w-3 h-3" style={{ color }} /> {s.subdomain}.tshirtbrothers.com
                        </a>
                      )}
                    </div>

                    {/* Ticket stats */}
                    <div className="mt-5 mb-6 grid grid-cols-3 gap-2">
                      <StatTile icon={<ShoppingBag className="w-3.5 h-3.5" />} n={Number(s.active_product_count || 0)} label="products" color={color} />
                      <StatTile icon={<Package className="w-3.5 h-3.5" />} n={Number(s.order_count || 0)} label="orders" color={color} />
                      <div className="rounded-xl px-3 py-2.5 text-center border border-dashed"
                        style={{ borderColor: s.is_fundraiser ? tint(color, 0.5) : '#e5e7eb', background: s.is_fundraiser ? tint(color, 0.06) : 'transparent' }}>
                        <Target className="w-3.5 h-3.5 mx-auto" style={{ color: s.is_fundraiser ? color : '#c4c8ce' }} />
                        <p className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${s.is_fundraiser ? 'text-gray-800' : 'text-gray-400'}`}>
                          {s.is_fundraiser ? 'fundraiser' : 'retail'}
                        </p>
                        <p className="text-[10px] text-gray-400 leading-none">
                          {s.fulfillment_mode.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showCreate && <CreateStoreModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />}
    </div>
  );
}

function HeaderStat({ n, label }: { n: number; label: string }) {
  return (
    <div className="text-center">
      <p className="tsb-font-display text-2xl font-black leading-none">{n}</p>
      <p className="text-[10px] uppercase tracking-widest text-white/50 mt-1">{label}</p>
    </div>
  );
}

function StatTile({ icon, n, label, color }: { icon: React.ReactNode; n: number; label: string; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5 text-center border border-gray-100 bg-gray-50/70">
      <span className="inline-block" style={{ color }}>{icon}</span>
      <p className="tsb-font-display text-lg font-black leading-none mt-1 text-gray-900">{n}</p>
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
    </div>
  );
}

// ── Create-store modal ───────────────────────────────────────────────────
function CreateStoreModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [slug, setSlug] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#111827');
  const [logoUrl, setLogoUrl] = useState('');
  const [tagline, setTagline] = useState('');
  const [fulfillmentMode, setFulfillmentMode] = useState<'ship_only' | 'pickup_only' | 'both'>('ship_only');
  const [pickupName, setPickupName] = useState('');
  const [pickupAddr, setPickupAddr] = useState('');
  const [isFundraiser, setIsFundraiser] = useState(false);
  const [fundraiserHeadline, setFundraiserHeadline] = useState('');
  const [goalDollars, setGoalDollars] = useState('');
  const [contributionType, setContributionType] = useState<'percent' | 'fixed'>('percent');
  const [contributionValue, setContributionValue] = useState('15');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const brand: Record<string, unknown> = { primary_color: primaryColor };
      if (logoUrl) brand.logo_url = logoUrl;
      if (tagline) brand.tagline = tagline;
      const fundraiser: Record<string, unknown> = {};
      if (isFundraiser) {
        if (fundraiserHeadline) fundraiser.headline = fundraiserHeadline;
        if (goalDollars) fundraiser.goal_cents = Math.round(parseFloat(goalDollars) * 100);
        fundraiser.contribution_type = contributionType;
        fundraiser.contribution_value =
          contributionType === 'percent' ? parseFloat(contributionValue) : Math.round(parseFloat(contributionValue) * 100);
      }
      await createGroupStore({
        slug, name, owner_email: ownerEmail,
        subdomain: subdomain || undefined,
        brand_json: brand,
        fulfillment_mode: fulfillmentMode,
        pickup_location_json: fulfillmentMode === 'ship_only' ? {} :
          { name: pickupName, address_line1: pickupAddr },
        is_fundraiser: isFundraiser,
        fundraiser_json: fundraiser,
        initial_admin: adminEmail ? { email: adminEmail, name: adminName || undefined, role: 'owner' } : undefined,
      });
      toast.success('Store created');
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[1.75rem] max-w-2xl w-full max-h-[90vh] overflow-y-auto overflow-x-hidden shadow-2xl">
        <div className="relative h-2.5" style={{ background: `repeating-linear-gradient(115deg, ${TSB_ORANGE} 0 22px, rgba(249,115,22,0.55) 22px 44px)` }} />
        <form onSubmit={submit} className="p-6 sm:p-8 space-y-4">
          <h2 className="tsb-font-display text-2xl font-black text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" style={{ color: TSB_ORANGE }} /> Raise a new storefront
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Store name" required>
              <input required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Spelman Glee Store"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
            </Field>
            <Field label="URL slug" required hint="tshirtbrothers.com/stores/[slug]">
              <input required value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="spelman-glee"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono" />
            </Field>
            <Field label="Subdomain" hint={subdomain ? `${subdomain}.tshirtbrothers.com` : 'Optional — [sub].tshirtbrothers.com (short, no dashes preferred)'}>
              <input value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="spelmanglee"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono" />
            </Field>
            <Field label="Contact email" required>
              <input type="email" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="director@yourorg.org"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
            </Field>
            <Field label="Primary color">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-full h-9 border border-gray-300 rounded-xl" />
            </Field>
            <Field label="Logo URL" hint="Optional — displayed in the header">
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…/logo.png"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
            </Field>
            <Field label="Tagline">
              <input value={tagline} onChange={(e) => setTagline(e.target.value)}
                placeholder="Official Spelman Glee gear"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
            </Field>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Fulfillment</label>
            <div className="grid grid-cols-3 gap-2">
              {(['ship_only', 'pickup_only', 'both'] as const).map((v) => (
                <button type="button" key={v} onClick={() => setFulfillmentMode(v)}
                  className={`px-3 py-2 border rounded-full text-sm font-semibold transition-colors ${
                    fulfillmentMode === v ? 'border-transparent text-white' : 'border-gray-300 text-gray-600 hover:border-gray-500'
                  }`}
                  style={fulfillmentMode === v ? { background: TSB_ORANGE } : undefined}
                >{v.replace('_', ' ')}</button>
              ))}
            </div>
          </div>

          {fulfillmentMode !== 'ship_only' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pickup location name">
                <input value={pickupName} onChange={(e) => setPickupName(e.target.value)}
                  placeholder="Choir office"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
              </Field>
              <Field label="Address">
                <AddressAutocompleteInput
                  mode="full"
                  value={pickupAddr}
                  onChange={setPickupAddr}
                  placeholder="350 Spelman Ln SW"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
              </Field>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={isFundraiser} onChange={(e) => setIsFundraiser(e.target.checked)} />
              This store is a fundraiser
            </label>
            {isFundraiser && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Headline">
                  <input value={fundraiserHeadline} onChange={(e) => setFundraiserHeadline(e.target.value)}
                    placeholder="Help us fund the Rome tour"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
                </Field>
                <Field label="Goal (USD)">
                  <input type="number" step="1" value={goalDollars} onChange={(e) => setGoalDollars(e.target.value)}
                    placeholder="5000"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
                </Field>
                <Field label="Contribution type">
                  <select value={contributionType} onChange={(e) => setContributionType(e.target.value as 'percent' | 'fixed')}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm">
                    <option value="percent">% of retail</option>
                    <option value="fixed">Fixed $ per item</option>
                  </select>
                </Field>
                <Field label={contributionType === 'percent' ? 'Percent' : 'Dollars per item'}>
                  <input type="number" step="0.01" value={contributionValue}
                    onChange={(e) => setContributionValue(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
                </Field>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Seed first group admin (optional)</label>
            <div className="grid grid-cols-2 gap-3">
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@yourorg.org"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
              <input value={adminName} onChange={(e) => setAdminName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" />
            </div>
            <p className="mt-2 text-xs text-gray-500">Seeded as owner. They'll sign in via magic-link at /stores/{slug || 'slug'}/admin.</p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={busy}
              className="px-6 py-2.5 text-white rounded-full text-sm font-bold disabled:opacity-50 shadow-md transition-transform hover:-translate-y-0.5"
              style={{ background: TSB_ORANGE }}>
              {busy ? 'Creating…' : 'Create store'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-1">
        {label} {required && <span className="text-red-500 normal-case">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
