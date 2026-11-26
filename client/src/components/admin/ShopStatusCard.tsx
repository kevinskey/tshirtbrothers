import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SHOP_STATUS_KEY } from '@/lib/shopStatus';

// Whole-shop open / closed switch for the admin dashboard. While closed,
// the site shows a closed notice and every new order or checkout pauses
// (DTF, the instant quote's lock-in, team webstores, the gifts store).
// Invoice, deposit and balance payments and quote requests stay open.

type ShopStatusRow = {
  closed: boolean;
  reopens_on: string | null;
  note: string | null;
};

const ADMIN_KEY = ['shop-status-admin'] as const;

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token') || '';
  return { Authorization: `Bearer ${token}` };
}

// Today in Atlanta as 'YYYY-MM-DD', the same clock the server closes on.
function atlantaToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function prettyDay(ymd: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric',
  }).format(new Date(`${ymd}T12:00:00Z`));
}

const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';
const labelCls = 'block text-xs font-semibold text-gray-600';

export default function ShopStatusCard() {
  const queryClient = useQueryClient();
  const { data: status } = useQuery<ShopStatusRow>({
    queryKey: ADMIN_KEY,
    queryFn: async () => {
      const r = await fetch('/api/shop-status/admin', { headers: authHeaders() });
      if (!r.ok) throw new Error('Failed to load shop status');
      return r.json();
    },
    staleTime: 30 * 1000,
  });
  const [reopensOn, setReopensOn] = useState('');
  const [note, setNote] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status && !seeded) {
      setReopensOn(status.reopens_on ?? '');
      setNote(status.note ?? '');
      setSeeded(true);
    }
  }, [status, seeded]);

  if (!status) return null;

  const today = atlantaToday();
  const storedReopen = status.reopens_on ?? null;
  // Mirrors shopClosure() on the server: the switch, unless its reopen
  // date has already arrived.
  const closedNow = !!status.closed && (!storedReopen || today < storedReopen);

  async function save(closed: boolean) {
    if (closed && reopensOn && reopensOn <= today) {
      toast.error('Pick a reopen date after today, or leave it blank');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/shop-status/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          closed,
          reopens_on: closed && reopensOn ? reopensOn : null,
          note: closed && note.trim() ? note.trim().slice(0, 280) : null,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Save failed');
      queryClient.setQueryData(ADMIN_KEY, body);
      if (body.closure) queryClient.setQueryData(SHOP_STATUS_KEY, body.closure);
      if (!closed) { setReopensOn(''); setNote(''); }
      toast.success(closed ? 'Shop closed — new orders are paused' : 'Shop is open again');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`mb-4 rounded-xl border-2 p-4 ${closedNow ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">
            {closedNow
              ? (storedReopen ? `Shop is closed — reopens ${prettyDay(storedReopen)}` : 'Shop is closed')
              : 'Shop is open'}
          </p>
          <p className="text-xs text-gray-600">
            {closedNow
              ? 'The site shows a closed notice and new orders are paused everywhere. Invoices, deposits and quote requests still come in.'
              : 'Close it for a holiday or a day off. New orders pause across the whole site; invoices and quote requests still come in.'}
          </p>
        </div>
        {closedNow ? (
          <button
            type="button" disabled={saving} onClick={() => save(false)}
            className="w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 sm:w-auto"
          >
            {saving ? 'Saving…' : 'Open the shop'}
          </button>
        ) : (
          <button
            type="button" disabled={saving} onClick={() => save(true)}
            className="w-full rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50 sm:w-auto"
          >
            {saving ? 'Saving…' : 'Close the shop'}
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className={labelCls}>
          Reopen on (optional — opens by itself that morning)
          <input
            type="date" min={today} value={reopensOn}
            onChange={(e) => setReopensOn(e.target.value)}
            className={inputCls} style={{ fontSize: '16px' }}
          />
        </label>
        <label className={labelCls}>
          Note to customers (optional)
          <input
            type="text" maxLength={280} value={note} placeholder="Happy Thanksgiving!"
            onChange={(e) => setNote(e.target.value)}
            className={inputCls} style={{ fontSize: '16px' }}
          />
        </label>
      </div>
      {closedNow && (
        <button
          type="button" disabled={saving} onClick={() => save(true)}
          className="mt-3 text-xs font-semibold text-amber-800 underline disabled:opacity-50"
        >
          Update reopen date and note
        </button>
      )}
    </div>
  );
}
