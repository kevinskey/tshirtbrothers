// Inline editor for the customer name / email / phone on a quote.
// Read-only by default with a small Edit pencil; click to reveal three
// inputs + Save / Cancel. Saves via PATCH /api/quotes/:id (partial).
import { useEffect, useState } from 'react';
import { Pencil, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Quote } from '@/lib/api';
import { updateQuoteCustomer } from '@/lib/api';

interface Props {
  quote: Quote;
  onSaved?: (q: Quote) => void;
}

export default function QuoteCustomerEditor({ quote, onSaved }: Props) {
  const initialName  = quote.customer_name  || quote.customerName  || '';
  const initialEmail = quote.customer_email || quote.customerEmail || '';
  const initialPhone = quote.customer_phone || quote.customerPhone || '';

  const [editing, setEditing] = useState(false);
  const [name,  setName]  = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState(initialPhone);
  const [busy,  setBusy]  = useState(false);

  useEffect(() => {
    // Keep in sync if a different quote gets loaded into the drawer.
    setName(initialName); setEmail(initialEmail); setPhone(initialPhone);
    setEditing(false);
  }, [quote.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setBusy(true);
    try {
      const updated = await updateQuoteCustomer(String(quote.id), {
        customer_name:  name.trim(),
        customer_email: email.trim(),
        customer_phone: phone.trim(),
      });
      toast.success('Customer updated');
      setEditing(false);
      onSaved?.(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const cancel = () => {
    setName(initialName); setEmail(initialEmail); setPhone(initialPhone);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold text-gray-500 uppercase">Customer</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-gray-400 hover:text-gray-900 inline-flex items-center gap-0.5"
            title="Edit customer details"
          >
            <Pencil className="w-3 h-3" /> Edit
          </button>
        </div>
        <p className="font-semibold text-gray-900">{initialName || <span className="text-gray-400">Unnamed</span>}</p>
        {initialEmail
          ? <a href={`mailto:${initialEmail}`} className="text-sm text-blue-600 block">{initialEmail}</a>
          : <p className="text-sm text-gray-400">No email</p>}
        {initialPhone
          ? <a href={`tel:${initialPhone}`} className="text-sm text-blue-600 block">{initialPhone}</a>
          : null}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Customer</p>
      <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
        <input
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
        />
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
        />
        <input
          type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone (optional)"
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button type="button" onClick={cancel} disabled={busy}
            className="text-xs text-gray-500 hover:text-gray-900 inline-flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
          <button type="button" onClick={save} disabled={busy || !email}
            className="text-xs font-semibold text-white bg-gray-900 hover:bg-black rounded-md px-3 py-1.5 inline-flex items-center gap-1 disabled:opacity-50">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
