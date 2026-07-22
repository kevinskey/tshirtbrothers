// Read-only dashboard for the group's own admins. Two views:
//   1) magic-link login (unauthed)
//   2) dashboard: orders + fundraiser total + bulk-order composer
//
// Session token is stored in localStorage under `tsb_gsa_${slug}`.
// Group admins cannot edit products, prices, or designs — that's TSB.
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Seo from '@/components/Seo';
import { Loader2, LogOut, ShoppingBag, Target, Package, Users, Plus, Trash2 } from 'lucide-react';

const STORAGE_KEY = (slug: string) => `tsb_gsa_${slug}`;

interface Me {
  id: number;
  store_id: number;
  store_slug: string;
  email: string;
  name: string | null;
  role: 'viewer' | 'bulk_buyer' | 'owner';
}

interface Order {
  id: number;
  tsb_order_ref: string;
  buyer_email: string;
  subtotal_cents: number;
  shipping_cents: number;
  gross_total_cents: number;
  status: string;
  fulfillment_type: 'ship' | 'pickup';
  is_bulk: boolean;
  created_at: string;
}

interface FundraiserSummary {
  is_fundraiser: boolean;
  fundraiser: { goal_cents?: number; headline?: string; ends_at?: string };
  gross_raised_cents: number;
  net_owed_cents: number;
  paid_out_cents: number;
  sale_count: number;
}

interface Product {
  id: number;
  title: string;
  slug: string;
  retail_price_cents: number;
  variants_json: { sizes?: string[]; colors?: string[] };
}

