import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, FileText, Palette, Package, Save, Lock, Loader2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';

interface Profile { id: number; email: string; name: string; phone: string; role: string; created_at: string; }
interface Quote { id: number; product_name: string; quantity: number; status: string; estimated_price: number | null; deposit_amount: number | null; created_at: string; date_needed: string | null; accepted_at: string | null; }
interface Design { id: number; name: string; product_name: string; thumbnail: string | null; mockup_url: string | null; created_at: string; }

function getToken() { return localStorage.getItem('tsb_token') || ''; }
async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api/auth${path}`, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}`, ...opts?.headers } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || 'Failed'); }
  return res.json();
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700', quoted: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700', completed: 'bg-gray-100 text-gray-700',
  rejected: 'bg-red-100 text-red-700',
};

type Tab = 'profile' | 'quotes' | 'designs' | 'orders';

export default function AccountPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) { navigate('/auth'); return; }
    setLoading(true);
    Promise.all([
      api<Profile>('/me'),
      api<Quote[]>('/me/quotes'),
      api<Design[]>('/me/designs'),
    ]).then(([p, q, d]) => {
      setProfile(p);
      setName(p.name || '');
      setPhone(p.phone || '');
      setQuotes(q);
      setDesigns(d);
    }).catch(() => {
      localStorage.removeItem('tsb_token');
      navigate('/auth');
    }).finally(() => setLoading(false));
  }, [navigate]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setSaveMsg('');
    try {
      const updated = await api<Profile>('/me', { method: 'PUT', body: JSON.stringify({ name, phone }) });
      setProfile(updated);
      setSaveMsg('Saved!');
      setTimeout(() => setSaveMsg(''), 2000);
    } catch (err) { setSaveMsg((err as Error).message); }
    finally { setSaving(false); }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwMsg('');
    try {
      await api('/me/password', { method: 'PUT', body: JSON.stringify({ current_password: currentPw, new_password: newPw }) });
      setPwMsg('Password changed!');
      setCurrentPw(''); setNewPw('');
    } catch (err) { setPwMsg((err as Error).message); }
  }

  const orders = quotes.filter(q => q.status === 'accepted' || q.status === 'completed');
  const activeQuotes = quotes.filter(q => q.status !== 'accepted' && q.status !== 'completed');

  if (loading) return <Layout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div></Layout>;

  const tabs: { key: Tab; label: string; icon: typeof User; count?: number }[] = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'quotes', label: 'Quotes', icon: FileText, count: activeQuotes.length },
    { key: 'orders', label: 'Orders', icon: Package, count: orders.length },
    { key: 'designs', label: 'Designs', icon: Palette, count: designs.length },
  ];

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-display font-bold text-gray-900 mb-1">My Account</h1>
        <p className="text-sm text-gray-500 mb-6">{profile?.email}</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition ${
                tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="bg-orange-100 text-orange-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Profile */}
        {tab === 'profile' && (
          <div className="space-y-6">
            <form onSubmit={handleSaveProfile} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900">Personal Info</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
                  <input type="email" value={profile?.email || ''} disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500" style={{ fontSize: '16px' }} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Phone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Member Since</label>
                  <input type="text" value={profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : ''} disabled
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50 text-gray-500" style={{ fontSize: '16px' }} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" disabled={saving}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition disabled:opacity-50 flex items-center gap-2">
                  <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
                </button>
                {saveMsg && <span className="text-sm text-green-600 font-medium">{saveMsg}</span>}
              </div>
            </form>

            <form onSubmit={handleChangePassword} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Lock className="w-4 h-4" /> Change Password</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Current Password</label>
                  <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }} />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">New Password</label>
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={6}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition">
                  Update Password
                </button>
                {pwMsg && <span className={`text-sm font-medium ${pwMsg.includes('changed') ? 'text-green-600' : 'text-red-600'}`}>{pwMsg}</span>}
              </div>
            </form>
          </div>
        )}

        {/* Quotes */}
        {tab === 'quotes' && (
          <div className="space-y-3">
            {activeQuotes.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No quotes yet</p>
                <Link to="/quote" className="text-orange-500 font-semibold text-sm hover:underline mt-2 inline-block">Get a Free Quote →</Link>
              </div>
            ) : activeQuotes.map(q => (
              <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900">{q.product_name || 'Quote Request'}</p>
                    <p className="text-xs text-gray-500">Qty: {q.quantity} · Submitted {new Date(q.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full capitalize ${STATUS_COLORS[q.status] || 'bg-gray-100 text-gray-600'}`}>{q.status}</span>
                </div>
                {q.estimated_price != null && (
                  <p className="mt-2 text-sm font-semibold text-gray-900">Quoted: ${Number(q.estimated_price).toFixed(2)}</p>
                )}
                {q.date_needed && <p className="text-xs text-orange-600 mt-1">Needed by {new Date(q.date_needed).toLocaleDateString()}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Orders */}
        {tab === 'orders' && (
          <div className="space-y-3">
            {orders.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <Package className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No orders yet</p>
              </div>
            ) : orders.map(q => {
              const total = q.estimated_price ? Number(q.estimated_price) : 0;
              const paid = q.deposit_amount ? Number(q.deposit_amount) : 0;
              const balance = total - paid;
              return (
                <div key={q.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-gray-900">Order #{q.id} — {q.product_name}</p>
                      <p className="text-xs text-gray-500">Qty: {q.quantity} · {q.accepted_at ? `Accepted ${new Date(q.accepted_at).toLocaleDateString()}` : ''}</p>
                    </div>
                    <span className={`text-xs font-bold px-2 py-1 rounded-full capitalize ${STATUS_COLORS[q.status] || ''}`}>{q.status}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-gray-400">Total</p>
                      <p className="font-bold text-gray-900">${total.toFixed(2)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <p className="text-gray-400">Paid</p>
                      <p className="font-bold text-green-600">${paid.toFixed(2)}</p>
                    </div>
                    <div className={`rounded-lg p-2 text-center ${balance > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <p className="text-gray-400">Balance</p>
                      <p className={`font-bold ${balance > 0 ? 'text-red-600' : 'text-gray-500'}`}>${balance.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Designs */}
        {tab === 'designs' && (
          <div>
            {designs.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <Palette className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No saved designs</p>
                <Link to="/design" className="text-orange-500 font-semibold text-sm hover:underline mt-2 inline-block">Start Designing →</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {designs.map(d => (
                  <div key={d.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition">
                    <div className="aspect-square bg-gray-50 flex items-center justify-center">
                      {(d.thumbnail || d.mockup_url) ? (
                        <img src={d.thumbnail || d.mockup_url || ''} alt={d.name} className="w-full h-full object-contain" />
                      ) : (
                        <Palette className="w-10 h-10 text-gray-300" />
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-sm font-semibold text-gray-900 truncate">{d.name}</p>
                      <p className="text-xs text-gray-500">{d.product_name || 'Custom Design'}</p>
                      <p className="text-[10px] text-gray-400 mt-1">{new Date(d.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
