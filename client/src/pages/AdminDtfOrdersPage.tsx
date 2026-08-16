import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Download, RefreshCw } from 'lucide-react';

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
  });

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
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
                              disabled={advance.isPending}
                              onClick={() => advance.mutate({ id: order.id, status: action.next })}
                              className="rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-orange-700 disabled:opacity-50"
                            >
                              {action.label}
                            </button>
                          )}
                          {CANCELABLE.has(order.status) && (
                            <button
                              type="button"
                              disabled={advance.isPending}
                              onClick={() => advance.mutate({ id: order.id, status: 'canceled' })}
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
