// Quick Bill — bill a customer right now, in one screen.
//
// The full invoice editor assumes a job: order link, mockup, catalog lines,
// deposit, preview, then send. A customer at the counter paying $45 for
// three shirts, or someone on the phone who just wants a pay link, needs
// none of that. This asks for who + how much + what for, then does ONE of:
//   • email a pay link      (POST /invoices, then /send)
//   • text a pay link       (POST /invoices, then /send-sms)
//   • record cash/Zelle/etc (POST /invoices, then /record-payment, then a
//                            receipt email if there is an address)
// Everything lands as a normal invoice with an order number, so the list,
// the order page and the customer page all see it. If a provider step
// fails (mail/SMS down) the invoice still exists and is offered to open.

import { useEffect, useMemo, useRef, useState } from 'react';
import { DollarSign, Loader2, Mail, MessageSquare, X, ExternalLink, Plus, Trash2 } from 'lucide-react';
import {
  createInvoice, sendInvoice, sendInvoiceSms, recordPayment,
  type Customer, type Invoice, type InvoiceItem,
} from '@/lib/api';
import { PAYMENT_METHODS } from '@/lib/paymentMethods';

// Same rate the invoice editor starts from. Off by default here: the
// amount the admin types at the counter is the amount being charged.
const TAX_RATE_PCT = 7.75;

type Outcome = 'emailed' | 'texted' | 'paid' | 'paid_receipt_failed' | 'draft';
type Line = { description: string; quantity: string; unit_price: string };


function money(n: number) { return `$${n.toFixed(2)}`; }

