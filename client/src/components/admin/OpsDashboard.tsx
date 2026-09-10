import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, CalendarDays, DollarSign, ShoppingBag, FileText, CreditCard, AlertTriangle,
  Settings as Gear, ArrowRight, Palette, Hourglass, CheckCircle2, Printer, Scissors, Package,
  BarChart3, Users, AlertCircle, Clock, Truck, ChevronRight, Zap, Plus, Loader2, Target,
  Mail as MailIcon,
} from 'lucide-react';

// Operations command-center dashboard — implements Kevin's approved
// reference design (2026-09-09) pixel-close. All numbers come from
// GET /api/admin/dashboard-ops; nothing here is fabricated — sections whose
// data source doesn't exist yet (inventory/purchasing) say so honestly.

type OpsData = {
  revenue: { today: number; yesterday: number; this_week: number; this_month: number; last_month: number };
  kpis: { orders_due_today: number; orders_due_week: number; new_quotes_today: number; new_quotes_yesterday: number; unpaid_balance: number; jobs_at_risk: number };
  pipeline: Record<string, number>;
  methods: Record<string, number>;
  schedule: Array<{ kind: 'quote' | 'gangsheet'; id: number; customer: string; email: string | null; job: string; qty: number; price: number | null; days_open: number | null; method: string; stage: string; due: string | null; overdue: boolean }>;
  blanks: Array<{ id: number; po_number: string; status: string; will_call: boolean; total: number | null; expected: string | null; for_customer: string | null; quote_id: number | null }>;
  overdue_invoices: Array<{ id: string; invoice_number: string; customer_name: string; customer_email: string; amount_due: number; due_date: string }>;
  attention: { proofs_waiting: number; quotes_unanswered_24h: number; orders_overdue: number; awaiting_payment: number; ready_for_pickup: number };
  sales: { conversion_pct: number | null; quotes_awaiting_response: number; approved_but_unpaid: number };
  customers: { new_this_month: number; repeat_customers: number; inactive_90: number; abandoned_quotes: number; not_reordered: number; follow_up_quotes: number; annual_window: number; inactive_180: number };
  inventory: { tracked: boolean };
};

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const money2 = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STAGES = [
  { key: 'quotes', label: 'Quotes', icon: FileText, bg: 'bg-gray-100', iconColor: 'text-gray-600', filter: 'pending' },
  { key: 'artwork', label: 'Artwork', icon: Palette, bg: 'bg-blue-50', iconColor: 'text-blue-500', filter: 'accepted' },
  { key: 'awaiting_approval', label: 'Awaiting Approval', icon: Hourglass, bg: 'bg-amber-50', iconColor: 'text-amber-500', filter: 'awaiting_approval' },
  { key: 'ready_to_produce', label: 'Ready to Produce', icon: CheckCircle2, bg: 'bg-green-50', iconColor: 'text-green-500', filter: 'approved' },
  { key: 'printing', label: 'Printing', icon: Printer, bg: 'bg-purple-50', iconColor: 'text-purple-500', filter: 'in_production' },
  { key: 'finishing', label: 'Finishing', icon: Scissors, bg: 'bg-violet-50', iconColor: 'text-violet-500', filter: 'in_production' },
  { key: 'pickup', label: 'Ready for Pickup', icon: Package, bg: 'bg-teal-50', iconColor: 'text-teal-500', filter: 'ready' },
] as const;

const METHOD_PILLS: Record<string, string> = {
  DTF: 'bg-red-50 text-red-600',
  Embroidery: 'bg-blue-50 text-blue-600',
  HTV: 'bg-green-50 text-green-600',
  'Screen Print': 'bg-purple-50 text-purple-600',
  Other: 'bg-gray-100 text-gray-600',
};

function dueLabel(due: string | null, overdue: boolean): { text: string; cls: string } {
  if (!due) return { text: '—', cls: 'text-gray-400' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (overdue) return { text: `Overdue ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`, cls: 'text-red-600 font-semibold' };
  if (diff === 0) return { text: 'Today', cls: 'text-gray-900 font-semibold' };
  if (diff === 1) return { text: 'Tomorrow', cls: 'text-gray-900 font-semibold' };
  return { text: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), cls: 'text-gray-700' };
}

