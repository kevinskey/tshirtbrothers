// Every web-store order in one list, whatever its status. Route:
// /admin/store-orders.
//
// The dashboard's Open Orders and the Post Office queue only show an order
// while it is paid or printing and has no tracking number; the moment a
// label is bought, or EasyPost reports delivery, it leaves both. Before
// this page there was nowhere in the admin to see it again (Kevin,
// 2026-10-02 and 2026-10-16: "the store orders have disappeared").
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Search, ShoppingBag, Truck, ExternalLink } from 'lucide-react';
import { fetchAdminStoreOrders, type AdminStoreOrder } from '@/lib/api';

const TSB_ORANGE = '#f97316';
const usd = (cents: number | null | undefined) => (cents == null ? '—' : `$${(cents / 100).toFixed(2)}`);

type Tab = 'open' | 'shipped' | 'delivered' | 'closed' | 'all';
const TABS: { key: Tab; label: string; hint: string }[] = [
  { key: 'open', label: 'Open', hint: 'Paid or printing — still on the shop floor' },
  { key: 'shipped', label: 'Shipped', hint: 'Label bought, parcel on its way' },
  { key: 'delivered', label: 'Delivered', hint: 'EasyPost or the admin marked it delivered' },
  { key: 'closed', label: 'Refunded / cancelled', hint: 'Money went back or the order was voided' },
  { key: 'all', label: 'All', hint: 'Everything, newest first' },
];

const STATUS_STYLE: Record<AdminStoreOrder['status'], string> = {
  paid: 'bg-green-100 text-green-800',
  printing: 'bg-blue-100 text-blue-800',
  shipped: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-gray-200 text-gray-700',
  refunded: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-100 text-red-700',
};

function matchesTab(o: AdminStoreOrder, tab: Tab): boolean {
  switch (tab) {
    case 'open': return o.status === 'paid' || o.status === 'printing';
    case 'shipped': return o.status === 'shipped';
    case 'delivered': return o.status === 'delivered';
    case 'closed': return o.status === 'refunded' || o.status === 'cancelled';
    default: return true;
  }
}

