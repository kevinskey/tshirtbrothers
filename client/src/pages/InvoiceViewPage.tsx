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
  mockup_id: number | null;
  mockup_preview_url: string | null;
  mockup_preview_url_back: string | null;
  extra_mockups?: Array<{ mockup_id: number | null; front: string; back: string | null }> | null;
}

function fmt(v: unknown): string {
  const n = typeof v === 'number' ? v : parseFloat(String(v || 0));
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

export default function InvoiceViewPage() {
  const { id } = useParams<{ id: string }>();
  const [inv, setInv] = useState<PublicInvoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (k: string) => setOpenGroups((p) => ({ ...p, [k]: !p[k] }));

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

  // Group identical design+color runs so a 27-row size breakdown reads as a
  // handful of summary lines with expandable size detail. Groups of one
  // render as plain rows.
  type Item = { description?: string; quantity?: number; unit_price?: number; total?: number; color?: string; size?: string };
  const groups: { key: string; description: string; color: string; items: Item[]; qty: number; total: number }[] = [];
  for (const it of items as Item[]) {
    const key = `${it.description || ''}|${it.color || ''}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, description: it.description || '—', color: it.color || '', items: [], qty: 0, total: 0 };
      groups.push(g);
    }
    g.items.push(it);
    g.qty += Number(it.quantity) || 1;
    g.total += Number(it.total) || (Number(it.quantity) || 1) * (Number(it.unit_price) || 0);
  }

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
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2">
          <div className="flex items-center gap-3">
            <img
              src="https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png"
              alt="TShirt Brothers"
              className="h-12 w-12 object-contain"
            />
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">TSHIRT <span className="text-orange-600">BROTHERS</span></h1>
              <p className="text-xs text-gray-500">6010 Renaissance Parkway, Fairburn, GA 30213 · (470) 622-1392</p>
            </div>
          </div>
          <div className="text-left sm:text-right">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-wide">INVOICE</h2>
            <p className="text-sm text-gray-500">{inv.invoice_number}</p>
            {isPaid && (
              <span className="inline-flex items-center gap-1 mt-2 px-3 py-1 rounded-full bg-green-100 text-green-800 text-xs font-bold uppercase">
                <CheckCircle2 className="w-3 h-3" /> Paid
              </span>
            )}
          </div>
        </div>
        <div className="h-1 rounded-full bg-orange-600 mb-8" />

        {/* Bill to */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8 text-sm">
          <div>
            <p className="text-xs uppercase text-gray-400 font-semibold mb-1">Bill To</p>
            <p className="font-medium text-gray-900">{inv.customer_name}</p>
            {inv.customer_email && <p className="text-gray-600 break-all">{inv.customer_email}</p>}
            {inv.customer_phone && <p className="text-gray-600">{inv.customer_phone}</p>}
          </div>
          <div className="sm:text-right flex sm:block gap-8">
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

        {/* Mockup preview — front and/or back depending on what's attached */}
        {(inv.mockup_preview_url || inv.mockup_preview_url_back || (inv.extra_mockups && inv.extra_mockups.length > 0)) && (
          <div className="mb-8 border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            <div className="px-4 py-2 text-xs uppercase text-gray-500 font-semibold border-b border-gray-200">Approved Mockup</div>
            <div className={`p-3 bg-white grid gap-3 ${(inv.mockup_preview_url && inv.mockup_preview_url_back) || (inv.extra_mockups && inv.extra_mockups.length > 0) ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              {inv.mockup_preview_url && (
                <div className="flex flex-col items-center">
                  <img src={inv.mockup_preview_url} alt="Mockup front" className="max-h-96 w-auto object-contain" />
                  {inv.mockup_preview_url_back && <span className="mt-1 text-[11px] uppercase tracking-wider text-gray-500">Front</span>}
                </div>
              )}
              {inv.mockup_preview_url_back && (
                <div className="flex flex-col items-center">
                  <img src={inv.mockup_preview_url_back} alt="Mockup back" className="max-h-96 w-auto object-contain" />
                  <span className="mt-1 text-[11px] uppercase tracking-wider text-gray-500">Back</span>
                  {(inv.extra_mockups ?? []).map((m, i) => (
                <div key={`${m.front}-${i}`} className="flex flex-col items-center">
                  <img src={m.front} alt={`Mockup ${i + 2}`} className="max-h-96 w-auto object-contain" />
                </div>
              ))}
            </div>
              )}
              {(inv.extra_mockups ?? []).map((m, i) => (
                <div key={`${m.front}-${i}`} className="flex flex-col items-center">
                  <img src={m.front} alt={`Mockup ${i + 2}`} className="max-h-96 w-auto object-contain" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items — grouped by design+color; size detail expands on tap and
            is always shown when printing. Cards on phones, table from sm. */}
        <div className="sm:hidden mb-8 border-t border-gray-200 divide-y divide-gray-100">
          {groups.map((g, gi) => {
            const single = g.items.length === 1;
            const it0 = g.items[0]!;
            const open = !!openGroups[g.key];
            return (
              <div key={g.key} className={`py-3 px-2 -mx-2 transition-colors hover:bg-orange-50/60 active:bg-orange-50 ${gi % 2 ? 'bg-gray-50' : ''}`}>
                <button
                  type="button"
                  onClick={() => !single && toggleGroup(g.key)}
                  className="w-full text-left"
                  disabled={single}
                >
                  <div className="flex justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900 leading-snug">
                      {!single && <span className="text-gray-400 mr-1 print:hidden">{open ? '▾' : '▸'}</span>}
                      {g.description}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">${fmt(g.total)}</p>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {g.color && `${g.color} · `}
                    {single
                      ? `${it0.size ? `${it0.size} · ` : ''}${it0.quantity || 1} × $${fmt(it0.unit_price)}`
                      : `${g.qty} pieces · ${g.items.length} sizes${open ? '' : ' — tap for detail'}`}
                  </p>
                </button>
                {!single && (
                  <div className={`${open ? 'block' : 'hidden'} print:block mt-2 ml-3 border-l-2 border-gray-100 pl-3 space-y-1`}>
                    {g.items.map((it, j) => (
                      <p key={j} className="text-xs text-gray-500 flex justify-between">
                        <span>{it.size || '—'} · {it.quantity || 1} × ${fmt(it.unit_price)}</span>
                        <span>${fmt(it.total)}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <table className="hidden sm:table w-full text-sm mb-8 border-t border-b border-gray-200">
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
            {groups.map((g, gi) => {
              const single = g.items.length === 1;
              const it0 = g.items[0]!;
              const open = !!openGroups[g.key];
              const stripe = gi % 2 ? 'bg-gray-50' : '';
              if (single) {
                return (
                  <tr key={g.key} className={`${stripe} hover:bg-orange-50/60 transition-colors print:hover:bg-transparent`}>
                    <td className="py-3 text-gray-900">{g.description}</td>
                    <td className="py-3 text-gray-600">{g.color || '—'}</td>
                    <td className="py-3 text-gray-600">{it0.size || '—'}</td>
                    <td className="py-3 text-center text-gray-600">{it0.quantity || 1}</td>
                    <td className="py-3 text-right text-gray-600">${fmt(it0.unit_price)}</td>
                    <td className="py-3 text-right font-medium text-gray-900">${fmt(it0.total)}</td>
                  </tr>
                );
              }
              return [
                <tr key={g.key} onClick={() => toggleGroup(g.key)} className={`cursor-pointer hover:bg-orange-50/60 transition-colors print:hover:bg-transparent ${stripe}`}>
                  <td className="py-3 text-gray-900 font-medium">
                    <span className="text-gray-400 mr-1 print:hidden">{open ? '▾' : '▸'}</span>{g.description}
                  </td>
                  <td className="py-3 text-gray-600">{g.color || '—'}</td>
                  <td className="py-3 text-gray-500 text-xs">{g.items.length} sizes</td>
                  <td className="py-3 text-center text-gray-600">{g.qty}</td>
                  <td className="py-3 text-right text-gray-400 text-xs print:hidden">{open ? '' : 'view'}</td>
                  <td className="py-3 text-right font-medium text-gray-900">${fmt(g.total)}</td>
                </tr>,
                ...g.items.map((it, j) => (
                  <tr key={`${g.key}-${j}`} className={`${open ? '' : 'hidden'} print:table-row hover:bg-orange-50/50 transition-colors print:hover:bg-transparent ${gi % 2 ? 'bg-gray-100/70' : 'bg-gray-50/60'}`}>
                    <td className="py-1.5 pl-6 text-xs text-gray-400" colSpan={2}>↳</td>
                    <td className="py-1.5 text-xs text-gray-600">{it.size || '—'}</td>
                    <td className="py-1.5 text-center text-xs text-gray-600">{it.quantity || 1}</td>
                    <td className="py-1.5 text-right text-xs text-gray-600">${fmt(it.unit_price)}</td>
                    <td className="py-1.5 text-right text-xs text-gray-600">${fmt(it.total)}</td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-full sm:w-64 space-y-1 text-sm">
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
            <p className="whitespace-pre-line leading-relaxed">{inv.notes}</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-8">Thank you for your business!</p>
      </div>
    </div>
  );
}