export default function QuickBillModal({ customers, onClose, onDone, onOpenInvoice, toast }: {
  customers: Customer[];
  onClose: () => void;
  onDone: (invoice: Invoice, outcome: Outcome) => void;
  onOpenInvoice: (invoice: Invoice) => void;
  toast: (msg: string, tone?: 'success' | 'error') => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([{ description: '', quantity: '1', unit_price: '' }]);
  const [addTax, setAddTax] = useState(false);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState('cash');
  const [busy, setBusy] = useState<Outcome | null>(null);
  // Set when the invoice saved but the send/text/receipt step failed —
  // the admin needs to know the bill exists and get to it.
  const [saved, setSaved] = useState<{ invoice: Invoice; problem: string } | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const matches = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 2) return [];
    return customers
      .filter((c) => (c.name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.phone || '').includes(q))
      .slice(0, 6);
  }, [customers, name]);

  const subtotal = lines.reduce((n, l) => n + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);
  const tax = addTax ? +(subtotal * (TAX_RATE_PCT / 100)).toFixed(2) : 0;
  const total = +(subtotal + tax).toFixed(2);

  const emailOk = /\S+@\S+\.\S+/.test(email.trim());
  const phoneDigits = phone.replace(/\D/g, '');
  const phoneOk = phoneDigits.length >= 10;
  const ready = name.trim().length > 0 && total > 0 && lines.some((l) => l.description.trim()) && (emailOk || phoneOk);

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function createBill(): Promise<Invoice> {
    const items: InvoiceItem[] = lines
      .filter((l) => l.description.trim() && (parseFloat(l.unit_price) || 0) >= 0)
      .map((l) => ({ description: l.description.trim(), quantity: Math.max(1, parseInt(l.quantity, 10) || 1), unit_price: +(parseFloat(l.unit_price) || 0).toFixed(2) }));
    return createInvoice({
      customer_name: name.trim(),
      customer_email: email.trim(),
      customer_phone: phone.trim() || undefined,
      items,
      subtotal: +subtotal.toFixed(2),
      tax,
      shipping: 0,
      discount: 0,
      total,
      notes: note.trim() || undefined,
      // Pay-in-full link: a counter sale is not a job that takes a deposit.
      deposit_percent: 0,
    });
  }

  async function run(outcome: Outcome) {
    if (!ready || busy) return;
    if (outcome === 'emailed' && !emailOk) { toast('Add an email address to email the link', 'error'); return; }
    if (outcome === 'texted' && !phoneOk) { toast('Add a mobile number to text the link', 'error'); return; }
    setBusy(outcome);
    let invoice: Invoice | null = null;
    try {
      invoice = await createBill();
    } catch (err) {
      setBusy(null);
      toast(`Could not save the bill: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
      return;
    }
    try {
      if (outcome === 'emailed') {
        invoice = await sendInvoice(invoice.id);
      } else if (outcome === 'texted') {
        await sendInvoiceSms(invoice.id);
      } else if (outcome === 'paid') {
        invoice = await recordPayment(invoice.id, { amount: total, method });
        if (emailOk) {
          // Nothing owed → the send route emails a receipt, not a pay link.
          try { invoice = await sendInvoice(invoice.id); } catch (err) {
            toast(`Receipt email failed: ${err instanceof Error ? err.message : 'mail error'}. The payment is recorded — print the invoice as a receipt.`, 'error');
            onDone(invoice, 'paid_receipt_failed');
            return;
          }
        }
      }
      onDone(invoice, outcome);
    } catch (err) {
      setSaved({ invoice, problem: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setBusy(null);
    }
  }

  // No width here: the line-item row sizes its own cells (a `w-full` on
  // the quantity box out-ranked `w-14` and squeezed the description to 0).
  const box = 'border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white';
  const field = `w-full ${box}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-bill-title"
        className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[95vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center"><DollarSign className="w-4 h-4" /></span>
            <div>
              <h3 id="quick-bill-title" className="font-display font-semibold text-gray-900 leading-tight">Quick bill</h3>
              <p className="text-[11px] text-gray-500 leading-tight">Who, how much — then send it or mark it paid.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        {saved ? (
          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">{saved.invoice.invoice_number} is saved, but the last step failed.</p>
              <p className="mt-1">{saved.problem}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onOpenInvoice(saved.invoice)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium"><ExternalLink className="w-4 h-4" /> Open the invoice</button>
              {emailOk && <button type="button" disabled={busy !== null} onClick={async () => { setBusy('emailed'); try { const inv = await sendInvoice(saved.invoice.id); onDone(inv, 'emailed'); } catch (err) { setSaved({ invoice: saved.invoice, problem: err instanceof Error ? err.message : 'Unknown error' }); } finally { setBusy(null); } }} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700">Retry email</button>}
              {phoneOk && <button type="button" disabled={busy !== null} onClick={async () => { setBusy('texted'); try { await sendInvoiceSms(saved.invoice.id); onDone(saved.invoice, 'texted'); } catch (err) { setSaved({ invoice: saved.invoice, problem: err instanceof Error ? err.message : 'Unknown error' }); } finally { setBusy(null); } }} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700">Retry text</button>}
              <button type="button" onClick={() => onDone(saved.invoice, 'draft')} className="px-4 py-2.5 rounded-lg text-sm font-medium text-gray-500">Keep as draft</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {/* Who */}
            <div className="space-y-3">
              <div className="relative">
                <label className="block text-xs font-semibold text-gray-600 mb-1">Customer</label>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => { setName(e.target.value); setSuggestOpen(true); }}
                  onFocus={() => setSuggestOpen(true)}
                  onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                  placeholder="Name — start typing to find a past customer"
                  autoComplete="off"
                  className={field}
                  style={{ fontSize: '16px' }}
                />
                {suggestOpen && matches.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                    {matches.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setName(c.name || ''); setEmail(c.email || ''); setPhone(c.phone || ''); setSuggestOpen(false); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-green-50 flex items-center justify-between gap-3"
                      >
                        <span className="text-sm font-medium text-gray-900 truncate">{c.name}</span>
                        <span className="text-xs text-gray-500 truncate">{c.email}{c.phone ? ` · ${c.phone}` : ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Email <span className="font-normal text-gray-400">(for the link or receipt)</span></label>
                  <input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={field} style={{ fontSize: '16px' }} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Mobile <span className="font-normal text-gray-400">(to text the link)</span></label>
                  <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(404) 555-0123" className={field} style={{ fontSize: '16px' }} />
                </div>
              </div>
              {!emailOk && !phoneOk && (name.trim().length > 0) && (
                <p className="text-[11px] text-gray-500">An email or a mobile number is needed to get the bill to them.</p>
              )}
            </div>

            {/* What */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">What for</label>
              <div className="space-y-2">
                {lines.map((l, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      value={l.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                      placeholder={i === 0 ? '3 black tees, front print' : 'Another item'}
                      className={`${box} flex-1 min-w-0`}
                      style={{ fontSize: '16px' }}
                    />
                    <input
                      value={l.quantity}
                      onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      inputMode="numeric"
                      aria-label="Quantity"
                      className={`${box} w-14 flex-none text-center px-1`}
                      style={{ fontSize: '16px' }}
                    />
                    <div className="relative w-24 flex-none">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        value={l.unit_price}
                        onChange={(e) => updateLine(i, { unit_price: e.target.value })}
                        inputMode="decimal"
                        aria-label="Price each"
                        placeholder="0.00"
                        className={`${field} pl-6 pr-2`}
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                    {lines.length > 1 && (
                      <button type="button" aria-label="Remove line" onClick={() => setLines((p) => p.filter((_, j) => j !== i))} className="p-2 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <button type="button" onClick={() => setLines((p) => [...p, { description: '', quantity: '1', unit_price: '' }])} className="text-xs font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Add a line</button>
                <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={addTax} onChange={(e) => setAddTax(e.target.checked)} className="rounded border-gray-300" />
                  Add {TAX_RATE_PCT}% sales tax
                </label>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Quantity × price each. Leave tax off if the price you typed already includes it.</p>
            </div>

            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note on the bill (optional)" className={field} style={{ fontSize: '16px' }} />

            {/* Total */}
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {addTax && subtotal > 0 ? <>Subtotal {money(subtotal)} · Tax {money(tax)}</> : <>Charged in full · no deposit</>}
              </div>
              <div className="text-xl font-bold text-gray-900">{money(total)}</div>
            </div>

            {/* Do it */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!ready || !emailOk || busy !== null}
                  onClick={() => run('emailed')}
                  className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-40"
                >
                  {busy === 'emailed' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />} Email pay link
                </button>
                <button
                  type="button"
                  disabled={!ready || !phoneOk || busy !== null}
                  onClick={() => run('texted')}
                  className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-purple-600 text-white text-sm font-semibold disabled:opacity-40"
                >
                  {busy === 'texted' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />} Text pay link
                </button>
              </div>
              <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                <p className="text-xs font-semibold text-green-900 mb-2">They paid just now — record it</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setMethod(m.value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${method === m.value ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-700 border-gray-200 hover:border-green-400'}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!ready || busy !== null}
                  onClick={() => run('paid')}
                  className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-40"
                >
                  {busy === 'paid' ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                  Mark paid {total > 0 ? money(total) : ''}{emailOk ? ' & email receipt' : ''}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