function Delta({ now, prev, invert = false }: { now: number; prev: number; invert?: boolean }) {
  if (prev === 0 && now === 0) return null;
  const diff = now - prev;
  if (diff === 0) return <span className="text-[11px] text-gray-400">— vs. yesterday</span>;
  const up = diff > 0;
  const good = invert ? !up : up;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : null;
  return (
    <span className="flex items-center gap-1 text-[11px] text-gray-400">
      <span className={`rounded-full px-1.5 py-0.5 font-bold ${good ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
        {up ? '↑' : '↓'} {pct !== null && Math.abs(pct) <= 500 ? `${Math.abs(pct)}%` : Math.abs(diff)}
      </span>
      vs. yesterday
    </span>
  );
}

function KpiCard({ icon: Icon, iconCls, label, value, delta, urgent = false }: {
  icon: typeof DollarSign; iconCls: string; label: string; value: string; delta?: ReactNode; urgent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${urgent ? 'border-red-200 bg-red-50/60' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start gap-2.5">
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${iconCls}`}>
          <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold leading-tight text-gray-900 xl:text-2xl">{value}</p>
          {delta ? <div className="mt-0.5">{delta}</div> : null}
        </div>
      </div>
    </div>
  );
}

function CardHeader({ icon: Icon, iconCls, title, linkText, onLink }: {
  icon: typeof Gear; iconCls?: string; title: string; linkText: string; onLink: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={`h-4.5 w-4.5 ${iconCls || 'text-gray-800'}`} style={{ width: 18, height: 18 }} />
        <h3 className="text-[15px] font-bold text-gray-900">{title}</h3>
      </div>
      <button onClick={onLink} className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
        {linkText} <ArrowRight className="h-3 w-3" />
      </button>
    </div>
  );
}

function StatRow({ label, value, valueCls = 'text-gray-900' }: { label: string; value: string | number; valueCls?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm last:border-b-0">
      <span className="text-gray-600">{label}</span>
      <span className={`font-bold ${valueCls}`}>{value}</span>
    </div>
  );
}

