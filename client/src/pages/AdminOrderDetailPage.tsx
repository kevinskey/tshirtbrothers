import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Circle, ClipboardList, DollarSign, Loader2, Mail,
  Package, Paperclip, Send, StickyNote, Trash2,
} from 'lucide-react';

// Full order dossier: one page with everything about an order (keyed by
// quote id) — status timeline, items, money, blanks POs, vendor sends,
// the customer's email thread, activity, and admin notes.

interface SizeCount { size: string; quantity: number }
interface QuoteItem {
  id: number; product_name: string | null; catalog_name: string | null;
  brand: string | null; color: string | null; sizes: SizeCount[] | string;
  quantity: number; unit_price: string | null; line_total: string | null;
}
interface Payment { amount?: number; method?: string; date?: string; recorded_at?: string }
interface InvoiceRow {
  id: string; invoice_number: string; status: string; total: string;
  amount_paid: string; amount_due: string; deposit_percent: number | null;
  payments: Payment[] | null; created_at: string;
}
interface PoRow {
  id: number; po_number: string; status: string; is_test: boolean; total: string | null;
  expected_delivery: string | null; created_at: string;
  ss_orders: Array<{ orderNumber: string; warehouseAbbr: string }>;
  tracking: Array<{ trackingNumbers: string[] }>;
}
interface VendorSend { id: number; vendor_name: string | null; vendor_email: string; reference: string | null; sent_at: string; files: Array<{ name: string }> }
interface EmailRow { id: number; from_name: string | null; from_addr: string | null; subject: string | null; snippet: string | null; msg_date: string | null; outgoing: boolean; attachments: Array<{ filename: string }> }
interface ActivityRow { event: string; path: string | null; created_at: string }
interface NoteRow { id: number; author: string | null; body: string; created_at: string }

