import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Phone, Plus, Trash2, X, Search, Download, StickyNote,
} from 'lucide-react';

interface Prospect {
  id: number;
  tier: 'A' | 'B' | 'C';
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  phone_confidence: string | null;
  google_rating: string | null;
  product_angle: string | null;
  notes: string | null;
  status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost';
  contact_name: string | null;
  contact_email: string | null;
  outreach_notes: string | null;
  last_contacted_at: string | null;
}

const STATUSES: Prospect['status'][] = ['new', 'contacted', 'quoted', 'won', 'lost'];

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const STATUS_STYLE: Record<Prospect['status'], string> = {
  new:       'bg-gray-100 text-gray-700',
  contacted: 'bg-blue-100 text-blue-800',
  quoted:    'bg-purple-100 text-purple-800',
  won:       'bg-green-100 text-green-800',
  lost:      'bg-red-100 text-red-700',
};

// Tier is a priority, so it reads as a severity stripe rather than a colour code.
const TIER_STRIPE: Record<Prospect['tier'], string> = {
  A: 'bg-brand-600', B: 'bg-blue-500', C: 'bg-gray-300',
};
const TIER_TEXT: Record<Prospect['tier'], string> = {
  A: 'text-brand-700 border-brand-300',
  B: 'text-blue-700 border-blue-300',
  C: 'text-gray-500 border-gray-300',
};

const TIER_BLURB: Record<Prospect['tier'], string> = {
  A: 'Recurring apparel need — churches, schools, daycares, trades, shops',
  B: 'Staff shirts and promo runs — restaurants, offices, salons',
  C: 'Largest orders, longest cycle — warehouses, city, chamber',
};

