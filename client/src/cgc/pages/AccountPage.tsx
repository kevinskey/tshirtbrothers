import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';
import { KeyRound, Loader2, LogOut, Package, User } from 'lucide-react';
import { money } from '../lib/api';

// Accounts are shared infrastructure with T-Shirt Brothers (same users
// table + JWT). Sign-in works right here; registration links to the TSB
// signup flow, which carries the bot defenses (signup token + proof).

interface CgcOrderItem {
  sku: string; name: string | null; qty: number;
  unit_price_cents: number; personalization_cents: number;
  personalization: { lines?: string[] } | null;
}
interface CgcOrder {
  id: number; status: string; total_cents: number; created_at: string;
  items: CgcOrderItem[];
}

const TOKEN_KEY = 'tsb_token';

export default function AccountPage() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [me, setMe] = useState<{ name: string | null; email: string; phone?: string | null } | null>(null);
  const [orders, setOrders] = useState<CgcOrder[] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [curPassword, setCurPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!token) { setMe(null); setOrders(null); return; }
    const headers = { Authorization: `Bearer ${token}` };
    fetch('/api/auth/me', { headers })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('expired'))))
      .then((data) => {
        const u = data.user ?? data;
        setMe(u);
        setProfileName(u.name || '');
        setProfilePhone(u.phone || '');
      })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); });
    fetch('/api/cgc/my-orders', { headers })
      .then((r) => (r.ok ? r.json() : { orders: [] }))
      .then((data) => setOrders(data.orders ?? []))
      .catch(() => setOrders([]));
  }, [token]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Sign in failed');
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      toast.success('Signed in');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: profileName.trim(), phone: profilePhone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not save');
      setMe((m) => (m ? { ...m, name: data.name, phone: data.phone } : m));
      toast.success('Account info saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    try {
      const res = await fetch('/api/auth/me/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_password: curPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not change password');
      setCurPassword('');
      setNewPassword('');
      toast.success('Password changed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setSavingPassword(false);
    }
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    toast.success('Signed out');
  };

  const input =
    'w-full rounded-lg border border-cgc-cream-deep px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-cgc-orange';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <Helmet><title>My Account — Custom Gift Club</title></Helmet>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-cgc-ink mb-6">My Account</h1>

      {!token ? (
        <div className="max-w-md">
          <form onSubmit={login} className="space-y-4">
            <div>
              <label htmlFor="ac-email" className="block text-sm font-semibold text-cgc-ink mb-1">Email</label>
              <input id="ac-email" type="email" required autoComplete="email" className={input}
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ac-pass" className="block text-sm font-semibold text-cgc-ink mb-1">Password</label>
              <input id="ac-pass" type="password" required autoComplete="current-password" className={input}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3.5 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Sign In
            </button>
          </form>
          <p className="mt-4 text-sm text-cgc-stone">
            New here? Custom Gift Club shares accounts with our sister company —{' '}
            <a href="https://tshirtbrothers.com/auth" target="_blank" rel="noopener noreferrer"
              className="font-semibold text-cgc-orange hover:text-cgc-orange-dark">
              create an account at T-Shirt Brothers
            </a>{' '}
            and sign in here with the same email.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-xl border border-cgc-cream-deep p-4">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-cgc-cream flex items-center justify-center">
                <User className="h-5 w-5 text-cgc-orange" aria-hidden />
              </span>
              <div>
                <p className="font-bold text-cgc-ink">{me?.name || 'Welcome back'}</p>
                <p className="text-sm text-cgc-stone">{me?.email}</p>
              </div>
            </div>
            <button type="button" onClick={logout}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-cgc-stone hover:text-cgc-ink">
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </button>
          </div>

          <h2 className="mt-8 mb-3 text-lg font-extrabold text-cgc-ink">Account Details</h2>
          <form onSubmit={saveProfile} className="rounded-xl border border-cgc-cream-deep p-4 sm:p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="ac-info-email" className="block text-sm font-semibold text-cgc-ink mb-1">Email</label>
                <input id="ac-info-email" type="email" disabled value={me?.email || ''}
                  className={`${input} bg-cgc-cream/40 text-cgc-stone cursor-not-allowed`} />
                <p className="mt-1 text-xs text-cgc-stone">Your email is your sign-in and can’t be changed here.</p>
              </div>
              <div>
                <label htmlFor="ac-info-name" className="block text-sm font-semibold text-cgc-ink mb-1">Name</label>
                <input id="ac-info-name" type="text" autoComplete="name" className={input}
                  value={profileName} onChange={(e) => setProfileName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ac-info-phone" className="block text-sm font-semibold text-cgc-ink mb-1">Phone</label>
                <input id="ac-info-phone" type="tel" autoComplete="tel" className={input}
                  value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} />
              </div>
            </div>
            <button type="submit" disabled={savingProfile}
              className="inline-flex items-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-2.5 disabled:opacity-60">
              {savingProfile && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save Changes
            </button>
          </form>

          <h2 className="mt-8 mb-3 text-lg font-extrabold text-cgc-ink">Change Password</h2>
          <form onSubmit={changePassword} className="rounded-xl border border-cgc-cream-deep p-4 sm:p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="ac-pw-cur" className="block text-sm font-semibold text-cgc-ink mb-1">Current password</label>
                <input id="ac-pw-cur" type="password" required autoComplete="current-password" className={input}
                  value={curPassword} onChange={(e) => setCurPassword(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ac-pw-new" className="block text-sm font-semibold text-cgc-ink mb-1">New password</label>
                <input id="ac-pw-new" type="password" required minLength={6} autoComplete="new-password" className={input}
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
            </div>
            <button type="submit" disabled={savingPassword}
              className="inline-flex items-center gap-2 rounded-lg border border-cgc-cream-deep hover:bg-cgc-cream text-cgc-ink font-bold px-6 py-2.5 disabled:opacity-60">
              {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
              Update Password
            </button>
          </form>

          <h2 className="mt-8 mb-3 text-lg font-extrabold text-cgc-ink">Gift Club Orders</h2>
          {orders === null ? (
            <Loader2 className="h-6 w-6 animate-spin text-cgc-orange" aria-label="Loading orders" />
          ) : orders.length === 0 ? (
            <p className="text-sm text-cgc-stone">
              No Custom Gift Club orders yet. Orders placed with this email will show up here after checkout.
            </p>
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => (
                <li key={o.id} className="rounded-xl border border-cgc-cream-deep p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 font-bold text-cgc-ink">
                      <Package className="h-4 w-4 text-cgc-orange" aria-hidden /> Order #{o.id}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wide rounded-full bg-cgc-cream px-3 py-1 text-cgc-charcoal">
                      {o.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-cgc-stone">
                    {new Date(o.created_at).toLocaleDateString()} · {money(o.total_cents)}
                  </p>
                  <ul className="mt-2 text-sm text-cgc-charcoal space-y-1">
                    {o.items.map((it, i) => (
                      <li key={i}>
                        {it.qty}× {it.name || it.sku}
                        {it.personalization?.lines?.length ? ` — “${it.personalization.lines.join(' / ')}”` : ''}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
