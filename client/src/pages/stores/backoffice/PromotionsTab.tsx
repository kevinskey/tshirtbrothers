// Promo codes tab — the codes a store's shoppers type at checkout.
//
// Called "promo codes" in the UI and `store_promotions` in the database.
// They are deliberately not Stripe promotion codes: Stripe's
// `allow_promotion_codes` offers every code on the TSB account at every
// store's checkout, so a code made here is checked against this one store
// instead.
//
// A discount comes out of the store's own earnings, which the owner should
// be able to see rather than discover at payout — hence the "given away"
// column.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Save, X, Tag } from 'lucide-react';
import {
  type BoPromotion, deletePromotion, fetchPromotions, savePromotion,
  dollarsToCents, centsToDollars,
} from './api';

function usd(cents: number | null | undefined) {
  return cents == null ? '—' : `$${(cents / 100).toFixed(2)}`;
}

function describe(p: BoPromotion) {
  const v = Number(p.discount_value);
  if (p.discount_type === 'percent') return `${v}% off`;
  if (p.discount_type === 'amount') return `${usd(v)} off`;
  return 'Free shipping';
}

export default function PromotionsTab({ slug, authHeaders }: {
  slug: string;
  authHeaders: Record<string, string>;
}) {
  const [promotions, setPromotions] = useState<BoPromotion[] | null>(null);
  const [editing, setEditing] = useState<Partial<BoPromotion> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const { promotions: rows } = await fetchPromotions(slug, authHeaders);
      setPromotions(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load promo codes');
      setPromotions([]);
    }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [slug]);

  async function remove(promotion: BoPromotion) {
    // A used code is kept (deactivated) so the order history still explains
    // itself. Say so up front rather than letting the toast surprise them.
    const used = promotion.times_used > 0;
    const warning = used
      ? `Turn off "${promotion.code}"? It has been used ${promotion.times_used} time${promotion.times_used === 1 ? '' : 's'}, so it is kept for your records instead of deleted.`
      : `Delete "${promotion.code}"?`;
    if (!window.confirm(warning)) return;

    try {
      const res = await deletePromotion(slug, promotion.id, authHeaders);
      toast.success(res.deleted ? `Deleted "${promotion.code}"` : `Turned off "${promotion.code}"`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete');
    }
  }

  async function toggle(promotion: BoPromotion) {
    try {
      await savePromotion(slug, { ...promotion, active: !promotion.active }, authHeaders);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update');
    }
  }

  if (promotions === null) {
    return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto" /></div>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Promo codes</h2>
          <p className="text-sm text-gray-500">
            Shoppers enter these in your cart. Each code works only at your
            store, and the discount comes out of your earnings.
          </p>
        </div>
        <button onClick={() => setEditing({ discount_type: 'percent', active: true })}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
          <Plus className="w-4 h-4" /> New
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!promotions.length && !error && (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500">
          <Tag className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          No promo codes yet. Create one and shoppers can use it right away.
        </div>
      )}

      <div className="space-y-2">
        {promotions.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono font-semibold text-gray-900">{p.code}</p>
              <p className="text-sm text-gray-500">
                {describe(p)}
                {p.min_order_cents > 0 && ` · on orders over ${usd(p.min_order_cents)}`}
                {' · used '}{p.times_used}{p.max_uses ? ` of ${p.max_uses}` : ''}
                {(p.total_discount_cents ?? 0) > 0 && ` · ${usd(p.total_discount_cents)} given away`}
                {p.expires_at && ` · ends ${new Date(p.expires_at).toLocaleDateString()}`}
                {p.active ? '' : ' · off'}
              </p>
            </div>
            <button onClick={() => toggle(p)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                p.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
              {p.active ? 'On' : 'Off'}
            </button>
            <button onClick={() => setEditing(p)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-900 hover:text-gray-900">
              Edit
            </button>
            <button onClick={() => remove(p)} aria-label={`Delete ${p.code}`}
              className="p-2 text-gray-400 hover:text-red-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <EditPromotionModal
          slug={slug} authHeaders={authHeaders} promotion={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function EditPromotionModal({ slug, authHeaders, promotion, onClose, onSaved }: {
  slug: string;
  authHeaders: Record<string, string>;
  promotion: Partial<BoPromotion>;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [code, setCode] = useState(promotion.code ?? '');
  const [kind, setKind] = useState<BoPromotion['discount_type']>(promotion.discount_type ?? 'percent');
  // Percent is whole points; amount is dollars in the form, cents on the
  // wire. Keeping one string field for both means switching type doesn't
  // silently reinterpret "10" as $0.10.
  const [percent, setPercent] = useState(
    promotion.discount_type === 'percent' ? String(Number(promotion.discount_value)) : '10',
  );
  const [dollars, setDollars] = useState(
    promotion.discount_type === 'amount' ? centsToDollars(Number(promotion.discount_value)) : '',
  );
  const [minOrder, setMinOrder] = useState(centsToDollars(promotion.min_order_cents || null));
  const [maxUses, setMaxUses] = useState(promotion.max_uses ? String(promotion.max_uses) : '');
  const [perEmail, setPerEmail] = useState(promotion.max_uses_per_email ? String(promotion.max_uses_per_email) : '');
  const [expiresAt, setExpiresAt] = useState(
    promotion.expires_at ? promotion.expires_at.slice(0, 10) : '',
  );
  const [headline, setHeadline] = useState(promotion.headline ?? '');
  const [active, setActive] = useState(promotion.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError('Give the code a name — this is what shoppers type.');
      return;
    }

    let value = 0;
    if (kind === 'percent') {
      value = Math.round(Number(percent));
      if (!(value >= 1 && value <= 100)) {
        setError('Percent off must be between 1 and 100.');
        return;
      }
    } else if (kind === 'amount') {
      value = dollarsToCents(dollars);
      if (!Number.isFinite(value) || value < 1) {
        setError('Enter the dollars off, e.g. 15.00.');
        return;
      }
    }

    const minOrderCents = minOrder.trim() ? dollarsToCents(minOrder) : 0;
    if (!Number.isFinite(minOrderCents)) {
      setError('Minimum order should be a dollar amount, or blank for none.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await savePromotion(slug, {
        // Only send id when editing — omitting it is what makes the server
        // insert rather than update.
        ...(promotion.id ? { id: promotion.id } : {}),
        code: cleanCode,
        headline: headline.trim() || null,
        discount_type: kind,
        discount_value: value,
        min_order_cents: minOrderCents,
        max_uses: maxUses.trim() ? Number(maxUses) : null,
        max_uses_per_email: perEmail.trim() ? Number(perEmail) : null,
        expires_at: expiresAt || null,
        active,
      }, authHeaders);
      toast.success(promotion.id ? `Saved "${cleanCode}"` : `Created "${cleanCode}"`);
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
          <h3 className="font-bold text-gray-900">{promotion.id ? 'Edit promo code' : 'New promo code'}</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Code</span>
            <input value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
              placeholder="SPOOKY10" className={`${inputCls} font-mono`} autoFocus />
            <span className="mt-1 block text-xs text-gray-500">
              Letters, numbers, hyphens. Shoppers aren't case-sensitive.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Discount</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as BoPromotion['discount_type'])}
              className={inputCls}>
              <option value="percent">Percent off</option>
              <option value="amount">Dollars off</option>
              <option value="free_shipping">Free shipping</option>
            </select>
          </label>

          {kind === 'percent' && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Percent off</span>
              <input type="number" min="1" max="100" value={percent}
                onChange={(e) => setPercent(e.target.value)} className={inputCls} />
            </label>
          )}
          {kind === 'amount' && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Dollars off</span>
              <input value={dollars} onChange={(e) => setDollars(e.target.value)}
                placeholder="15.00" className={inputCls} />
            </label>
          )}
          {kind === 'free_shipping' && (
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
              Covers your cheapest shipping option. Faster services still cost
              what they cost — a free-shipping code shouldn't buy overnight air.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Minimum order</span>
              <input value={minOrder} onChange={(e) => setMinOrder(e.target.value)}
                placeholder="none" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Expires</span>
              <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
                className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Total uses</span>
              <input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)}
                placeholder="unlimited" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Uses per shopper</span>
              <input type="number" min="1" value={perEmail} onChange={(e) => setPerEmail(e.target.value)}
                placeholder="unlimited" className={inputCls} />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Note to yourself</span>
            <input value={headline} onChange={(e) => setHeadline(e.target.value)}
              placeholder="Halloween weekend" className={inputCls} />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)}
              className="rounded border-gray-300" />
            Shoppers can use this code now
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
