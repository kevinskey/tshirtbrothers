import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Download, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────── */
/*  Types — mirror server/routes/gangsheetStore.js's admin/orders shape    */
/* ────────────────────────────────────────────────────────────────────── */

type TierKey = 'standard' | 'rush' | 'hot_rush';
type ShipAddress = { line1?: string; city?: string; state?: string; zip?: string };

type OrderRow = {
  id: number;
  customer_name: string | null;
  customer_email: string | null;
  length_ft: number;
  tier: TierKey;
  price_cents: number;
  shipping_cents: number;
  delivery: 'pickup' | 'ship';
  ship_address: ShipAddress | null;
  file_height_px: number | null;
  note: string | null;
  status: string;
  paid_at: string | null;
  created_at: string;
};

// Server-side height check (1 ft = 3,600 px) as a display value, so a
// mismatch between the file's actual height and the ordered length is
// visible in the queue before the sheet goes to print.
function fileHeightFt(px: number | null): number | null {
  return px == null ? null : Math.ceil(px / 3600);
}

const TIER_LABEL: Record<TierKey, string> = { standard: 'Standard', rush: 'Rush', hot_rush: 'Hot Rush' };
const TIER_BADGE: Record<TierKey, string> = {
  standard: 'bg-gray-100 text-gray-700 border border-gray-200',
  rush: 'bg-amber-100 text-amber-800 border border-amber-200',
  hot_rush: 'bg-red-100 text-red-700 border border-red-200',
};

// Next status in the paid → in_production → ready → completed chain, plus
// the button label for that transition. Terminal statuses (completed,
// canceled) have no entry — no more buttons to show.
const NEXT_ACTION: Partial<Record<string, { next: string; label: string }>> = {
  paid: { next: 'in_production', label: 'Start Production' },
  in_production: { next: 'ready', label: 'Mark Ready' },
  ready: { next: 'completed', label: 'Mark Completed' },
};
const CANCELABLE = new Set(['paid', 'in_production', 'ready']);

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Deadline against the tier's promise, computed from paid_at:
//   hot_rush = same-day EOD · rush = next business day EOD ·
//   standard = paid + 2 business days EOD.
function computeDeadline(order: OrderRow): Date | null {
  if (!order.paid_at) return null;
  const paid = new Date(order.paid_at);
  if (order.tier === 'hot_rush') return endOfDay(paid);
  if (order.tier === 'rush') return endOfDay(addBusinessDays(paid, 1));
  return endOfDay(addBusinessDays(paid, 2));
}

function countdownLabel(order: OrderRow): { text: string; overdue: boolean } {
  const deadline = computeDeadline(order);
  if (!deadline) return { text: '—', overdue: false };
  const ms = deadline.getTime() - Date.now();
  if (ms <= 0) return { text: 'OVERDUE', overdue: true };
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) return { text: `${hours}h ${mins}m left`, overdue: false };
  const days = Math.floor(hours / 24);
  return { text: `${days}d ${hours % 24}h left`, overdue: false };
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token') || '';
  return { Authorization: `Bearer ${token}` };
}

