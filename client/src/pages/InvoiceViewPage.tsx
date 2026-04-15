import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, Loader2, XCircle, CheckCircle2 } from 'lucide-react';

interface PublicInvoice {
  id: number;
  invoice_number: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: unknown;
  items: Array<{ description?: string; quantity?: number; unit_price?: number; total?: number; color?: string; size?: string }> | string;
  subtotal: number | string;
  tax: number | string;
  shipping: number | string;
  discount: number | string;
  total: number | string;
  amount_paid: number | string;
  amount_due: number | string;
  status: string;
  due_date: string | null;
  notes: string | null;
  created_at: string;
}

function fmt(v: unknown): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v || 0));
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

export default function InvoiceViewPage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<PublicInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/invoices/public/${id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Invoice not found');
        return r.json();
      })
      .then(setInv)
      .catch((e) => setError(e?.message || 'Failed to load invoice'));
  }, [id]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 bg-gray-50">
        <XCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900">Invoice Not Found</h1>
        <p className="text-gray-500 mt-2">{error}</p>
      </div>
    );
  }
  if (!inv) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    );
  }

  const items = Array.isArray(inv.items) ? inv.items : (() => { try { return JSON.parse(String(inv.items || '[]')); } catch { return []; } })();
  const isPaid = inv.status === 'paid' || Number(inv.amount_due) <= 0;

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8 print:bg-white print:p-0">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-8 print:shadow-none print:rounded-none">
        {/* Actions (hidden on print) */}
        <div className="flex items-center justify-between mb-6 print:hidden">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-700">← Home</a>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">TShirt Brothers</h1>
            <p className="text-xs text-gray-500">6010 Renaissance Parkway<br />Fairburn, GA 30213<br />(470) 622-4845</p>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-bold text-gray-900">INVOICE</h2>
            <p className="text-sm text-gray-500">{inv.invoice_number}</p>
            {isPaid && (
              <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold uppercase">
                <CheckCircle2 className="w-3 h-3" /> Paid
              </span>
            )}
          </div>
        </div>

        {/* Bill to */}
        <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
          <div>
            <p className="text-xs uppercase text-gray-400 font-semibold mb-1">Bill To</p>
            <p className="font-medium text-gray-900">{inv.customer_name}</p>
            {inv.customer_email && <p className="text-gray-600">{inv.customer_email}</p>}
            {inv.customer_phone && <p className="text-gray-600">{inv.customer_phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-gray-400 font-semibold mb-1">Date</p>
            <p className="text-gray-900">{new Date(inv.created_at).toLocaleDateString()}</p>
            {inv.due_date && (
              <>
                <p className="text-xs uppercase text-gray-400 font-semibold mb-1 mt-2">Due</p>
                <p className="text-gray-900">{new Date(inv.due_date).toLocaleDateString()}</p>
              </>
            )}
          </div>
        </div>

        {/* Items */}
        <table className="w-full text-sm mb-8 border-t border-b border-gray-200">
          <thead>
            <tr className="text-xs uppercase text-gray-500">
              <th className="py-3 text-left font-semibold">Description</th>
              <th className="py-3 text-left font-semibold">Color</th>
              <th className="py-3 text-left font-semibold">Size</th>
              <th className="py-3 text-center font-semibold">Qty</th>
              <th className="py-3 text-right font-semibold">Unit</th>
              <th className="py-3 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((it: { description?: string; quantity?: number; unit_price?: number; total?: number; color?: string; size?: string }, i: number) => (
              <tr key={i}>
                <td className="py-3 text-gray-900">{it.description || '—'}</td>
                <td className="py-3 text-gray-600">{it.color || '—'}</td>
                <td className="py-3 text-gray-600">{it.size || '—'}</td>
                <td className="py-3 text-center text-gray-600">{it.quantity || 1}</td>
                <td className="py-3 text-right text-gray-600">${fmt(it.unit_price)}</td>
                <td className="py-3 text-right font-medium text-gray-900">${fmt(it.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-64 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span><span>${fmt(inv.subtotal)}</span>
            </div>
            {Number(inv.tax) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Tax</span><span>${fmt(inv.tax)}</span>
              </div>
            )}
            {Number(inv.shipping) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Shipping</span><span>${fmt(inv.shipping)}</span>
              </div>
            )}
            {Number(inv.discount) > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Discount</span><span>−${fmt(inv.discount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-gray-200 text-base font-bold text-gray-900">
              <span>Total</span><span>${fmt(inv.total)}</span>
            </div>
            {Number(inv.amount_paid) > 0 && (
              <div className="flex justify-between text-green-700 font-semibold">
                <span>Paid</span><span>−${fmt(inv.amount_paid)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t-2 border-gray-900 text-lg font-bold">
              <span>{Number(inv.amount_due) <= 0 ? 'Balance' : 'Due'}</span>
              <span className={Number(inv.amount_due) <= 0 ? 'text-green-700' : 'text-orange-600'}>${fmt(inv.amount_due)}</span>
            </div>
          </div>
        </div>

        {inv.notes && (
          <div className="text-xs text-gray-500 border-t border-gray-100 pt-4">
            <p className="uppercase font-semibold text-gray-400 mb-1">Notes</p>
            <p>{inv.notes}</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-8">Thank you for your business!</p>
      </div>
    </div>
  );
}
