import { useState, useEffect } from 'react';
import { Loader2, Trash2, ToggleLeft, ToggleRight, Plus, X } from 'lucide-react';

interface Promo {
  id: number;
  code: string;
  holiday: string | null;
  headline: string | null;
  subtext: string | null;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  times_used: number;
  active: boolean;
  ai_generated: boolean;
  expires_at: string | null;
  created_at: string;
}

function getToken() {
  return localStorage.getItem('tsb_token') || '';
}

type DiscountType = 'percent' | 'fixed' | 'shipping';

const EMPTY_FORM = {
  code: '',
  discount_type: 'percent' as DiscountType,
  discount_value: '',
  holiday: '',
  headline: '',
  subtext: '',
  max_uses: '',
  expires_at: '',
};

export default function PromoManager() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function fetchPromos() {
    setLoading(true);
    try {
      const res = await fetch('/api/deepseek/promotions', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setPromos(await res.json());
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { fetchPromos(); }, []);

  async function createPromo(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const code = form.code.trim().toUpperCase();
    if (!code) return setFormError('Code is required');
    if (form.discount_type !== 'shipping' && !form.discount_value) {
      return setFormError('Discount value is required');
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/deepseek/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          code,
          discount_type: form.discount_type,
          discount_value: form.discount_type === 'shipping' ? 0 : Number(form.discount_value),
          holiday: form.holiday.trim() || null,
          headline: form.headline.trim() || null,
          subtext: form.subtext.trim() || null,
          max_uses: form.max_uses ? Number(form.max_uses) : null,
          expires_at: form.expires_at || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Failed to create promo' }));
        setFormError(err.error || 'Failed to create promo');
        return;
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      fetchPromos();
    } catch {
      setFormError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(id: number, active: boolean) {
    await fetch(`/api/deepseek/promotions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ active }),
    });
    fetchPromos();
  }

  async function deletePromo(id: number) {
    if (!confirm('Delete this promo?')) return;
    await fetch(`/api/deepseek/promotions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchPromos();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {!showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg shadow-sm"
          >
            <Plus className="w-4 h-4" /> New Promo
          </button>
        ) : (
          <button
            onClick={() => { setShowForm(false); setFormError(null); }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-500 hover:text-gray-800"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={createPromo} className="bg-white rounded-xl border border-orange-200 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Code *</span>
              <input
                type="text"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="SUMMER20"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-mono uppercase text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Discount Type *</span>
              <select
                value={form.discount_type}
                onChange={e => setForm(f => ({ ...f, discount_type: e.target.value as DiscountType }))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="percent">Percent off (%)</option>
                <option value="fixed">Fixed amount off ($)</option>
                <option value="shipping">Free shipping</option>
              </select>
            </label>
            {form.discount_type !== 'shipping' && (
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">
                  {form.discount_type === 'percent' ? 'Percent off (1–100) *' : 'Dollar amount off *'}
                </span>
                <input
                  type="number"
                  min={form.discount_type === 'percent' ? 1 : 0.01}
                  max={form.discount_type === 'percent' ? 100 : undefined}
                  step={form.discount_type === 'percent' ? 1 : 0.01}
                  value={form.discount_value}
                  onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                  placeholder={form.discount_type === 'percent' ? '20' : '10.00'}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Max uses (optional)</span>
              <input
                type="number"
                min={1}
                value={form.max_uses}
                onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                placeholder="Unlimited"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Expires (optional)</span>
              <input
                type="datetime-local"
                value={form.expires_at}
                onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Holiday / occasion (optional)</span>
              <input
                type="text"
                value={form.holiday}
                onChange={e => setForm(f => ({ ...f, holiday: e.target.value }))}
                placeholder="Summer Sale"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs font-semibold text-gray-600">Headline (optional)</span>
              <input
                type="text"
                value={form.headline}
                onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
                placeholder="20% off everything this weekend"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs font-semibold text-gray-600">Subtext (optional)</span>
              <input
                type="text"
                value={form.subtext}
                onChange={e => setForm(f => ({ ...f, subtext: e.target.value }))}
                placeholder="Ends Sunday at midnight"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </label>
          </div>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-sm"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Promo
            </button>
          </div>
        </form>
      )}

      {promos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-400">No promotions yet. Click <span className="font-semibold text-orange-600">New Promo</span> above, or the AI will create one automatically on the next homepage visit.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {promos.map(p => {
            const expired = p.expires_at && new Date(p.expires_at) < new Date();
            const discountLabel = p.discount_type === 'percent' ? `${p.discount_value}% OFF`
              : p.discount_type === 'fixed' ? `$${p.discount_value} OFF`
              : p.discount_type === 'shipping' ? 'FREE SHIPPING' : p.discount_type;

            return (
              <div key={p.id} className={`bg-white rounded-xl border p-4 ${!p.active || expired ? 'border-gray-200 opacity-60' : 'border-orange-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-lg text-gray-900">{p.code}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.active && !expired ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {expired ? 'EXPIRED' : p.active ? 'ACTIVE' : 'DISABLED'}
                      </span>
                      {p.ai_generated && (
                        <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">AI Generated</span>
                      )}
                    </div>
                    {p.holiday && <p className="text-sm text-gray-600 mt-1">{p.holiday}</p>}
                    {p.headline && <p className="text-sm font-semibold text-gray-800">{p.headline}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl font-black text-orange-600">{discountLabel}</p>
                    <p className="text-xs text-gray-500 mt-1">Used: <span className="font-bold">{p.times_used}</span>{p.max_uses ? `/${p.max_uses}` : ''} times</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-400">
                    Created {new Date(p.created_at).toLocaleDateString()}
                    {p.expires_at && ` · Expires ${new Date(p.expires_at).toLocaleDateString()}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(p.id, !p.active)}
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                      title={p.active ? 'Disable' : 'Enable'}
                    >
                      {p.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                      {p.active ? 'On' : 'Off'}
                    </button>
                    <button
                      onClick={() => deletePromo(p.id)}
                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
