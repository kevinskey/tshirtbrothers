import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';
import { Loader2, LogOut, Package, User } from 'lucide-react';
import type { ApcOrder } from '../lib/api';
import { fetchMyOrders, money } from '../lib/api';

// Accounts are shared infrastructure with T-Shirt Brothers (same users
// table + JWT). Sign-in works right here; registration links to the TSB
// signup flow, which carries the bot defenses (signup token + proof).

const TOKEN_KEY = 'tsb_token';

export default function AccountPage() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [me, setMe] = useState<{ name: string | null; email: string } | null>(null);
  const [orders, setOrders] = useState<ApcOrder[] | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) { setMe(null); setOrders(null); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('expired'))))
      .then((data) => setMe(data.user ?? data))
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); });
    fetchMyOrders()
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

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    toast.success('Signed out');
  };

  const input =
    'w-full rounded-lg border border-apc-paper-deep px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-apc-blue';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <Helmet><title>My Account — All Print Club</title></Helmet>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-apc-ink mb-6">My Account</h1>

      {!token ? (
        <div className="max-w-md">
          <form onSubmit={login} className="space-y-4">
            <div>
              <label htmlFor="ac-email" className="block text-sm font-semibold text-apc-ink mb-1">Email</label>
              <input id="ac-email" type="email" required autoComplete="email" className={input}
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ac-pass" className="block text-sm font-semibold text-apc-ink mb-1">Password</label>
              <input id="ac-pass" type="password" required autoComplete="current-password" className={input}
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-apc-blue hover:bg-apc-blue-dark text-white font-bold px-6 py-3.5 disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Sign In
            </button>
          </form>
          <p className="mt-4 text-sm text-apc-slate">
            New here? All Print Club shares accounts with our sister company —{' '}
            <a href="https://tshirtbrothers.com/auth" target="_blank" rel="noopener noreferrer"
              className="font-semibold text-apc-blue hover:text-apc-blue-dark">
              create an account at T-Shirt Brothers
            </a>{' '}
            and sign in here with the same email.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-xl border border-apc-paper-deep p-4">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 rounded-full bg-apc-paper flex items-center justify-center">
                <User className="h-5 w-5 text-apc-blue" aria-hidden />
              </span>
              <div>
                <p className="font-bold text-apc-ink">{me?.name || 'Welcome back'}</p>
                <p className="text-sm text-apc-slate">{me?.email}</p>
              </div>
            </div>
            <button type="button" onClick={logout}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-apc-slate hover:text-apc-ink">
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </button>
          </div>

          <h2 className="mt-8 mb-3 text-lg font-extrabold text-apc-ink">Print Orders</h2>
          {orders === null ? (
            <Loader2 className="h-6 w-6 animate-spin text-apc-blue" aria-label="Loading orders" />
          ) : orders.length === 0 ? (
            <p className="text-sm text-apc-slate">
              No All Print Club orders yet. Orders placed with this email will show up here after checkout.
            </p>
          ) : (
            <ul className="space-y-3">
              {orders.map((o) => (
                <li key={o.id} className="rounded-xl border border-apc-paper-deep p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 font-bold text-apc-ink">
                      <Package className="h-4 w-4 text-apc-blue" aria-hidden /> Order #{o.id}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wide rounded-full bg-apc-paper px-3 py-1 text-apc-charcoal">
                      {o.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-apc-slate">
                    {new Date(o.created_at).toLocaleDateString()} · {money(o.total_cents)}
                  </p>
                  <ul className="mt-2 text-sm text-apc-charcoal space-y-1">
                    {o.items.map((it, i) => (
                      <li key={i}>
                        {it.qty}× {it.product_name}
                        {' — '}
                        {Object.entries(it.options || {}).map(([g, v]) => `${g}: ${v}`).join(' · ')}
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