interface Detail {
  quote: {
    id: number; customer_name: string; customer_email: string; customer_phone: string | null;
    status: string; estimated_price: string | null; quantity: number; notes: string | null;
    mockup_image_url: string | null; mockup_image_url_back: string | null;
    created_at: string; accepted_at: string | null; balance_paid_at: string | null;
    order_stages: Record<string, string> | null;
    shipping_method: string | null; fulfillment_method: string | null;
    picked_up_at: string | null; shipped_at: string | null;
    tracking_number: string | null; tracking_carrier: string | null;
  };
  items: QuoteItem[];
  invoices: InvoiceRow[];
  purchaseOrders: PoRow[];
  vendorSends: VendorSend[];
  emails: EmailRow[];
  activity: ActivityRow[];
  notes: NoteRow[];
}

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}`,
  };
}

const money = (n: string | number | null | undefined) =>
  n === null || n === undefined || n === '' ? '—' : `$${Number(n).toFixed(2)}`;
const dt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString() : null);
const day = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString() : '—');

const QUOTE_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  reviewed: 'bg-orange-100 text-orange-800',
  quoted: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
};

function Section({ title, icon: Icon, action, children }: { title: string; icon: typeof Mail; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-300 rounded-xl">
      <div className="px-4 py-3 border-b font-medium text-sm flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-500" /> {title}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function AdminOrderDetailPage() {
  const { quoteId } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [trkNumber, setTrkNumber] = useState('');
  const [trkCarrier, setTrkCarrier] = useState('');
  const [offlineFormOpen, setOfflineFormOpen] = useState(false);
  const [offlineAmount, setOfflineAmount] = useState('');
  const [offlineMethod, setOfflineMethod] = useState('cash');
  const [savingPayment, setSavingPayment] = useState(false);

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/order-detail/${quoteId}`, { headers: authHeaders() });
      if (r.status === 401 || r.status === 403) { navigate('/admin'); return; }
      if (!r.ok) { if (!opts.silent) setError(`Failed to load order (HTTP ${r.status})`); return; }
      setDetail(await r.json());
    } catch (e) {
      if (!opts.silent) setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [quoteId, navigate]);

  useEffect(() => { void load(); }, [load]);

  // Keep the page current without manual reloads: silently re-pull every
  // 15s while visible, and immediately when the tab regains focus (e.g.
  // after cancelling a PO over on the purchasing screen).
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void load({ silent: true }); };
    const iv = setInterval(tick, 15000);
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  async function recordOfflinePayment() {
    const amount = Number(offlineAmount);
    if (!Number.isFinite(amount) || amount <= 0 || savingPayment) return;
    setSavingPayment(true);
    try {
      const r = await fetch(`/api/admin/order-detail/${quoteId}/offline-payment`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ amount, method: offlineMethod }),
      });
      if (r.ok) {
        setOfflineFormOpen(false);
        setOfflineAmount('');
        await load();
      }
    } finally {
      setSavingPayment(false);
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const r = await fetch(`/api/admin/order-detail/${quoteId}/notes`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ body: noteText.trim() }),
      });
      if (r.ok) {
        const note = await r.json();
        setDetail((d) => (d ? { ...d, notes: [note, ...d.notes] } : d));
        setNoteText('');
      }
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(id: number) {
    const r = await fetch(`/api/admin/order-detail/${quoteId}/notes/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (r.ok) setDetail((d) => (d ? { ...d, notes: d.notes.filter((n) => n.id !== id) } : d));
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }
  if (error || !detail) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-sm text-gray-600">
        {error || 'Order not found'}
        <Link to="/admin?section=quotes" className="text-orange-600 hover:underline">Back to pipeline</Link>
      </div>
    );
  }

  const { quote, items, invoices, purchaseOrders, vendorSends, emails, activity, notes } = detail;

  // Money paid via invoices; quote-flow deposits (Stripe accept-and-pay,
  // no invoice row) fall back to the quote's recorded deposit so the
  // header doesn't show Paid $0.00 on a deposit-paid order.
  const invoicePaid = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
  const quoteDeposit = quote.accepted_at ? Number((quote as { deposit_amount?: string | null }).deposit_amount || 0) : 0;
  const totalPaid = invoicePaid > 0 ? invoicePaid : quoteDeposit;
  const totalDue = invoices.length > 0
    ? invoices.reduce((s, i) => s + Number(i.amount_due || 0), 0)
    : Math.max(0, Number(quote.estimated_price || 0) - totalPaid);
  const stages = quote.order_stages || {};

  // Doc's production flow: quote → accepted → mockup → deposit → blanks →
  // gang sheet sent → gang sheet picked up → pressed → customer contacted →
  // final payment → completed. Stages with a data signal check themselves;
  // shop-floor ones (stageKey set) are click-to-toggle.
  const steps: Array<{ label: string; done: boolean; when: string | null; stageKey?: string }> = [
    { label: 'Quote', done: true, when: dt(quote.created_at) },
    { label: 'Accepted', done: !!quote.accepted_at || ['accepted', 'completed'].includes(quote.status), when: dt(quote.accepted_at) },
    { label: 'Mockup', done: !!quote.mockup_image_url, when: null },
    { label: 'Deposit', done: totalPaid > 0, when: null },
    { label: 'Blanks ordered', done: purchaseOrders.some((p) => !p.is_test && p.status !== 'cancelled'), when: null },
    { label: 'Gang sheet sent', done: vendorSends.length > 0 || !!stages.gang_sent, when: dt(stages.gang_sent), stageKey: 'gang_sent' },
    { label: 'Gang sheet picked up', done: !!stages.gang_pickup, when: dt(stages.gang_pickup), stageKey: 'gang_pickup' },
    { label: 'Pressed', done: !!stages.pressed, when: dt(stages.pressed), stageKey: 'pressed' },
    { label: 'Customer contacted', done: !!stages.pickup_contacted, when: dt(stages.pickup_contacted), stageKey: 'pickup_contacted' },
    { label: 'Final payment', done: !!quote.balance_paid_at || (totalDue === 0 && totalPaid > 0), when: dt(quote.balance_paid_at) },
    { label: 'Completed', done: quote.status === 'completed', when: dt(quote.picked_up_at || quote.shipped_at) },
  ];

  async function toggleStage(key: string, done: boolean) {
    const r = await fetch(`/api/admin/order-detail/${quoteId}/stages`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ key, done }),
    });
    if (r.ok) {
      const data = await r.json();
      setDetail((d) => (d ? { ...d, quote: { ...d.quote, order_stages: data.order_stages } } : d));
    }
  }

  // Complete the order via the fulfill endpoint — sets status, stamps the
  // pickup/ship date, and fires the customer notification + review request.
  async function completeOrder(method: 'pickup' | 'ship') {
    if (completing) return;
    if (totalDue > 0 && !window.confirm(`${money(totalDue)} is still due on this order. Complete it anyway?`)) return;
    setCompleting(true);
    try {
      const r = await fetch(`/api/quotes/admin/${quoteId}/fulfill`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({
          method,
          tracking_number: trkNumber.trim() || undefined,
          carrier: trkCarrier.trim() || undefined,
        }),
      });
      if (r.ok) await load();
      else alert(`Failed to complete order (HTTP ${r.status})`);
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <Link to="/admin?section=quotes" className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-2">
              <ArrowLeft className="w-4 h-4" /> Pipeline
            </Link>
            <h1 className="text-2xl font-bold">
              Order #{quote.id} — {quote.customer_name}
              <span className={`ml-3 align-middle inline-block px-2.5 py-1 rounded-full text-xs font-medium ${QUOTE_STATUS_STYLE[quote.status] || 'bg-gray-200 text-gray-700'}`}>
                {quote.status}
              </span>
            </h1>
            <div className="text-sm text-gray-600 mt-1">
              {quote.customer_email}{quote.customer_phone ? ` · ${quote.customer_phone}` : ''}
              {' · '}{quote.quantity} pcs · est. {money(quote.estimated_price)}
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="text-gray-600">Paid <span className="font-semibold text-green-700">{money(totalPaid)}</span></div>
            <div className="text-gray-600">Due <span className={`font-semibold ${totalDue > 0 ? 'text-red-600' : 'text-gray-700'}`}>{money(totalDue)}</span></div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white border border-gray-300 rounded-xl px-4 py-4 overflow-x-auto">
          <div className="flex items-start gap-0 min-w-[980px]">
            {steps.map((s, i) => (
              <div key={s.label} className="flex-1 flex flex-col items-center text-center relative">
                {i > 0 && (
                  <div className={`absolute top-3 right-1/2 w-full h-0.5 ${s.done ? 'bg-green-500' : 'bg-gray-300'}`} style={{ zIndex: 0 }} />
                )}
                <button
                  disabled={!s.stageKey}
                  onClick={() => s.stageKey && void toggleStage(s.stageKey, !s.done)}
                  title={s.stageKey ? (s.done ? 'Click to un-mark' : 'Click to mark done') : undefined}
                  className={`relative z-10 bg-white rounded-full ${s.stageKey ? 'cursor-pointer hover:scale-110 transition-transform' : 'cursor-default'}`}
                >
                  {s.done
                    ? <CheckCircle2 className="w-6 h-6 text-green-600" />
                    : <Circle className={`w-6 h-6 ${s.stageKey ? 'text-gray-400' : 'text-gray-300'}`} />}
                </button>
                <div className={`mt-1.5 text-xs font-medium ${s.done ? 'text-gray-900' : 'text-gray-500'}`}>{s.label}</div>
                {s.when && <div className="text-[10px] text-gray-500">{s.when}</div>}
              </div>
            ))}
          </div>
          <div className="text-[11px] text-gray-500 mt-2">
            Gang sheet / pressed / customer-contacted circles are click-to-toggle; the rest check themselves from payments, POs, and vendor sends.
          </div>

          {/* Complete-order controls — the only stage with no data signal
              and no toggle. Calls the fulfill endpoint: sets status to
              completed, stamps the date, notifies the customer, and sends
              the review request. */}
          {quote.status !== 'completed' ? (
            <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Complete this order:</span>
              <button
                onClick={() => void completeOrder('pickup')}
                disabled={completing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              >
                {completing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Picked up
              </button>
              <span className="text-xs text-gray-400">or</span>
              <input
                value={trkNumber}
                onChange={(e) => setTrkNumber(e.target.value)}
                placeholder="Tracking # (optional)"
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm w-44"
              />
              <input
                value={trkCarrier}
                onChange={(e) => setTrkCarrier(e.target.value)}
                placeholder="Carrier"
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm w-24"
              />
              <button
                onClick={() => void completeOrder('ship')}
                disabled={completing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {completing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Shipped
              </button>
              <span className="text-[11px] text-gray-500 basis-full">
                Marks the order completed, stamps the date, and emails/texts the customer (plus a review request).
              </span>
            </div>
          ) : (
            <div className="mt-2 text-xs font-medium text-green-700">
              Completed — {quote.picked_up_at
                ? `picked up ${dt(quote.picked_up_at)}`
                : quote.shipped_at
                  ? `shipped ${dt(quote.shipped_at)}${quote.tracking_number ? ` · ${[quote.tracking_carrier, quote.tracking_number].filter(Boolean).join(' ')}` : ''}`
                  : 'done'}
            </div>
          )}
        </div>

        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <div className="space-y-5">
            {/* Items */}
            <Section title="Items" icon={ClipboardList}>
              {items.length === 0 ? (
                <div className="text-sm text-gray-500">No line items recorded on this quote.</div>
              ) : (
                <div className="space-y-3">
                  {items.map((it) => {
                    const sizes: SizeCount[] = typeof it.sizes === 'string' ? JSON.parse(it.sizes) : (it.sizes || []);
                    return (
                      <div key={it.id} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
                        <div className="flex justify-between gap-2">
                          <span className="font-medium">{it.product_name || it.catalog_name || 'Item'}</span>
                          <span>{money(it.line_total)}</span>
                        </div>
                        <div className="text-gray-600">
                          {[it.brand, it.color].filter(Boolean).join(' · ')}
                          {' · '}{it.quantity} pcs{it.unit_price ? ` @ ${money(it.unit_price)}` : ''}
                        </div>
                        {sizes.length > 0 && (
                          <div className="text-xs text-gray-600 mt-1">
                            {sizes.map((s) => `${s.size}×${s.quantity}`).join('  ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {(quote.mockup_image_url || quote.mockup_image_url_back) && (
                <div className="flex gap-3 mt-4">
                  {[quote.mockup_image_url, quote.mockup_image_url_back].filter(Boolean).map((url, i) => (
                    <a key={i} href={url as string} target="_blank" rel="noreferrer">
                      <img src={url as string} alt="mockup" className="h-32 rounded-lg border border-gray-200 object-contain bg-gray-50" />
                    </a>
                  ))}
                </div>
              )}
              {quote.notes && (
                <div className="mt-3 text-sm bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  <span className="font-medium">Quote notes:</span> {quote.notes}
                </div>
              )}
            </Section>

            {/* Money */}
            <Section title="Invoices & payments" icon={DollarSign}>
              {invoices.length === 0 ? (
                <div className="text-sm text-gray-500">No invoice yet.</div>
              ) : invoices.map((inv) => (
                <div key={inv.id} className="border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 last:mb-0">
                  <div className="flex justify-between">
                    <span className="font-medium">{inv.invoice_number}</span>
                    <span className="capitalize text-gray-600">{inv.status}</span>
                  </div>
                  <div className="text-gray-600">
                    Total {money(inv.total)} · Paid <span className="text-green-700">{money(inv.amount_paid)}</span> · Due{' '}
                    <span className={Number(inv.amount_due) > 0 ? 'text-red-600' : ''}>{money(inv.amount_due)}</span>
                    {inv.deposit_percent ? ` · ${inv.deposit_percent}% deposit` : ''}
                  </div>
                  {(inv.payments || []).length > 0 && (
                    <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                      {(inv.payments || []).map((p, i) => (
                        <div key={i}>
                          {money(p.amount)} via {p.method || 'payment'}{p.date || p.recorded_at ? ` — ${day(p.date || p.recorded_at)}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {/* Money that changed hands outside Stripe — cash, Zelle, Cash
                  App — still needs to land in the books so Paid/Due and the
                  Deposit stage reflect reality. */}
              {!offlineFormOpen ? (
                <button
                  onClick={() => {
                    const est = Number(quote.estimated_price || 0);
                    setOfflineAmount(totalPaid > 0 ? String(totalDue || '') : (est ? (est / 2).toFixed(2) : ''));
                    setOfflineFormOpen(true);
                  }}
                  className="mt-2 text-sm font-medium text-orange-600 hover:text-orange-700"
                >
                  + Record offline payment
                </button>
              ) : (
                <div className="mt-3 border border-gray-200 rounded-lg p-3 text-sm space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="number" min="0.01" step="0.01" value={offlineAmount}
                      onChange={(e) => setOfflineAmount(e.target.value)}
                      placeholder="Amount"
                      className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <select
                      value={offlineMethod}
                      onChange={(e) => setOfflineMethod(e.target.value)}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="cash">Cash</option>
                      <option value="zelle">Zelle</option>
                      <option value="cashapp">Cash App</option>
                      <option value="card">Card (in person)</option>
                      <option value="check">Check</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void recordOfflinePayment()}
                      disabled={savingPayment || !(Number(offlineAmount) > 0)}
                      className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg"
                    >
                      {savingPayment ? 'Saving…' : 'Record payment'}
                    </button>
                    <button onClick={() => setOfflineFormOpen(false)} className="text-gray-500 hover:text-gray-700 px-2">
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">
                    Creates the invoice if there isn't one, and marks the quote accepted — same as a Stripe deposit.
                  </p>
                </div>
              )}
            </Section>

            {/* Blanks */}
            <Section
              title="Blanks (S&S purchase orders)"
              icon={Package}
              action={
                <button
                  onClick={() => navigate(`/admin?section=purchasing&quote=${quoteId}`)}
                  className="text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded-lg"
                >
                  {purchaseOrders.some((p) => !p.is_test && p.status !== 'cancelled') ? 'Order more blanks' : 'Order blanks (S&S)'}
                </button>
              }
            >
              {purchaseOrders.length === 0 ? (
                <div className="text-sm text-gray-500">No blanks ordered for this job yet.</div>
              ) : purchaseOrders.map((po) => (
                <div key={po.id} className={`border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 last:mb-0 ${po.is_test ? 'opacity-60' : ''}`}>
                  <div className="flex justify-between">
                    <span className="font-mono text-xs">{po.po_number}</span>
                    <span className="capitalize text-gray-600">{po.is_test ? 'test' : po.status.replace('_', ' ')}</span>
                  </div>
                  <div className="text-gray-600">
                    {money(po.total)} · placed {day(po.created_at)}
                    {po.expected_delivery ? ` · expected ${day(po.expected_delivery)}` : ''}
                  </div>
                  {(po.tracking || []).flatMap((t) => t.trackingNumbers || []).map((tn) => (
                    <div key={tn} className="font-mono text-xs text-gray-600">{tn}</div>
                  ))}
                </div>
              ))}
            </Section>

            {/* Vendor sends */}
            <Section title="Sent to print vendors" icon={Send}>
              {vendorSends.length === 0 ? (
                <div className="text-sm text-gray-500">Nothing sent to vendors for this job.</div>
              ) : vendorSends.map((v) => (
                <div key={v.id} className="text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2 last:mb-0">
                  <div className="flex justify-between">
                    <span className="font-medium">{v.vendor_name || v.vendor_email}</span>
                    <span className="text-gray-500 text-xs">{day(v.sent_at)}</span>
                  </div>
                  <div className="text-xs text-gray-600">{(v.files || []).map((f) => f.name).join(', ')}</div>
                </div>
              ))}
            </Section>
          </div>

          <div className="space-y-5">
            {/* Notes */}
            <Section title="Notes" icon={StickyNote}>
              <div className="flex gap-2 mb-3">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={2}
                  placeholder="Add a note about this order…"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                />
                <button
                  onClick={() => void addNote()}
                  disabled={savingNote || !noteText.trim()}
                  className="self-end px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
                >
                  {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                </button>
              </div>
              {notes.length === 0 ? (
                <div className="text-sm text-gray-500">No notes yet.</div>
              ) : notes.map((n) => (
                <div key={n.id} className="text-sm border-l-2 border-orange-300 pl-3 py-1.5 mb-2 last:mb-0 group">
                  <div className="whitespace-pre-wrap">{n.body}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    {n.author || 'admin'} · {dt(n.created_at)}
                    <button onClick={() => void deleteNote(n.id)} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </Section>

            {/* Emails */}
            <Section title={`Email thread (${quote.customer_email})`} icon={Mail}>
              {emails.length === 0 ? (
                <div className="text-sm text-gray-500">No mail to or from this customer in the mailbox yet.</div>
              ) : emails.map((m) => (
                <Link
                  key={m.id}
                  to="/admin?section=mail"
                  className="block text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2 last:mb-0 hover:bg-gray-50"
                >
                  <div className="flex justify-between gap-2">
                    <span className={m.outgoing ? 'text-gray-600' : 'font-medium'}>
                      {m.outgoing ? '→ sent' : (m.from_name || m.from_addr)}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">{day(m.msg_date)}</span>
                  </div>
                  <div className="truncate">{m.subject || '(no subject)'}</div>
                  <div className="text-xs text-gray-600 truncate flex items-center gap-1">
                    {(m.attachments?.length ?? 0) > 0 && <Paperclip className="w-3 h-3 shrink-0" />}
                    {m.snippet}
                  </div>
                </Link>
              ))}
            </Section>

            {/* Activity */}
            <Section title="Customer activity" icon={ClipboardList}>
              {activity.length === 0 ? (
                <div className="text-sm text-gray-500">No tracked activity for this customer.</div>
              ) : (
                <div className="space-y-1.5">
                  {activity.map((a, i) => (
                    <div key={i} className="text-xs text-gray-700 flex justify-between gap-2">
                      <span>{a.event.replace(/_/g, ' ')}{a.path ? ` — ${a.path}` : ''}</span>
                      <span className="text-gray-500 whitespace-nowrap">{day(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}
