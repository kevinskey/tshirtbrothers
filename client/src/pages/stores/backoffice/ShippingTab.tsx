// Shipping tab — what the shopper pays to get the order.
//
// These are the store's pricing policy, not carrier quotes. TSB is merchant
// of record and buys the real label afterwards, so an owner setting $6.95
// here is choosing what to charge, not what postage costs.
//
// The important thing to tell an owner: adding the FIRST option replaces
// TSB's weight-based rates entirely. Half-configured shipping is how a
// store accidentally offers $0 delivery on a 40-pound box.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Save, X, Truck } from 'lucide-react';
import {
  type BoShippingRule, deleteShippingRule, fetchShippingRules, saveShippingRule,
  dollarsToCents, centsToDollars,
} from './api';

function usd(cents: number | null | undefined) {
  return cents == null ? '—' : `$${(cents / 100).toFixed(2)}`;
}

const RULE_LABELS: Record<BoShippingRule['rule_type'], string> = {
  flat: 'Flat rate',
  per_item: 'Per item',
  free_over: 'Free over an amount',
  pickup: 'Local pickup',
};

function describe(r: BoShippingRule) {
  switch (r.rule_type) {
    case 'flat':      return `${usd(r.amount_cents)} per order`;
    case 'per_item':  return `${usd(r.amount_cents)} per item`;
    case 'pickup':    return 'Free — shopper collects';
    case 'free_over': return `${usd(r.amount_cents)}, free over ${usd(r.threshold_cents)}`;
  }
}

export default function ShippingTab({ slug, authHeaders }: {
  slug: string;
  authHeaders: Record<string, string>;
}) {
  const [rules, setRules] = useState<BoShippingRule[] | null>(null);
  const [editing, setEditing] = useState<Partial<BoShippingRule> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { rules: rows } = await fetchShippingRules(slug, authHeaders);
      setRules(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load shipping options');
      setRules([]);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  async function remove(rule: BoShippingRule) {
    const last = (rules ?? []).filter((r) => r.active).length === 1 && rule.active;
    const warning = last
      ? `Delete "${rule.label}"? It's your only shipping option, so your store goes back to T-Shirt Brothers' weight-based rates.`
      : `Delete "${rule.label}"?`;
    if (!window.confirm(warning)) return;

    try {
      await deleteShippingRule(slug, rule.id, authHeaders);
      toast.success(`Deleted "${rule.label}"`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete');
    }
  }

  async function toggle(rule: BoShippingRule) {
    try {
      await saveShippingRule(slug, { ...rule, active: !rule.active }, authHeaders);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update');
    }
  }

  if (rules === null) {
    return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>;
  }

  const anyActive = rules.some((r) => r.active);

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Shipping</h2>
          <p className="text-sm text-gray-500">
            What shoppers are charged at checkout. We still buy and print the
            real label.
          </p>
        </div>
        <button onClick={() => setEditing({ rule_type: 'flat', active: true, sort_order: rules.length })}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!anyActive && !error && (
        <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          <span className="font-medium text-gray-900">Using T-Shirt Brothers' rates.</span>{' '}
          Shoppers see weight-based USPS Ground, Rush and Next Day options.
          Add an option below to price shipping yourself instead — your options
          then replace ours completely.
        </div>
      )}

      {!rules.length && !error && (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
          <Truck className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          No shipping options of your own yet.
        </div>
      )}

      <div className="space-y-2">
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-gray-900">{r.label}</p>
              <p className="text-sm text-gray-500">
                {RULE_LABELS[r.rule_type]}{' · '}{describe(r)}
                {r.active ? '' : ' · off'}
              </p>
            </div>
            <button onClick={() => toggle(r)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                r.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
              {r.active ? 'On' : 'Off'}
            </button>
            <button onClick={() => setEditing(r)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900 hover:text-gray-900">
              Edit
            </button>
            <button onClick={() => remove(r)} aria-label={`Delete ${r.label}`}
              className="p-2 text-gray-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <EditShippingModal
          slug={slug} authHeaders={authHeaders} rule={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function EditShippingModal({ slug, authHeaders, rule, onClose, onSaved }: {
  slug: string;
  authHeaders: Record<string, string>;
  rule: Partial<BoShippingRule>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [label, setLabel] = useState(rule.label ?? '');
  const [kind, setKind] = useState<BoShippingRule['rule_type']>(rule.rule_type ?? 'flat');
  const [amount, setAmount] = useState(centsToDollars(rule.amount_cents ?? null) || '6.95');
  const [threshold, setThreshold] = useState(centsToDollars(rule.threshold_cents) || '75.00');
  const [active, setActive] = useState(rule.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      setError('Name the option — this is what shoppers see at checkout.');
      return;
    }

    // Pickup is always free, so its amount field is never read.
    let amountCents = 0;
    if (kind !== 'pickup') {
      amountCents = dollarsToCents(amount);
      if (!Number.isFinite(amountCents) || amountCents < 0) {
        setError('Enter the amount to charge, e.g. 6.95.');
        return;
      }
    }

    let thresholdCents: number | null = null;
    if (kind === 'free_over') {
      thresholdCents = dollarsToCents(threshold);
      if (!Number.isFinite(thresholdCents) || thresholdCents < 1) {
        setError('Enter the order total at which shipping becomes free.');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      await saveShippingRule(slug, {
        // Only send id when editing — omitting it is what makes the server
        // insert rather than update.
        ...(rule.id ? { id: rule.id } : {}),
        label: cleanLabel,
        rule_type: kind,
        amount_cents: amountCents,
        threshold_cents: thresholdCents,
        sort_order: rule.sort_order ?? 0,
        active,
      }, authHeaders);
      toast.success(rule.id ? `Saved "${cleanLabel}"` : `Added "${cleanLabel}"`);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="font-bold text-gray-900">{rule.id ? 'Edit shipping option' : 'New shipping option'}</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Shown to shoppers as</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="Standard shipping" className={inputCls} autoFocus />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">How it's priced</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as BoShippingRule['rule_type'])}
              className={inputCls}>
              {Object.entries(RULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>

          {kind !== 'pickup' && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                {kind === 'per_item' ? 'Charge per item' : 'Charge'}
              </span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="6.95" className={inputCls} />
            </label>
          )}

          {kind === 'free_over' && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Free when the order reaches</span>
              <input value={threshold} onChange={(e) => setThreshold(e.target.value)}
                placeholder="75.00" className={inputCls} />
              <span className="mt-1 block text-xs text-gray-500">
                Smaller orders pay the amount above, so there's always an option.
              </span>
            </label>
          )}

          {kind === 'pickup' && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Always free. Only offer this if someone is actually there to hand
              the order over.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
              className="rounded border-gray-300" />
            Offer this at checkout
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none';