function usd(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

export default function GroupStoreAdminPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY(slug)));
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);

  // If we have a stored token, validate it by calling /me
  useEffect(() => {
    let cancelled = false;
    if (!token) { setChecking(false); return; }
    (async () => {
      try {
        const res = await fetch(`/api/group-store-admin/${encodeURIComponent(slug)}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          localStorage.removeItem(STORAGE_KEY(slug));
          if (!cancelled) { setToken(null); setMe(null); }
        } else {
          const data = await res.json();
          if (!cancelled) setMe(data.admin);
        }
      } catch {
        if (!cancelled) { setToken(null); setMe(null); }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug, token]);

  const handleLogin = (t: string, m: Me) => {
    localStorage.setItem(STORAGE_KEY(slug), t);
    setToken(t);
    setMe(m);
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch(`/api/group-store-admin/${encodeURIComponent(slug)}/logout`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* ignore */ }
    }
    localStorage.removeItem(STORAGE_KEY(slug));
    setToken(null); setMe(null);
  };

  if (checking) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>;
  }

  if (!token || !me) {
    return <LoginView slug={slug} onLoggedIn={handleLogin} />;
  }

  return <Dashboard slug={slug} token={token} me={me} onLogout={handleLogout} />;
}

// ── Login view ───────────────────────────────────────────────────────────
function LoginView({ slug, onLoggedIn }: { slug: string; onLoggedIn: (token: string, me: Me) => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/group-store-admin/login/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStage('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/group-store-admin/login/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // /me shape differs; construct Me from the login response
      const meRes = await fetch(`/api/group-store-admin/${encodeURIComponent(slug)}/me`, {
        headers: { Authorization: `Bearer ${data.token}` },
      });
      const meData = await meRes.json();
      onLoggedIn(data.token, meData.admin);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Seo title={`Admin sign in · ${slug}`} description="" path={`/stores/${slug}/admin`} />
      <div className="w-full max-w-md bg-white rounded-lg border border-gray-200 p-6">
        <Link to={`/stores/${slug}`} className="text-xs text-gray-500 hover:text-gray-900">← Back to store</Link>
        <h1 className="mt-3 text-xl font-bold text-gray-900">Store admin sign in</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter the email address your organization gave TShirt Brothers. We'll send you a 6-digit code.
        </p>

        {stage === 'email' && (
          <form onSubmit={requestCode} className="mt-6 space-y-4">
            <input
              type="email" required autoFocus value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourorg.org"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
            <button type="submit" disabled={busy || !email}
              className="w-full py-2 bg-gray-900 text-white rounded-md text-sm font-semibold disabled:opacity-50">
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        )}

        {stage === 'code' && (
          <form onSubmit={verifyCode} className="mt-6 space-y-4">
            <p className="text-sm text-gray-600">Sent to <strong>{email}</strong>. Check your inbox.</p>
            <input
              type="text" inputMode="numeric" pattern="\d*" maxLength={6} required autoFocus
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="6-digit code"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-lg tracking-widest text-center font-mono"
            />
            <button type="submit" disabled={busy || code.length !== 6}
              className="w-full py-2 bg-gray-900 text-white rounded-md text-sm font-semibold disabled:opacity-50">
              {busy ? 'Verifying…' : 'Sign in'}
            </button>
            <button type="button" onClick={() => setStage('email')}
              className="w-full text-sm text-gray-500 hover:text-gray-900">Use a different email</button>
          </form>
        )}

        {error && <div className="mt-4 text-sm text-red-600">{error}</div>}
      </div>
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────
function Dashboard({ slug, token, me, onLogout }: { slug: string; token: string; me: Me; onLogout: () => void }) {
  const [tab, setTab] = useState<'orders' | 'fundraiser' | 'bulk'>('orders');

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo title={`Admin · ${slug}`} description="" path={`/stores/${slug}/admin`} />
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <Link to={`/stores/${slug}`} className="text-xs text-gray-500 hover:text-gray-900">← Storefront</Link>
            <h1 className="text-lg font-bold text-gray-900 truncate">Admin · {slug}</h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">{me.email}</p>
            <p className="text-xs text-gray-400 capitalize">{me.role.replace('_', ' ')}</p>
          </div>
          <button onClick={onLogout} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-4 flex gap-1 border-t border-gray-100">
          <TabBtn active={tab === 'orders'}     onClick={() => setTab('orders')}     icon={<ShoppingBag className="w-4 h-4" />} label="Orders" />
          <TabBtn active={tab === 'fundraiser'} onClick={() => setTab('fundraiser')} icon={<Target      className="w-4 h-4" />} label="Fundraiser" />
          {(me.role === 'bulk_buyer' || me.role === 'owner') && (
            <TabBtn active={tab === 'bulk'}       onClick={() => setTab('bulk')}       icon={<Package     className="w-4 h-4" />} label="Bulk order" />
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {tab === 'orders'     && <OrdersTab     slug={slug} authHeaders={authHeaders} />}
        {tab === 'fundraiser' && <FundraiserTab slug={slug} authHeaders={authHeaders} />}
        {tab === 'bulk'       && <BulkOrderTab  slug={slug} authHeaders={authHeaders} />}
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-3 text-sm border-b-2 ${
        active ? 'border-gray-900 text-gray-900 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-900'
      }`}
    >{icon}{label}</button>
  );
}

// ── Orders tab ───────────────────────────────────────────────────────────
function OrdersTab({ slug, authHeaders }: { slug: string; authHeaders: Record<string, string> }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/group-store-admin/${encodeURIComponent(slug)}/orders`, { headers: authHeaders });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setOrders(data.orders || []);
      } catch (err) { console.error(err); setOrders([]); }
    })();
  }, [slug, authHeaders]);

  if (orders === null) return <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />;
  if (orders.length === 0) {
    return <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-500">No orders yet.</div>;
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
          <tr>
            <th className="px-4 py-3 text-left">Order</th>
            <th className="px-4 py-3 text-left">Buyer</th>
            <th className="px-4 py-3 text-left">Total</th>
            <th className="px-4 py-3 text-left">Delivery</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Placed</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="px-4 py-3 font-mono text-xs text-gray-700">
                {o.tsb_order_ref}
                {o.is_bulk && <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] uppercase tracking-wider">Bulk</span>}
              </td>
              <td className="px-4 py-3 text-gray-700">{o.buyer_email}</td>
              <td className="px-4 py-3 text-gray-900 font-semibold">{usd(o.gross_total_cents)}</td>
              <td className="px-4 py-3 text-gray-500 capitalize">{o.fulfillment_type}</td>
              <td className="px-4 py-3">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${statusColor(o.status)}`}>{o.status}</span>
              </td>
              <td className="px-4 py-3 text-gray-500">{new Date(o.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function statusColor(s: string) {
  if (s === 'paid')      return 'bg-gray-100 text-gray-700';
  if (s === 'printing')  return 'bg-yellow-100 text-yellow-700';
  if (s === 'shipped')   return 'bg-blue-100 text-blue-700';
  if (s === 'delivered') return 'bg-green-100 text-green-700';
  if (s === 'refunded' || s === 'cancelled') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-700';
}

// ── Fundraiser tab ───────────────────────────────────────────────────────
function FundraiserTab({ slug, authHeaders }: { slug: string; authHeaders: Record<string, string> }) {
  const [sum, setSum] = useState<FundraiserSummary | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/group-store-admin/${encodeURIComponent(slug)}/fundraiser/summary`, { headers: authHeaders });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSum(await res.json());
      } catch (err) { console.error(err); }
    })();
  }, [slug, authHeaders]);

  if (!sum) return <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" />;

  if (!sum.is_fundraiser) {
    return <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-500">
      This store isn't running a fundraiser. If you'd like to launch one, contact TShirt Brothers.
    </div>;
  }
  const goal = sum.fundraiser.goal_cents || 0;
  const pct = goal ? Math.min(100, Math.round((sum.net_owed_cents / goal) * 100)) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <p className="text-xs uppercase tracking-wider text-gray-500">Total raised</p>
        <p className="mt-2 text-2xl font-bold text-gray-900">{usd(sum.net_owed_cents)}</p>
        {goal ? <p className="mt-1 text-xs text-gray-500">of {usd(goal)} goal</p> : null}
        {goal ? (
          <div className="mt-3 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-gray-900" style={{ width: `${pct}%` }} />
          </div>
        ) : null}
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <p className="text-xs uppercase tracking-wider text-gray-500">Paid out</p>
        <p className="mt-2 text-2xl font-bold text-gray-900">{usd(sum.paid_out_cents)}</p>
        <p className="mt-1 text-xs text-gray-500">Payments already sent by TSB</p>
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-5">
        <p className="text-xs uppercase tracking-wider text-gray-500">Sales</p>
        <p className="mt-2 text-2xl font-bold text-gray-900">{sum.sale_count}</p>
        <p className="mt-1 text-xs text-gray-500">Individual orders</p>
      </div>
    </div>
  );
}

// ── Bulk order tab ───────────────────────────────────────────────────────
function BulkOrderTab({ slug, authHeaders }: { slug: string; authHeaders: Record<string, string> }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Array<{ store_product_id: number; qty: number; size?: string; color?: string }>>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: number; tsb_order_ref: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/store-shop/${encodeURIComponent(slug)}/products`);
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products || []);
      }
    })();
  }, [slug]);

  const productById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const subtotal = lines.reduce((acc, l) => acc + (productById[l.store_product_id]?.retail_price_cents || 0) * l.qty, 0);

  const addLine = () => {
    const first = products[0];
    if (!first) return;
    setLines([...lines, { store_product_id: first.id, qty: 12 }]);
  };
  const removeLine = (i: number) => setLines(lines.filter((_, ix) => ix !== i));
  const patchLine = (i: number, patch: Partial<typeof lines[number]>) => {
    setLines(lines.map((l, ix) => ix === i ? { ...l, ...patch } : l));
  };

  const submit = async () => {
    if (lines.length === 0) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/group-store-admin/${encodeURIComponent(slug)}/bulk-orders`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data);
      setLines([]); setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900">Bulk order</h2>
        <p className="mt-1 text-sm text-gray-500">Place a bulk order on behalf of the organization. TShirt Brothers will invoice separately at wholesale.</p>

        {result && (
          <div className="mt-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
            Bulk order <code className="font-mono">{result.tsb_order_ref}</code> created. TSB will follow up with an invoice.
          </div>
        )}
        {error && <div className="mt-4 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}

        <div className="mt-6 space-y-3">
          {lines.map((l, i) => {
            const p = productById[l.store_product_id];
            return (
              <div key={i} className="border border-gray-200 rounded-md p-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                <select className="col-span-4 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                  value={l.store_product_id}
                  onChange={(e) => patchLine(i, { store_product_id: parseInt(e.target.value, 10) })}
                >
                  {products.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                {p?.variants_json.sizes?.length ? (
                  <select className="col-span-2 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                    value={l.size || ''}
                    onChange={(e) => patchLine(i, { size: e.target.value })}
                  >
                    <option value="">Size</option>
                    {p.variants_json.sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : <span className="col-span-2" />}
                {p?.variants_json.colors?.length ? (
                  <select className="col-span-2 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                    value={l.color || ''}
                    onChange={(e) => patchLine(i, { color: e.target.value })}
                  >
                    <option value="">Color</option>
                    {p.variants_json.colors.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                ) : <span className="col-span-2" />}
                <input type="number" min={1} className="col-span-2 border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                  value={l.qty}
                  onChange={(e) => patchLine(i, { qty: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                />
                <span className="col-span-1 text-sm text-gray-600 text-right">{p ? usd(p.retail_price_cents * l.qty) : ''}</span>
                <button className="col-span-1 text-gray-400 hover:text-red-600 justify-self-end" onClick={() => removeLine(i)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}

          <button onClick={addLine} disabled={products.length === 0}
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50">
            <Plus className="w-4 h-4" /> Add line
          </button>
        </div>

        <div className="mt-6">
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider mb-2">Note for TSB (optional)</label>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            placeholder="Deadline, purchase order number, delivery instructions…"
          />
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-500">Subtotal (retail): <strong className="text-gray-900">{usd(subtotal)}</strong></p>
          <button onClick={submit} disabled={busy || lines.length === 0}
            className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-semibold disabled:opacity-50">
            {busy ? 'Submitting…' : 'Submit bulk order'}
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
        <Users className="w-3.5 h-3.5" /> Only admins with bulk-order permission can submit here.
      </div>
    </div>
  );
}
