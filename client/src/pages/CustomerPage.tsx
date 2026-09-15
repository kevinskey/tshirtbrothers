import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Mail, Phone, MapPin, FileText, Layers, StickyNote, Trash2, User,
} from 'lucide-react';

// Admin customer page (/admin/customers/:id): everything about one customer
// in one place — contact info, lifetime totals, running notes log, and all
// past purchases (invoices, quotes, DTF gang sheet orders, saved designs).
// Data comes from the admin customer-360 endpoint.

interface CustomerDetail {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  created_at: string;
  designs: Array<{ id: number; name: string; product_name: string | null; mockup_url: string | null; created_at: string }>;
  quotes: Array<{ id: number; product_name: string | null; quantity: number; status: string; estimated_price: string | null; created_at: string }>;
  invoices: Array<{ id: number; invoice_number: string; total: string; amount_paid: string; amount_due: string; status: string; created_at: string }>;
  gang_sheet_orders: Array<{ id: number; length_ft: number; tier: string; price_cents: number; shipping_cents: number; delivery: string; status: string; paid_at: string | null; created_at: string }>;
  notes: Array<{ id: number; body: string; created_at: string; author?: string | null }>;
  totals: { lifetime_paid: number; outstanding_balance: number; paid_invoice_count: number };
}

const authHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}`,
});

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');
const fmtMoney = (n: number | string) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  completed: 'bg-green-100 text-green-700',
  accepted: 'bg-blue-100 text-blue-700',
  sent: 'bg-blue-100 text-blue-700',
  quoted: 'bg-purple-100 text-purple-700',
  pending: 'bg-yellow-100 text-yellow-700',
};
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export default function CustomerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/customers/${id}`, { headers: authHeaders() });
      if (r.status === 401) { navigate('/auth?reason=admin'); return; }
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Customer not found');
      setCustomer(await r.json());
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { void load(); }, [load]);

  async function addNote() {
    const body = noteDraft.trim();
    if (!body || noteSaving) return;
    setNoteSaving(true);
    try {
      const r = await fetch(`/api/admin/customers/${id}/notes`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ body }),
      });
      if (!r.ok) throw new Error('Could not save note');
      setNoteDraft('');
      await load();
    } catch (e: any) {
      alert(e?.message || 'Could not save note');
    } finally {
      setNoteSaving(false);
    }
  }

  async function deleteNote(noteId: number) {
    if (!confirm('Delete this note?')) return;
    await fetch(`/api/admin/customers/notes/${noteId}`, { method: 'DELETE', headers: authHeaders() });
    await load();
  }

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>;
  }
  if (error || !customer) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
        <p className="text-gray-600">{error || 'Customer not found'}</p>
        <button onClick={() => navigate('/admin?section=customers')} className="text-sm text-orange-600 hover:underline">Back to customers</button>
      </div>
    );
  }

  const address = [customer.address_street, customer.address_city, customer.address_state, customer.address_zip].filter(Boolean).join(', ');
  const purchases = customer.invoices.length + customer.gang_sheet_orders.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <button onClick={() => navigate('/admin?section=customers')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Customers
        </button>

        {/* Header card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900">{customer.name || customer.email}</h1>
              <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1 text-sm text-gray-600">
                <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 hover:text-orange-600"><Mail className="w-3.5 h-3.5" />{customer.email}</a>
                {customer.phone && <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 hover:text-orange-600"><Phone className="w-3.5 h-3.5" />{customer.phone}</a>}
                {address && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{address}</span>}
              </div>
              <p className="text-xs text-gray-400 mt-1">Customer since {fmtDate(customer.created_at)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: 'Lifetime paid', value: fmtMoney(customer.totals.lifetime_paid) },
              { label: 'Outstanding', value: fmtMoney(customer.totals.outstanding_balance) },
              { label: 'Purchases', value: purchases },
              { label: 'Quotes', value: customer.quotes.length },
            ].map((t) => (
              <div key={t.label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-lg font-bold text-gray-900">{t.value}</p>
                <p className="text-xs text-gray-500">{t.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3"><StickyNote className="w-4 h-4 text-amber-500" /> Notes</h2>
          <div className="flex gap-2 mb-3">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add a note about this customer…"
              rows={2}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-orange-500 resize-y"
              style={{ fontSize: '16px' }}
            />
            <button onClick={() => void addNote()} disabled={noteSaving || !noteDraft.trim()} className="self-end px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-50">
              {noteSaving ? '…' : 'Add'}
            </button>
          </div>
          {customer.notes.length === 0 ? (
            <p className="text-sm text-gray-400">No notes yet.</p>
          ) : (
            <div className="space-y-2">
              {customer.notes.map((n) => (
                <div key={n.id} className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-2 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.body}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}{n.author ? ` · ${n.author}` : ''}</p>
                  </div>
                  <button onClick={() => void deleteNote(n.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invoices */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-green-600" /> Invoices ({customer.invoices.length})</h2>
          {customer.invoices.length === 0 ? <p className="text-sm text-gray-400">No invoices.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-4 font-medium">Invoice</th><th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium text-right">Total</th><th className="py-2 pr-4 font-medium text-right">Paid</th>
                  <th className="py-2 pr-4 font-medium text-right">Due</th><th className="py-2 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {customer.invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-4 font-medium text-gray-900">{inv.invoice_number}</td>
                      <td className="py-2 pr-4 text-gray-500">{fmtDate(inv.created_at)}</td>
                      <td className="py-2 pr-4 text-right">{fmtMoney(inv.total)}</td>
                      <td className="py-2 pr-4 text-right text-green-700">{fmtMoney(inv.amount_paid)}</td>
                      <td className="py-2 pr-4 text-right text-red-600">{fmtMoney(inv.amount_due)}</td>
                      <td className="py-2"><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Gang sheet orders */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3"><Layers className="w-4 h-4 text-orange-500" /> DTF gang sheets ({customer.gang_sheet_orders.length})</h2>
          {customer.gang_sheet_orders.length === 0 ? <p className="text-sm text-gray-400">No gang sheet orders.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-4 font-medium">Date</th><th className="py-2 pr-4 font-medium">Sheet</th>
                  <th className="py-2 pr-4 font-medium">Delivery</th><th className="py-2 pr-4 font-medium text-right">Price</th>
                  <th className="py-2 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {customer.gang_sheet_orders.map((g) => (
                    <tr key={g.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-4 text-gray-500">{fmtDate(g.paid_at || g.created_at)}</td>
                      <td className="py-2 pr-4">22" × {g.length_ft} ft · {g.tier}</td>
                      <td className="py-2 pr-4 capitalize">{g.delivery}</td>
                      <td className="py-2 pr-4 text-right">{fmtMoney((g.price_cents + g.shipping_cents) / 100)}</td>
                      <td className="py-2"><StatusBadge status={g.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quotes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-purple-500" /> Quotes ({customer.quotes.length})</h2>
          {customer.quotes.length === 0 ? <p className="text-sm text-gray-400">No quotes.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="py-2 pr-4 font-medium">Date</th><th className="py-2 pr-4 font-medium">Product</th>
                  <th className="py-2 pr-4 font-medium text-right">Qty</th><th className="py-2 pr-4 font-medium text-right">Price</th>
                  <th className="py-2 font-medium">Status</th>
                </tr></thead>
                <tbody>
                  {customer.quotes.map((q) => (
                    <tr key={q.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 pr-4 text-gray-500">{fmtDate(q.created_at)}</td>
                      <td className="py-2 pr-4">{q.product_name || '—'}</td>
                      <td className="py-2 pr-4 text-right">{q.quantity}</td>
                      <td className="py-2 pr-4 text-right">{q.estimated_price ? fmtMoney(q.estimated_price) : '—'}</td>
                      <td className="py-2"><StatusBadge status={q.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Saved designs */}
        {customer.designs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Saved designs ({customer.designs.length})</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {customer.designs.map((d) => (
                <div key={d.id} className="text-center">
                  <div className="aspect-square bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center border border-gray-100">
                    {d.mockup_url ? <img src={d.mockup_url} alt="" loading="lazy" className="w-full h-full object-contain" /> : <FileText className="w-6 h-6 text-gray-200" />}
                  </div>
                  <p className="text-[11px] text-gray-600 mt-1 truncate">{d.name || d.product_name || 'Design'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