// How a phone number was sourced. Shown next to every number so nobody dials a
// half-matched listing thinking it was confirmed.
const CONFIDENCE_STYLE: Record<string, string> = {
  'verified':       'text-green-700',
  'verify on call': 'text-amber-600',
  'map listing':    'text-gray-500',
  'added by hand':  'text-gray-500',
};

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}`,
  };
}

export default function ProspectsAdmin() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('');
  const [status, setStatus] = useState('');
  const [hasPhone, setHasPhone] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  function flash(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/prospects', { headers: authHeaders() });
      if (!r.ok) throw new Error('Could not load prospects');
      const d = await r.json();
      setProspects(d.prospects || []);
    } catch {
      flash('err', 'Could not load the prospect list. Refresh to try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Filtering runs client-side: 143 rows is small, and it keeps typing instant.
  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    return prospects.filter(p => {
      if (tier && p.tier !== tier) return false;
      if (status && p.status !== status) return false;
      if (hasPhone === 'yes' && !p.phone) return false;
      if (hasPhone === 'no' && p.phone) return false;
      if (!term) return true;
      return [p.name, p.category, p.address, p.product_angle, p.notes,
              p.contact_name, p.outreach_notes, p.phone]
        .some(v => (v || '').toLowerCase().includes(term));
    });
  }, [prospects, q, tier, status, hasPhone]);

  const stats = useMemo(() => ({
    a: prospects.filter(p => p.tier === 'A').length,
    b: prospects.filter(p => p.tier === 'B').length,
    c: prospects.filter(p => p.tier === 'C').length,
    phones: prospects.filter(p => p.phone).length,
    worked: prospects.filter(p => p.status !== 'new').length,
    won: prospects.filter(p => p.status === 'won').length,
  }), [prospects]);

  async function patch(id: number, body: Record<string, unknown>) {
    // Optimistic: the row updates immediately, then reconciles with the server.
    const before = prospects;
    setProspects(rows => rows.map(r => (r.id === id ? { ...r, ...body } as Prospect : r)));
    try {
      const r = await fetch(`/api/admin/prospects/${id}`, {
        method: 'PATCH', headers: authHeaders(), body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setProspects(rows => rows.map(x => (x.id === id ? d.prospect : x)));
    } catch {
      setProspects(before);
      flash('err', 'That change did not save. Check your connection and try again.');
    }
  }

  async function remove(id: number, name: string) {
    if (!confirm(`Remove ${name} from the prospect list? This cannot be undone.`)) return;
    try {
      const r = await fetch(`/api/admin/prospects/${id}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (!r.ok) throw new Error();
      setProspects(rows => rows.filter(x => x.id !== id));
      flash('ok', `Removed ${name}`);
    } catch {
      flash('err', 'Could not remove that prospect.');
    }
  }

  function exportCsv() {
    const head = ['Tier', 'Business', 'Category', 'Address', 'City', 'Phone',
                  'Phone Confidence', 'Rating', 'Product Angle', 'Status',
                  'Contact', 'Email', 'Outreach Notes', 'Last Contacted', 'Notes'];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [head.map(cell).join(',')].concat(
      visible.map(p => [p.tier, p.name, p.category, p.address, p.city, p.phone,
                        p.phone_confidence, p.google_rating, p.product_angle, p.status,
                        p.contact_name, p.contact_email, p.outreach_notes,
                        p.last_contacted_at ? p.last_contacted_at.slice(0, 10) : '',
                        p.notes].map(cell).join(','))
    ).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'tsb-prospects.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 className="text-xl md:text-2xl font-display font-bold text-gray-900">
          Sales Prospects
        </h2>
        <div className="flex gap-2">
          <button onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700">
            <Plus className="w-4 h-4" /> Add prospect
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-5 max-w-3xl">
        Businesses and organizations around Fairburn ranked by how likely they are to
        buy custom printed apparel. Set a status as you work each one — it saves for
        everyone on the team, not just this browser.
      </p>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {[
          { k: 'Tier A', v: stats.a, d: 'Call first', hot: true },
          { k: 'Tier B', v: stats.b, d: 'Warm' },
          { k: 'Tier C', v: stats.c, d: 'Long game' },
          { k: 'Phone on file', v: stats.phones, d: 'Callable now' },
          { k: 'Worked', v: stats.worked, d: 'Past “new”' },
          { k: 'Won', v: stats.won, d: 'Closed deals', good: true },
        ].map(t => (
          <div key={t.k} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{t.k}</div>
            <div className={`text-2xl font-bold tabular-nums ${
              t.hot ? 'text-brand-600' : t.good ? 'text-green-600' : 'text-gray-900'}`}>{t.v}</div>
            <div className="text-xs text-gray-500">{t.d}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search name, category, street, angle, or notes…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
        </div>
        <select value={tier} onChange={e => setTier(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">All tiers</option>
          <option value="A">Tier A</option><option value="B">Tier B</option><option value="C">Tier C</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">Any status</option>
          {STATUSES.map(s => <option key={s} value={s}>{titleCase(s)}</option>)}
        </select>
        <select value={hasPhone} onChange={e => setHasPhone(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg">
          <option value="">Phone or not</option>
          <option value="yes">Has phone</option>
          <option value="no">Needs phone</option>
        </select>
        <span className="text-xs text-gray-500 tabular-nums ml-auto">
          {visible.length} of {prospects.length} shown
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm border border-gray-200 rounded-lg bg-white">
          No prospects match those filters.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500">
                  <th className="w-2" />
                  <th className="px-3 py-2 font-semibold">Business</th>
                  <th className="px-3 py-2 font-semibold">Phone</th>
                  <th className="px-3 py-2 font-semibold hidden lg:table-cell">Category</th>
                  <th className="px-3 py-2 font-semibold hidden md:table-cell">Address</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold w-10" />
                </tr>
              </thead>
              <tbody>
                {visible.map(p => (
                  <Fragment key={p.id}>
                    <tr className="border-b border-gray-100 last:border-0 align-top">
                      <td className={`${TIER_STRIPE[p.tier]} w-2 p-0`} />
                      <td className="px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <span className={`shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${TIER_TEXT[p.tier]}`}>
                            {p.tier}
                          </span>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900">{p.name}</div>
                            {p.product_angle && (
                              <div className="text-xs text-gray-500 mt-0.5">{p.product_angle}</div>
                            )}
                            {p.notes && (
                              <div className="text-xs text-brand-600 mt-0.5">{p.notes}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {p.phone ? (
                          <>
                            <a href={`tel:${p.phone.replace(/[^0-9x]/g, '')}`}
                              className="inline-flex items-center gap-1 font-semibold text-gray-900 hover:text-brand-600 tabular-nums">
                              <Phone className="w-3.5 h-3.5" />{p.phone}
                            </a>
                            {p.phone_confidence && (
                              <div className={`text-[10px] uppercase tracking-wide mt-0.5 ${
                                CONFIDENCE_STYLE[p.phone_confidence] || 'text-gray-500'}`}>
                                {p.phone_confidence}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-400 italic">not found</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 hidden lg:table-cell whitespace-nowrap">
                        {p.category}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 hidden md:table-cell text-xs">
                        {p.address}{p.city && p.city !== p.address ? <><br />{p.city}</> : null}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={p.status}
                          onChange={e => patch(p.id, { status: e.target.value })}
                          className={`text-xs font-semibold rounded-full px-2 py-1 border-0 cursor-pointer ${STATUS_STYLE[p.status]}`}
                        >
                          {STATUSES.map(s => (
                            <option key={s} value={s}>{titleCase(s)}</option>
                          ))}
                        </select>
                        {p.last_contacted_at && (
                          <div className="text-[10px] text-gray-400 mt-1">
                            {new Date(p.last_contacted_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5">
                        <button
                          onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                          title="Contact details and call notes"
                          className={`p-1.5 rounded hover:bg-gray-100 ${
                            p.outreach_notes || p.contact_name ? 'text-brand-600' : 'text-gray-400'}`}
                        >
                          <StickyNote className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>

                    {expanded === p.id && (
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <td className={TIER_STRIPE[p.tier]} />
                        <td colSpan={6} className="px-3 py-3">
                          <div className="grid md:grid-cols-3 gap-3">
                            <label className="text-xs">
                              <span className="block text-gray-500 mb-1">Who you talked to</span>
                              <input
                                defaultValue={p.contact_name || ''}
                                onBlur={e => e.target.value !== (p.contact_name || '')
                                  && patch(p.id, { contact_name: e.target.value })}
                                placeholder="Name and role"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded" />
                            </label>
                            <label className="text-xs">
                              <span className="block text-gray-500 mb-1">Email</span>
                              <input
                                type="email"
                                defaultValue={p.contact_email || ''}
                                onBlur={e => e.target.value !== (p.contact_email || '')
                                  && patch(p.id, { contact_email: e.target.value })}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded" />
                            </label>
                            <label className="text-xs">
                              <span className="block text-gray-500 mb-1">
                                Phone {p.phone ? '' : '(none found — add it here)'}
                              </span>
                              <input
                                defaultValue={p.phone || ''}
                                onBlur={e => e.target.value !== (p.phone || '')
                                  && patch(p.id, { phone: e.target.value })}
                                placeholder="(770) 555-0100"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded" />
                            </label>
                          </div>
                          <label className="text-xs block mt-3">
                            <span className="block text-gray-500 mb-1">Call notes</span>
                            <textarea
                              rows={3}
                              defaultValue={p.outreach_notes || ''}
                              onBlur={e => e.target.value !== (p.outreach_notes || '')
                                && patch(p.id, { outreach_notes: e.target.value })}
                              placeholder="What they need, when to follow up, who decides…"
                              className="w-full px-2 py-1.5 border border-gray-300 rounded" />
                          </label>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[11px] text-gray-400">
                              {TIER_BLURB[p.tier]} · changes save when you click away
                            </span>
                            <button onClick={() => remove(p.id, p.name)}
                              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700">
                              <Trash2 className="w-3.5 h-3.5" /> Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-4 max-w-3xl leading-relaxed">
        <strong className="text-gray-500">On the phone labels:</strong>{' '}
        <span className="text-green-700 font-semibold">verified</span> means the business
        name and street address agreed across two independent sources.{' '}
        <span className="text-amber-600 font-semibold">verify on call</span> means the name
        matched but the listed address differed — confirm you have the right place when
        someone picks up. Rows reading <em>not found</em> had no number that could be
        matched honestly; add one in the notes panel as you find it.
      </p>

      {adding && <AddProspect onClose={() => setAdding(false)}
        onAdded={p => { setProspects(rows => [p, ...rows]); flash('ok', `Added ${p.name}`); }} />}

      {toast && (
        <div className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-lg text-sm text-white shadow-lg z-50 ${
          toast.kind === 'ok' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function AddProspect({ onClose, onAdded }: {
  onClose: () => void;
  onAdded: (p: Prospect) => void;
}) {
  const [form, setForm] = useState({
    name: '', tier: 'B', category: '', address: '', city: 'Fairburn',
    phone: '', product_angle: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Give the business a name.'); return; }
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/admin/prospects', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || 'Could not save that prospect.'); return; }
      onAdded(d.prospect);
      onClose();
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form onSubmit={submit} className="bg-white rounded-xl w-full max-w-lg p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-lg text-gray-900">Add a prospect</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2">
            <span className="block text-xs text-gray-500 mb-1">Business name</span>
            <input value={form.name} onChange={set('name')} autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">Tier</span>
            <select value={form.tier} onChange={set('tier')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option value="A">A — call first</option>
              <option value="B">B — warm</option>
              <option value="C">C — long game</option>
            </select>
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">Category</span>
            <input value={form.category} onChange={set('category')} placeholder="Roofing contractor"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">Address</span>
            <input value={form.address} onChange={set('address')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">City</span>
            <input value={form.city} onChange={set('city')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">Phone</span>
            <input value={form.phone} onChange={set('phone')} placeholder="(770) 555-0100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </label>
          <label>
            <span className="block text-xs text-gray-500 mb-1">What they'd buy</span>
            <input value={form.product_angle} onChange={set('product_angle')}
              placeholder="Crew tees, hi-vis, hats"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </label>
        </div>

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60 inline-flex items-center gap-1.5">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Add prospect
          </button>
        </div>
      </form>
    </div>
  );
}