export default function AdminStoreOrdersPage() {
  const [orders, setOrders] = useState<AdminStoreOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const data = await fetchAdminStoreOrders('all');
        if (alive) setOrders(data.orders);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { open: 0, shipped: 0, delivered: 0, closed: 0, all: orders.length };
    for (const o of orders) {
      if (matchesTab(o, 'open')) c.open += 1;
      else if (matchesTab(o, 'shipped')) c.shipped += 1;
      else if (matchesTab(o, 'delivered')) c.delivered += 1;
      else if (matchesTab(o, 'closed')) c.closed += 1;
    }
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => matchesTab(o, tab))
      .filter((o) => !q || [
        `#${o.id}`, String(o.id), o.store_name, o.buyer_name, o.buyer_email, o.buyer_phone,
        o.tracking_number, o.tsb_order_ref, ...(o.lines || []).map((l) => l.title),
      ].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [orders, tab, search]);

  const lineSummary = (o: AdminStoreOrder) => {
    const lines = o.lines || [];
    const head = lines[0];
    if (!head) return `${o.store_name} order`;
    const first = `${head.qty}× ${head.title}`;
    return lines.length > 1 ? `${first} +${lines.length - 1} more` : first;
  };
  const units = (o: AdminStoreOrder) => (o.lines || []).reduce((n, l) => n + (Number(l.qty) || 0), 0);

  return (
    <div className="min-h-screen" style={{ background: '#f7f4ee' }}>
      <header className="relative overflow-hidden bg-brand-black text-white">
        <div className="tsb-grain" />
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-25 blur-3xl" style={{ background: TSB_ORANGE }} />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-8">
          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold uppercase tracking-widest text-white/50">
            <Link to="/admin" className="inline-flex items-center gap-1.5 hover:text-white transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Admin
            </Link>
            <Link to="/admin/group-stores" className="hover:text-white transition-colors">Web Stores</Link>
            <Link to="/admin/post-office" className="hover:text-white transition-colors">Post Office</Link>
          </div>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="tsb-font-display text-5xl sm:text-6xl font-black tracking-tight leading-none">
                Store <span style={{ color: TSB_ORANGE }}>Orders</span>
              </h1>
              <p className="mt-3 text-white/70 max-w-lg">
                Every web-store sale, from paid to delivered. Open ones also sit on the dashboard and in the Post Office queue; shipped and delivered ones live only here.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-5 text-sm">
              {(['open', 'shipped', 'delivered'] as Tab[]).map((k, i) => (
                <span key={k} className="flex items-center gap-5">
                  {i > 0 && <span className="w-px h-8 bg-white/15" />}
                  <span className="text-center">
                    <span className="tsb-font-display block text-2xl font-black leading-none">{counts[k]}</span>
                    <span className="text-[11px] uppercase tracking-widest text-white/50">{k}</span>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search buyer, email, store, product, tracking #…"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>
          <div className="flex flex-wrap gap-1 bg-white rounded-xl border border-gray-200 p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                title={t.hint}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${tab === t.key ? 'bg-brand-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {t.label} <span className={`ml-1 text-xs ${tab === t.key ? 'text-white/60' : 'text-gray-400'}`}>{counts[t.key]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <ShoppingBag className="w-8 h-8 mx-auto mb-2 opacity-40" />
              {orders.length === 0 ? 'No store orders yet.' : 'Nothing matches this tab and search.'}
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500 text-xs">
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Order</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Date</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Store</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Buyer</th>
                      <th className="px-3 py-2 font-medium">Items</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Units</th>
                      <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Total</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Ship</th>
                      <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visible.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                          <Link to={`/admin/store-order/${o.id}`} className="font-medium text-gray-900 hover:text-red-600 hover:underline">#{o.id}</Link>
                          {o.tsb_order_ref && <div className="text-gray-400">{o.tsb_order_ref}</div>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-gray-700 whitespace-nowrap">
                          <Link to={`/admin/group-stores/${o.store_id}`} className="hover:underline">{o.store_name}</Link>
                        </td>
                        <td className="px-3 py-2 text-gray-900">
                          <div className="max-w-[180px] truncate" title={o.buyer_name || ''}>{o.buyer_name || '—'}</div>
                          <div className="max-w-[200px] truncate text-xs text-gray-500" title={o.buyer_email}>{o.buyer_email}</div>
                        </td>
                        <td className="px-3 py-2 text-gray-700"><div className="max-w-[260px] truncate" title={lineSummary(o)}>{lineSummary(o)}</div></td>
                        <td className="px-3 py-2 text-right text-gray-700">{units(o) || '—'}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">{usd(o.gross_total_cents)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                          {o.fulfillment_type === 'pickup' ? 'Pickup' : o.tracking_number ? (
                            <span className="inline-flex items-center gap-1" title={o.tracking_carrier || ''}>
                              <Truck className="w-3.5 h-3.5 text-gray-400" />{o.tracking_number}
                            </span>
                          ) : 'Needs label'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[o.status] || 'bg-gray-100 text-gray-700'}`}>{o.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Phone */}
              <div className="md:hidden divide-y divide-gray-100">
                {visible.map((o) => (
                  <Link key={o.id} to={`/admin/store-order/${o.id}`} className="block p-4 space-y-1.5 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-medium text-gray-900">#{o.id} <span className="font-sans text-gray-500 font-normal">· {o.store_name}</span></span>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[o.status] || 'bg-gray-100 text-gray-700'}`}>{o.status}</span>
                    </div>
                    <div className="text-sm text-gray-900">{o.buyer_name || o.buyer_email}</div>
                    <div className="text-xs text-gray-600">{lineSummary(o)}</div>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{new Date(o.created_at).toLocaleDateString()}{o.tracking_number ? ` · ${o.tracking_number}` : o.fulfillment_type === 'pickup' ? ' · Pickup' : ''}</span>
                      <span className="font-medium text-gray-900">{usd(o.gross_total_cents)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <ExternalLink className="w-3 h-3" /> Open an order to print its packing slip, buy a label, or change its status.
        </p>
      </main>
    </div>
  );
}