export default function OpsDashboard({ onOpenQuotes, onOpenInvoices, onOpenCustomers, onNewInvoice, onNewCustomer, onNewJob }: {
  onOpenQuotes: (filter?: string) => void;
  onOpenQuoteId?: (id: number) => void;
  onOpenInvoices: () => void;
  onOpenCustomers: () => void;
  onNewInvoice: () => void;
  onNewCustomer: () => void;
  onNewJob: () => void;
  toast?: (msg: string, type?: 'error' | 'success') => void;
}) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery<OpsData>({
    queryKey: ['admin', 'dashboard-ops'],
    queryFn: async () => {
      const r = await fetch('/api/admin/dashboard-ops', {
        headers: { Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` },
      });
      if (!r.ok) throw new Error('Failed to load dashboard');
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-orange-500" /></div>;
  }
  if (isError || !data) {
    return <p className="py-16 text-center text-sm text-gray-500">Couldn't load the dashboard — refresh to try again.</p>;
  }

  const d = data;
  const attentionRows = [
    { icon: AlertCircle, n: d.attention.proofs_waiting, label: `customer proof${d.attention.proofs_waiting === 1 ? '' : 's'} waiting for approval`, go: () => onOpenQuotes('awaiting_approval') },
    { icon: Clock, n: d.attention.quotes_unanswered_24h, label: `quote${d.attention.quotes_unanswered_24h === 1 ? '' : 's'} unanswered >24 hours`, go: () => onOpenQuotes('pending') },
    { icon: AlertTriangle, n: d.attention.orders_overdue, label: `order${d.attention.orders_overdue === 1 ? '' : 's'} overdue`, go: () => onOpenQuotes('accepted') },
    { icon: CreditCard, n: d.attention.awaiting_payment, label: `invoice${d.attention.awaiting_payment === 1 ? '' : 's'} waiting for payment`, go: onOpenInvoices },
    { icon: Truck, n: d.attention.ready_for_pickup, label: `job${d.attention.ready_for_pickup === 1 ? '' : 's'} ready for pickup`, go: () => onOpenQuotes('ready') },
  ].filter((r) => r.n > 0);

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-2xl font-bold text-gray-900 md:text-3xl">Dashboard</h2>
          <p className="hidden text-sm text-gray-500 sm:block">Here's what's happening at T-Shirt Brothers today.</p>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Calendar className="h-4 w-4" /> {dateStr}
        </div>
      </div>

      {/* KPI cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 min-[900px]:grid-cols-6">
        <KpiCard icon={DollarSign} iconCls="bg-green-50 text-green-600" label="Revenue Today"
          value={money(d.revenue.today)} delta={<Delta now={d.revenue.today} prev={d.revenue.yesterday} />} />
        <KpiCard icon={ShoppingBag} iconCls="bg-blue-50 text-blue-600" label="Orders Due Today" value={String(d.kpis.orders_due_today)} />
        <KpiCard icon={CalendarDays} iconCls="bg-purple-50 text-purple-600" label="Orders Due This Week" value={String(d.kpis.orders_due_week)} />
        <KpiCard icon={FileText} iconCls="bg-orange-50 text-orange-600" label="New Quotes Today"
          value={String(d.kpis.new_quotes_today)} delta={<Delta now={d.kpis.new_quotes_today} prev={d.kpis.new_quotes_yesterday} />} />
        <KpiCard icon={CreditCard} iconCls="bg-gray-100 text-gray-600" label="Unpaid Balance" value={money(d.kpis.unpaid_balance)} />
        <KpiCard icon={AlertTriangle} iconCls="bg-red-100 text-red-600" label="Jobs At Risk" value={String(d.kpis.jobs_at_risk)} urgent />
      </div>

      {/* Production Pipeline */}
      <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <CardHeader icon={Gear} title="Production Pipeline" linkText="View Production Board" onLink={() => onOpenQuotes('accepted')} />
        <div className="flex gap-0.5 overflow-x-auto pb-1">
          {STAGES.map((s, i) => {
            const Icon = s.icon;
            return (
              <button
                key={s.key}
                onClick={() => onOpenQuotes(s.filter)}
                className={`flex min-w-0 flex-1 items-center gap-1.5 px-3 py-3 pl-5 text-left transition hover:brightness-95 ${s.bg}`}
                style={{
                  clipPath: i === 0
                    ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
                    : i === STAGES.length - 1
                      ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
                      : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)',
                }}
              >
                <Icon className={`h-4 w-4 flex-shrink-0 ${s.iconColor}`} />
                <span>
                  <span className="block text-[11px] font-medium leading-tight text-gray-700">{s.label}</span>
                  <span className="block text-lg font-bold leading-tight text-gray-900">{d.pipeline[s.key] ?? 0}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Production Methods:</span>
          {Object.entries(d.methods).map(([m, n]) => (
            <button key={m} onClick={() => onOpenQuotes('accepted')}
              className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${METHOD_PILLS[m] || METHOD_PILLS.Other}`}>
              {m} <span className="font-bold">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Schedule + Attention */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <CardHeader icon={CalendarDays} title="Open Orders" linkText="View All" onLink={() => onOpenQuotes('accepted')} />
          {d.schedule.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No open orders — this fills in as quotes are accepted.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 pr-3 font-medium">Job</th>
                    <th className="py-2 pr-3 text-right font-medium">Qty</th>
                    <th className="py-2 pr-3 text-right font-medium">Value</th>
                    <th className="py-2 pr-3 font-medium">Open</th>
                    <th className="py-2 pr-3 font-medium">Due</th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {d.schedule.map((row) => {
                    const due = dueLabel(row.due, row.overdue);
                    const late = row.overdue || (row.days_open !== null && row.days_open > 10 && !row.due);
                    return (
                      <tr key={`${row.kind}-${row.id}`}
                        onClick={() => (row.kind === 'quote' ? navigate(`/admin/order/${row.id}`) : navigate('/admin/dtf-orders'))}
                        className={`cursor-pointer hover:bg-gray-50 ${late ? 'bg-red-50/50' : ''}`}>
                        <td className="max-w-[140px] truncate py-2.5 pr-3 font-medium text-gray-900">{row.customer}</td>
                        <td className="max-w-[150px] truncate py-2.5 pr-3 text-gray-700">{row.job}</td>
                        <td className="py-2.5 pr-3 text-right text-gray-700">{row.qty || '—'}</td>
                        <td className="py-2.5 pr-3 text-right text-gray-700">{row.price ? money(row.price) : '—'}</td>
                        <td className={`whitespace-nowrap py-2.5 pr-3 ${row.days_open !== null && row.days_open > 10 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                          {row.days_open !== null ? `${row.days_open}d` : '—'}
                        </td>
                        <td className={`whitespace-nowrap py-2.5 pr-3 ${due.cls}`}>{due.text}</td>
                        <td className="py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          {row.email && (
                            <button
                              title={`Email ${row.customer}`}
                              onClick={() => { window.location.href = `/admin?section=mail&composeTo=${encodeURIComponent(row.email!)}&composeSubject=${encodeURIComponent(`Your T-Shirt Brothers order #${row.id}`)}`; }}
                              className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                            >
                              <MailIcon className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Blanks in motion */}
          <div className="mt-4 border-t border-gray-100 pt-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-gray-700" />
                <h4 className="text-sm font-bold text-gray-900">Blanks — incoming & pickups</h4>
              </div>
              <button onClick={() => { window.location.href = '/admin?section=purchasing'; }} className="text-xs font-semibold text-blue-600 hover:underline">
                Purchasing →
              </button>
            </div>
            {d.blanks.length === 0 ? (
              <p className="py-2 text-center text-xs text-gray-400">No blanks on order right now.</p>
            ) : (
              <ul className="divide-y divide-gray-50 text-sm">
                {d.blanks.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 py-1.5">
                    {b.will_call
                      ? <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">Will Call</span>
                      : <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 capitalize">{b.status.replace('_', ' ')}</span>}
                    <span className="flex-1 truncate text-gray-800">
                      <span className="font-mono text-xs">{b.po_number}</span>
                      {b.for_customer ? ` — ${b.for_customer}` : ' — restock'}
                    </span>
                    {b.total ? <span className="text-gray-600">{money(b.total)}</span> : null}
                    <span className="whitespace-nowrap text-xs text-gray-500">
                      {b.will_call ? 'pickup at McDonough' : b.expected ? `expected ${new Date(b.expected).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Overdue invoices */}
          {d.overdue_invoices.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <h4 className="text-sm font-bold text-gray-900">Overdue invoices</h4>
              </div>
              <ul className="divide-y divide-gray-50 text-sm">
                {d.overdue_invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-2 py-1.5">
                    <span className="flex-1 truncate text-gray-800">
                      <span className="font-medium">{inv.customer_name}</span> · {inv.invoice_number}
                    </span>
                    <span className="font-semibold text-red-600">{money2(inv.amount_due)}</span>
                    <span className="whitespace-nowrap text-xs text-red-500">
                      due {new Date(inv.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                    {inv.customer_email && (
                      <button
                        title={`Email ${inv.customer_name}`}
                        onClick={() => { window.location.href = `/admin?section=mail&composeTo=${encodeURIComponent(inv.customer_email)}&composeSubject=${encodeURIComponent(`Invoice ${inv.invoice_number} — balance due`)}`; }}
                        className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                      >
                        <MailIcon className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <CardHeader icon={AlertTriangle} iconCls="text-red-600" title="Needs Your Attention" linkText="View All" onLink={() => onOpenQuotes()} />
          {attentionRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Nothing needs attention right now. 🎉</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {attentionRows.map((r, i) => {
                const Icon = r.icon;
                return (
                  <li key={i}>
                    <button onClick={r.go} className="flex w-full items-center gap-2.5 py-2.5 text-left hover:bg-gray-50">
                      <Icon className="h-4 w-4 flex-shrink-0 text-red-500" />
                      <span className="flex-1 text-sm text-gray-800"><span className="font-bold">{r.n}</span> {r.label}</span>
                      <span className="text-sm font-bold text-red-600">{r.n}</span>
                      <ChevronRight className="h-4 w-4 text-gray-300" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Sales / Customers / Inventory */}
      <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <CardHeader icon={BarChart3} title="Sales Snapshot" linkText="View Reports" onLink={onOpenInvoices} />
          <StatRow label="Today" value={money2(d.revenue.today)} />
          <StatRow label="This Week" value={money2(d.revenue.this_week)} />
          <StatRow label="This Month" value={money2(d.revenue.this_month)} />
          <StatRow label="Last Month" value={money2(d.revenue.last_month)} />
          <div className="my-2 border-t border-gray-200" />
          <StatRow label="Quote Conversion" value={d.sales.conversion_pct === null ? '—' : `${d.sales.conversion_pct}%`} />
          <StatRow label="Quotes Awaiting Response" value={money2(d.sales.quotes_awaiting_response)} />
          <StatRow label="Approved but Unpaid" value={money2(d.sales.approved_but_unpaid)} />
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <CardHeader icon={Users} title="Customer Opportunities" linkText="View Customers" onLink={onOpenCustomers} />
          <StatRow label="New Customers This Month" value={d.customers.new_this_month} />
          <StatRow label="Repeat Customers" value={d.customers.repeat_customers} />
          <StatRow label="Inactive 90+ Days" value={d.customers.inactive_90} valueCls="text-red-600" />
          <StatRow label="Abandoned Quotes" value={d.customers.abandoned_quotes} valueCls="text-red-600" />
          <StatRow label="Customers Who Haven't Reordered" value={d.customers.not_reordered} valueCls="text-red-600" />
          <div className="mt-2 flex items-center gap-1.5">
            <Target className="h-4 w-4 text-red-500" />
            <p className="text-sm font-bold text-gray-900">Follow-Up Opportunities</p>
          </div>
          <ul className="mt-1 space-y-1 text-sm text-gray-700">
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full border border-red-400" /> {d.customers.follow_up_quotes} quotes need follow-up</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full border border-red-400" /> {d.customers.annual_window} past customers approaching prior annual order date</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full border border-red-400" /> {d.customers.inactive_180} customers haven't ordered in 6 months</li>
          </ul>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <CardHeader icon={Package} title="Blanks Purchasing" linkText="Open Purchasing" onLink={() => { window.location.href = '/admin?section=purchasing'; }} />
          <StatRow label="Purchase orders open" value={d.blanks.length} />
          <StatRow label="Will-call pickups waiting" value={d.blanks.filter((b) => b.will_call).length} valueCls={d.blanks.some((b) => b.will_call) ? 'text-teal-700' : 'text-gray-900'} />
          <StatRow label="Shipments incoming" value={d.blanks.filter((b) => !b.will_call).length} />
          <StatRow
            label="Open blanks value"
            value={money(d.blanks.reduce((s, b) => s + (b.total || 0), 0))}
          />
          <div className="my-2 border-t border-gray-200" />
          <p className="py-2 text-center text-xs text-gray-500">
            Live from the S&S purchasing system — order blanks from any quote, invoice, or the Blanks (S&S) page.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 pr-2">
            <Zap className="h-4.5 w-4.5 text-orange-500" style={{ width: 18, height: 18 }} />
            <h3 className="text-[15px] font-bold text-gray-900">Quick Actions</h3>
          </div>
          <button onClick={() => navigate('/quote')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600">
            <Plus className="h-4 w-4" /> New Quote
          </button>
          <button onClick={onNewInvoice}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-white px-4 py-2.5 text-sm font-bold text-orange-600 hover:bg-orange-50">
            <Plus className="h-4 w-4" /> New Order
          </button>
          <button onClick={onNewCustomer}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-white px-4 py-2.5 text-sm font-bold text-orange-600 hover:bg-orange-50">
            <Users className="h-4 w-4" /> New Customer
          </button>
          <button onClick={onNewJob}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-white px-4 py-2.5 text-sm font-bold text-orange-600 hover:bg-orange-50">
            <FileText className="h-4 w-4" /> New Job
          </button>
          <button onClick={() => { window.location.href = '/admin?section=purchasing'; }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-white px-4 py-2.5 text-sm font-bold text-orange-600 hover:bg-orange-50">
            <Package className="h-4 w-4" /> Purchase Order
          </button>
        </div>
      </div>
    </div>
  );
}
