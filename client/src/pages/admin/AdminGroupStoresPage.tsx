// TSB-internal list + create form for Group Stores. Route: /admin/group-stores.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Plus, ShoppingBag, Target, ArrowLeft } from 'lucide-react';
import {
  fetchGroupStores,
  createGroupStore,
  type GroupStoreSummary,
} from '@/lib/api';

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center gap-4">
          <Link to="/admin" className="text-sm text-gray-500 hover:text-gray-900 inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Admin
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Group Stores</h1>
            <p className="text-sm text-gray-500">White-label storefronts TSB runs for schools & organizations.</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-semibold">
            <Plus className="w-4 h-4" /> New store
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />
        ) : stores.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-16 text-center text-gray-500">
            No group stores yet. Click <strong>New store</strong> above to create your first one.
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Store</th>
                  <th className="px-4 py-3 text-left">Slug</th>
                  <th className="px-4 py-3 text-left">Fulfillment</th>
                  <th className="px-4 py-3 text-left">Products</th>
                  <th className="px-4 py-3 text-left">Orders</th>
                  <th className="px-4 py-3 text-left">Fundraiser</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {stores.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/group-stores/${s.id}`} className="font-semibold text-gray-900 hover:underline">
                        {s.name}
                      </Link>
                      <p className="text-xs text-gray-500">{s.owner_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/stores/${s.slug}`} target="_blank" rel="noreferrer"
                        className="font-mono text-xs text-blue-600 hover:underline block">
                        /stores/{s.slug}
                      </Link>
                      {s.subdomain && (
                        <a href={`https://${s.subdomain}.tshirtbrothers.com`} target="_blank" rel="noreferrer"
                          className="font-mono text-[10px] text-gray-500 hover:underline block mt-0.5">
                          {s.subdomain}.tshirtbrothers.com
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs uppercase tracking-wider">
                      {s.fulfillment_mode.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{s.active_product_count}</td>
                    <td className="px-4 py-3 text-gray-700">{s.order_count}</td>
                    <td className="px-4 py-3">
                      {s.is_fundraiser ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700">
                          <Target className="w-3 h-3" /> Active
                        </span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${
                        s.status === 'active' ? 'bg-green-100 text-green-700' :
                        s.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>{s.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {showCreate && <CreateStoreModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); void load(); }} />}
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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={submit} className="p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5" /> New group store
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Store name" required>
              <input required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Spelman Glee Store"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </Field>
            <Field label="URL slug" required hint="tshirtbrothers.com/stores/[slug]">
              <input required value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="spelman-glee"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono" />
            </Field>
            <Field label="Subdomain" hint={subdomain ? `${subdomain}.tshirtbrothers.com` : 'Optional — [sub].tshirtbrothers.com (short, no dashes preferred)'}>
              <input value={subdomain}
                onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="spelmanglee"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono" />
            </Field>
            <Field label="Contact email" required>
              <input type="email" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="director@yourorg.org"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </Field>
            <Field label="Primary color">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-full h-9 border border-gray-300 rounded-md" />
            </Field>
            <Field label="Logo URL" hint="Optional — displayed in the header">
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…/logo.png"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </Field>
            <Field label="Tagline">
              <input value={tagline} onChange={(e) => setTagline(e.target.value)}
                placeholder="Official Spelman Glee gear"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </Field>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Fulfillment</label>
            <div className="grid grid-cols-3 gap-2">
              {(['ship_only', 'pickup_only', 'both'] as const).map((v) => (
                <button type="button" key={v} onClick={() => setFulfillmentMode(v)}
                  className={`px-3 py-2 border rounded-md text-sm ${
                    fulfillmentMode === v ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300'
                  }`}>{v.replace('_', ' ')}</button>
              ))}
            </div>
          </div>

          {fulfillmentMode !== 'ship_only' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pickup location name">
                <input value={pickupName} onChange={(e) => setPickupName(e.target.value)}
                  placeholder="Choir office"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </Field>
              <Field label="Address">
                <input value={pickupAddr} onChange={(e) => setPickupAddr(e.target.value)}
                  placeholder="350 Spelman Ln SW"
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
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
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                </Field>
                <Field label="Goal (USD)">
                  <input type="number" step="1" value={goalDollars} onChange={(e) => setGoalDollars(e.target.value)}
                    placeholder="5000"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                </Field>
                <Field label="Contribution type">
                  <select value={contributionType} onChange={(e) => setContributionType(e.target.value as 'percent' | 'fixed')}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                    <option value="percent">% of retail</option>
                    <option value="fixed">Fixed $ per item</option>
                  </select>
                </Field>
                <Field label={contributionType === 'percent' ? 'Percent' : 'Dollars per item'}>
                  <input type="number" step="0.01" value={contributionValue}
                    onChange={(e) => setContributionValue(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                </Field>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Seed first group admin (optional)</label>
            <div className="grid grid-cols-2 gap-3">
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@yourorg.org"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              <input value={adminName} onChange={(e) => setAdminName(e.target.value)}
                placeholder="Name (optional)"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <p className="mt-2 text-xs text-gray-500">Seeded as owner. They'll sign in via magic-link at /stores/{slug || 'slug'}/admin.</p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={busy}
              className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-semibold disabled:opacity-50">
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