async function downloadOrderFile(id: number) {
  try {
    const r = await fetch(`/api/gangsheet-store/admin/orders/${id}/file`, { headers: authHeaders() });
    if (!r.ok) throw new Error('Download failed');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `order-${id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Download failed');
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Admin gate — cloned from GangSheetPage.tsx:10-27                       */
/* ────────────────────────────────────────────────────────────────────── */

export default function AdminDtfOrdersPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) {
      navigate('/auth?redirect=/admin/dtf-orders&reason=admin');
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((user) => {
        if (user.role !== 'admin') {
          navigate('/auth?reason=admin');
        } else {
          setChecking(false);
        }
      })
      .catch(() => navigate('/auth?redirect=/admin/dtf-orders&reason=admin'));
  }, [navigate]);

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return <DtfOrdersQueue />;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Pricing & turnaround settings — mirrors gang_sheet_store_settings       */
/* ────────────────────────────────────────────────────────────────────── */

type SettingsRow = {
  rate_standard_cents: number;
  rate_rush_cents: number;
  rate_hot_rush_cents: number;
  cutoff_rush: string;      // 'HH:MM:SS' (Postgres TIME, as text)
  cutoff_hot_rush: string;
  min_ft: number;
  max_ft: number;
  shipping_flat_cents: number;
  standard_active: boolean;
  rush_active: boolean;
  hot_rush_active: boolean;
};

// Everything in the form is a controlled text/checkbox input, so the form
// state is all strings/booleans — converted to real numbers only at save
// time. Keeps every keystroke (including a mid-edit "12." or "") a valid
// render instead of fighting a numeric useState.
type SettingsForm = {
  rate_standard: string;   // dollars
  rate_rush: string;
  rate_hot_rush: string;
  cutoff_rush: string;     // 'HH:MM' (type="time" shape)
  cutoff_hot_rush: string;
  min_ft: string;
  max_ft: string;
  shipping_flat: string;   // dollars
  standard_active: boolean;
  rush_active: boolean;
  hot_rush_active: boolean;
};

function centsToDollarStr(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Postgres TIME comes back as 'HH:MM:SS' — <input type="time"> wants exactly
// 'HH:MM'.
function toHHMM(t: string): string {
  return t.slice(0, 5);
}

function settingsToForm(s: SettingsRow): SettingsForm {
  return {
    rate_standard: centsToDollarStr(s.rate_standard_cents),
    rate_rush: centsToDollarStr(s.rate_rush_cents),
    rate_hot_rush: centsToDollarStr(s.rate_hot_rush_cents),
    cutoff_rush: toHHMM(s.cutoff_rush),
    cutoff_hot_rush: toHHMM(s.cutoff_hot_rush),
    min_ft: String(s.min_ft),
    max_ft: String(s.max_ft),
    shipping_flat: centsToDollarStr(s.shipping_flat_cents),
    standard_active: s.standard_active,
    rush_active: s.rush_active,
    hot_rush_active: s.hot_rush_active,
  };
}

// Dollar string -> integer cents, or null if it's not a valid non-negative
// number (blank field, stray letters, negative typo, etc).
function dollarsToCents(v: string): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function intOrNull(v: string): number | null {
  if (!/^\d+$/.test(v.trim())) return null;
  return parseInt(v, 10);
}

const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const labelCls = 'block text-xs font-semibold text-gray-600';

function SettingsCard() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: settings, isLoading, isError } = useQuery<SettingsRow>({
    queryKey: ['dtf-admin-settings'],
    queryFn: async () => {
      const r = await fetch('/api/gangsheet-store/admin/settings', { headers: authHeaders() });
      if (!r.ok) throw new Error('Failed to load settings');
      return r.json();
    },
    enabled: open,
  });

  // Seed the form once, the first time settings load — further server
  // refetches (e.g. after Save) shouldn't clobber whatever the admin is
  // mid-typing.
  useEffect(() => {
    if (settings && !form) setForm(settingsToForm(settings));
  }, [settings, form]);

  function patch(partial: Partial<SettingsForm>) {
    setForm((f) => (f ? { ...f, ...partial } : f));
  }

  async function handleSave() {
    if (!form) return;
    const rateStandardCents = dollarsToCents(form.rate_standard);
    const rateRushCents = dollarsToCents(form.rate_rush);
    const rateHotRushCents = dollarsToCents(form.rate_hot_rush);
    const shippingFlatCents = dollarsToCents(form.shipping_flat);
    const minFt = intOrNull(form.min_ft);
    const maxFt = intOrNull(form.max_ft);
    if (
      rateStandardCents === null || rateRushCents === null || rateHotRushCents === null
      || shippingFlatCents === null || minFt === null || maxFt === null
    ) {
      toast.error('Check your inputs — some values look invalid');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/gangsheet-store/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          rate_standard_cents: rateStandardCents,
          rate_rush_cents: rateRushCents,
          rate_hot_rush_cents: rateHotRushCents,
          cutoff_rush: form.cutoff_rush,
          cutoff_hot_rush: form.cutoff_hot_rush,
          min_ft: minFt,
          max_ft: maxFt,
          shipping_flat_cents: shippingFlatCents,
          standard_active: form.standard_active,
          rush_active: form.rush_active,
          hot_rush_active: form.hot_rush_active,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Save failed');
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['dtf-admin-settings'] });
      queryClient.invalidateQueries({ queryKey: ['dtf-config'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="font-display text-sm font-bold text-gray-900">Pricing &amp; turnaround settings</span>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 px-4 py-4">
          {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
          {isError && <p className="text-sm text-red-600">Couldn&apos;t load settings.</p>}
          {form && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className={labelCls}>
                  Standard rate ($/ft)
                  <input
                    type="number" step="0.01" min="0" value={form.rate_standard}
                    onChange={(e) => patch({ rate_standard: e.target.value })}
                    className={inputCls} style={{ fontSize: '16px' }}
                  />
                </label>
                <label className={labelCls}>
                  Rush rate ($/ft)
                  <input
                    type="number" step="0.01" min="0" value={form.rate_rush}
                    onChange={(e) => patch({ rate_rush: e.target.value })}
                    className={inputCls} style={{ fontSize: '16px' }}
                  />
                </label>
                <label className={labelCls}>
                  Hot rush rate ($/ft)
                  <input
                    type="number" step="0.01" min="0" value={form.rate_hot_rush}
                    onChange={(e) => patch({ rate_hot_rush: e.target.value })}
                    className={inputCls} style={{ fontSize: '16px' }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  Rush cutoff
                  <input
                    type="time" value={form.cutoff_rush}
                    onChange={(e) => patch({ cutoff_rush: e.target.value })}
                    className={inputCls} style={{ fontSize: '16px' }}
                  />
                </label>
                <label className={labelCls}>
                  Hot rush cutoff
                  <input
                    type="time" value={form.cutoff_hot_rush}
                    onChange={(e) => patch({ cutoff_hot_rush: e.target.value })}
                    className={inputCls} style={{ fontSize: '16px' }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className={labelCls}>
                  Min length (ft)
                  <input
                    type="number" min="1" max="40" step="1" value={form.min_ft}
                    onChange={(e) => patch({ min_ft: e.target.value })}
                    className={inputCls} style={{ fontSize: '16px' }}
                  />
                </label>
                <label className={labelCls}>
                  Max length (ft)
                  <input
                    type="number" min="1" max="40" step="1" value={form.max_ft}
                    onChange={(e) => patch({ max_ft: e.target.value })}
                    className={inputCls} style={{ fontSize: '16px' }}
                  />
                </label>
                <label className={labelCls}>
                  Shipping (flat, $)
                  <input
                    type="number" step="0.01" min="0" value={form.shipping_flat}
                    onChange={(e) => patch({ shipping_flat: e.target.value })}
                    className={inputCls} style={{ fontSize: '16px' }}
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                  <input
                    type="checkbox" checked={form.standard_active}
                    onChange={(e) => patch({ standard_active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  Standard active
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                  <input
                    type="checkbox" checked={form.rush_active}
                    onChange={(e) => patch({ rush_active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  Rush active
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                  <input
                    type="checkbox" checked={form.hot_rush_active}
                    onChange={(e) => patch({ hot_rush_active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                  />
                  Hot rush active
                </label>
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Queue table                                                            */
/* ────────────────────────────────────────────────────────────────────── */

function DtfOrdersQueue() {
  const [statusFilter, setStatusFilter] = useState<'open' | 'all'>('open');
  const queryClient = useQueryClient();

  const { data: orders, isLoading, isError, isFetching } = useQuery<OrderRow[]>({
    queryKey: ['dtf-admin-orders', statusFilter],
    queryFn: async () => {
      const r = await fetch(`/api/gangsheet-store/admin/orders?status=${statusFilter}`, { headers: authHeaders() });
      if (!r.ok) throw new Error('Failed to load orders');
      return r.json();
    },
    refetchInterval: 30_000,
  });

  // Which single order's PATCH is in flight — used to disable that row's
  // buttons only, instead of every row in the table going inert whenever
  // any one action is pending (advance.isPending is shared across the
  // whole mutation, not per-row).
  const [mutatingId, setMutatingId] = useState<number | null>(null);

  const advance = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await fetch(`/api/gangsheet-store/admin/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ status }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || 'Update failed');
      return body;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['dtf-admin-orders'] }); },
    onError: (err) => { toast.error(err instanceof Error ? err.message : 'Update failed'); },
    onSettled: () => { setMutatingId(null); },
  });

  function handleAdvance(id: number, status: string) {
    setMutatingId(id);
    advance.mutate({ id, status });
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <SettingsCard />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold text-gray-900">DTF Gang Sheet Orders</h1>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
              {(['open', 'all'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setStatusFilter(f)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    statusFilter === f ? 'bg-orange-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {f === 'open' ? 'Open' : 'All'}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['dtf-admin-orders'] })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {isError && <p className="py-10 text-sm text-gray-500">Couldn&apos;t load orders — check your connection and refresh.</p>}
        {orders && orders.length === 0 && (
          <p className="py-10 text-sm text-gray-500">No {statusFilter === 'open' ? 'open ' : ''}orders right now.</p>
        )}

        {orders && orders.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-3 py-2 font-semibold">Order</th>
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Delivery</th>
                  <th className="px-3 py-2 font-semibold">Paid / Deadline</th>
                  <th className="px-3 py-2 font-semibold">Note</th>
                  <th className="px-3 py-2 font-semibold">Price</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const countdown = countdownLabel(order);
                  const action = NEXT_ACTION[order.status];
                  const addr = order.ship_address;
                  const fileFt = fileHeightFt(order.file_height_px);
                  const fileMismatch = fileFt !== null && fileFt !== order.length_ft;
                  return (
                    <tr key={order.id} className="border-b border-gray-100 align-top last:border-b-0">
                      <td className="px-3 py-3">
                        <span className="font-semibold text-gray-900">#{order.id}</span>
                        <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${TIER_BADGE[order.tier]}`}>
                          {TIER_LABEL[order.tier]}
                        </span>
                        <div className="mt-0.5 text-xs text-gray-500">
                          {order.length_ft} ft ordered
                          {fileFt !== null && (
                            <span className={fileMismatch ? 'ml-1 font-semibold text-red-600' : 'ml-1 text-gray-400'}>
                              · file {fileFt} ft{fileMismatch ? ' ⚠' : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900">{order.customer_name || '—'}</div>
                        <div className="text-xs text-gray-500">{order.customer_email || '—'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-gray-700">{order.delivery === 'ship' ? 'Ship' : 'Pickup'}</div>
                        {order.delivery === 'ship' && addr && (
                          <div className="mt-0.5 text-xs text-gray-500">
                            {addr.line1 || '—'}<br />
                            {addr.city || ''}{addr.city && addr.state ? ', ' : ''}{addr.state || ''} {addr.zip || ''}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-gray-700">{order.paid_at ? new Date(order.paid_at).toLocaleString() : '—'}</div>
                        <div className={`mt-0.5 text-xs font-semibold ${countdown.overdue ? 'text-red-600' : 'text-gray-500'}`}>
                          {countdown.text}
                        </div>
                      </td>
                      <td className="px-3 py-3 max-w-[160px]">
                        {order.note && <p className="text-xs italic text-gray-600">{order.note}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-gray-900">{money(order.price_cents)}</div>
                        {order.shipping_cents > 0 && (
                          <div className="text-xs text-gray-500">+ {money(order.shipping_cents)} ship</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold capitalize text-gray-700">
                          {order.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => downloadOrderFile(order.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            <Download className="h-3.5 w-3.5" /> Download
                          </button>
                          {action && (
                            <button
                              type="button"
                              disabled={mutatingId === order.id}
                              onClick={() => handleAdvance(order.id, action.next)}
                              className="rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                            >
                              {action.label}
                            </button>
                          )}
                          {CANCELABLE.has(order.status) && (
                            <button
                              type="button"
                              disabled={mutatingId === order.id}
                              onClick={() => handleAdvance(order.id, 'canceled')}
                              className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
