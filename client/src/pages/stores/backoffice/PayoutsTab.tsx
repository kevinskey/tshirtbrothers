// Payouts tab — how the store's share reaches the store.
//
// Two ways. By default TSB holds the money and pays out monthly by ACH,
// which is what every store does today and works fine. Connect a Stripe
// account and the share is moved the moment a customer's card clears.
//
// The screen has to be honest about three states, because the middle one is
// where owners get confused and give up:
//
//   not connected    — nothing to do, payouts still arrive, just monthly
//   connected but not payable — Stripe is still reviewing, or something is
//                      outstanding. Orders KEEP WORKING; they're just still
//                      on the monthly run until Stripe finishes.
//   payable          — money arrives at checkout
//
// The middle state is the one worth getting right. An owner who sees
// "connected" and then doesn't get paid instantly will assume it's broken.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ExternalLink, RefreshCw, CheckCircle2, Clock, Banknote } from 'lucide-react';
import {
  type BoConnectStatus, fetchConnectStatus, startConnectOnboarding, refreshConnectStatus,
} from './api';

export default function PayoutsTab({ slug, authHeaders }: {
  slug: string;
  authHeaders: Record<string, string>;
}) {
  const [status, setStatus] = useState<BoConnectStatus | null>(null);
  const [busy, setBusy] = useState<'onboard' | 'refresh' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await fetchConnectStatus(slug, authHeaders));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load payout settings');
      setStatus({
        connected: false, account_id: null, charges_enabled: false,
        payouts_enabled: false, details_submitted: false, payable: false, updated_at: null,
      });
    }
  }, [slug, authHeaders]);

  useEffect(() => { void load(); }, [load]);

  // Stripe sends the owner back here with ?stripe=done. The account.updated
  // webhook usually lands first, but not always, so refresh on return rather
  // than showing them a stale "not connected" after they just finished.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (!p.get('stripe')) return;
    void (async () => {
      try { setStatus(await refreshConnectStatus(slug, authHeaders)); } catch { /* keep what we have */ }
      p.delete('stripe');
      window.history.replaceState({}, '',
        window.location.pathname + (p.toString() ? `?${p}` : '') + window.location.hash);
    })();
  }, [slug, authHeaders]);

  async function connect() {
    setBusy('onboard');
    try {
      const { url } = await startConnectOnboarding(slug, authHeaders);
      // Account links are single-use and short-lived — go straight there.
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start setup');
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy('refresh');
    try {
      setStatus(await refreshConnectStatus(slug, authHeaders));
      toast.success('Updated from Stripe');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not refresh');
    } finally { setBusy(null); }
  }

  if (status === null) {
    return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>;
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">Payouts</h2>
        <p className="text-sm text-gray-500">
          How your share of each sale reaches you.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {status.payable ? (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <div>
              <p className="font-semibold text-green-900">Paid at checkout</p>
              <p className="mt-1 text-sm text-green-800">
                Your share of every sale goes straight to your Stripe account
                when the customer pays. Stripe then pays it into your bank on
                its own schedule.
              </p>
            </div>
          </div>
        </div>
      ) : status.connected ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Stripe still needs something</p>
              <p className="mt-1 text-sm text-amber-800">
                {status.details_submitted
                  ? 'Your details are in and Stripe is reviewing them. This usually takes a few minutes, sometimes a day.'
                  : 'Your Stripe setup was started but not finished.'}
              </p>
              {/* The reassurance that stops a support call. */}
              <p className="mt-2 text-sm text-amber-800">
                Nothing is broken in the meantime — your store is selling
                normally and you are still being paid on the monthly run.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={connect} disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
                  {busy === 'onboard' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                  {status.details_submitted ? 'Review on Stripe' : 'Finish setup'}
                </button>
                <button onClick={refresh} disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-md border border-amber-300 px-4 py-2 text-sm text-amber-900 hover:border-amber-500 disabled:opacity-50">
                  {busy === 'refresh' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Check again
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-start gap-3">
            <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />
            <div>
              <p className="font-semibold text-gray-900">Paid monthly by T-Shirt Brothers</p>
              <p className="mt-1 text-sm text-gray-600">
                Your share builds up as orders come in and is paid out on the
                1st of each month. You can see the running total on the
                Fundraiser tab.
              </p>
              <hr className="my-4 border-gray-200" />
              <p className="text-sm font-medium text-gray-900">Want it sooner?</p>
              <p className="mt-1 text-sm text-gray-600">
                Connect a Stripe account and your share arrives as each order
                is paid for, instead of waiting for the monthly run. Stripe
                will ask for your bank details and some ID — that is their
                form, and T-Shirt Brothers never sees any of it.
              </p>
              <button onClick={connect} disabled={busy !== null}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
                {busy === 'onboard' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Set up direct payouts
              </button>
            </div>
          </div>
        </div>
      )}

      {status.connected && (
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <Row label="Can take payments" ok={status.charges_enabled} />
          <Row label="Can receive payouts" ok={status.payouts_enabled} />
          <Row label="Details submitted" ok={status.details_submitted} />
          <div className="col-span-2 pt-1 text-xs text-gray-400">
            Stripe account {status.account_id}
            {status.updated_at && ` · checked ${new Date(status.updated_at).toLocaleString()}`}
          </div>
        </dl>
      )}
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <>
      <dt className="text-gray-600">{label}</dt>
      <dd className={ok ? 'text-green-700 font-medium' : 'text-gray-400'}>{ok ? 'Yes' : 'Not yet'}</dd>
    </>
  );
}
