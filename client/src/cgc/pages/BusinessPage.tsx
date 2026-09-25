import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { toast } from 'sonner';
import { Building2, Check, CheckCircle2, Loader2, Upload } from 'lucide-react';

// Business & bulk gifting inquiry — lands on the shared Sales Prospects
// board via /api/cgc/business-inquiry. Covers the holiday "Gifts for
// Teams & Clients" ask: quantity, budget per gift, requested delivery
// date, and a logo upload (same public upload endpoint the PDPs use).
export default function BusinessPage() {
  const [params] = useSearchParams();
  const [form, setForm] = useState(() => {
    // /holiday-cards hands off the chosen card template via query params
    // so the inquiry arrives already naming the design.
    const design = params.get('design');
    const needs = params.get('interest') === 'holiday-cards' && design
      ? `Holiday card order — design: ${params.get('name') || design} (${design})`
      : '';
    return {
      business_name: '', contact_name: '', email: '', phone: '',
      business_type: '', quantity: '', budget_per_gift: '', delivery_date: '',
      logo_url: '', needs,
    };
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sent, setSent] = useState(false);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, filename: `cgc-biz-logo-${file.name}` }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Upload failed');
      setForm((f) => ({ ...f, logo_url: body.url }));
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.business_name.trim() || !form.email.trim()) {
      toast.error('Business name and email are required');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/cgc/business-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || 'Something went wrong');
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full rounded-lg border border-cgc-cream-deep px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-cgc-orange';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      <Helmet><title>Business Gifting — Custom Gift Club</title></Helmet>

      <div className="rounded-2xl bg-cgc-ink text-white px-6 sm:px-10 py-10 mb-8">
        <Building2 className="h-8 w-8 text-cgc-orange" aria-hidden />
        <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">
          Your brand. <span className="text-cgc-orange">Their new favorite.</span>
        </h1>
        <p className="mt-3 text-white/80 max-w-xl">
          Custom gifts and recognition for your team, clients, and community —
          engraved drinkware, awards, leatherette, and more, branded and
          delivered in bulk. Tell us what you’re planning and we’ll follow up
          with options and pricing.
        </p>
      </div>

      {sent ? (
        <div className="text-center py-10">
          <CheckCircle2 className="h-12 w-12 mx-auto text-cgc-orange" aria-hidden />
          <h2 className="mt-4 text-2xl font-extrabold text-cgc-ink">Got it — we’ll be in touch.</h2>
          <p className="mt-2 text-cgc-stone">Expect a reply within one business day.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="bz-name" className="block text-sm font-semibold text-cgc-ink mb-1">Business name *</label>
            <input id="bz-name" required className={input} value={form.business_name} onChange={set('business_name')} />
          </div>
          <div>
            <label htmlFor="bz-contact" className="block text-sm font-semibold text-cgc-ink mb-1">Contact name</label>
            <input id="bz-contact" className={input} value={form.contact_name} onChange={set('contact_name')} />
          </div>
          <div>
            <label htmlFor="bz-email" className="block text-sm font-semibold text-cgc-ink mb-1">Email *</label>
            <input id="bz-email" type="email" required className={input} value={form.email} onChange={set('email')} />
          </div>
          <div>
            <label htmlFor="bz-phone" className="block text-sm font-semibold text-cgc-ink mb-1">Phone</label>
            <input id="bz-phone" type="tel" className={input} value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label htmlFor="bz-type" className="block text-sm font-semibold text-cgc-ink mb-1">Type of organization</label>
            <input id="bz-type" className={input} placeholder="Company, school, church, team…" value={form.business_type} onChange={set('business_type')} />
          </div>
          <div>
            <label htmlFor="bz-qty" className="block text-sm font-semibold text-cgc-ink mb-1">Approximate quantity</label>
            <input id="bz-qty" className={input} placeholder="e.g. 50 tumblers" value={form.quantity} onChange={set('quantity')} />
          </div>
          <div>
            <label htmlFor="bz-budget" className="block text-sm font-semibold text-cgc-ink mb-1">Budget per gift</label>
            <input id="bz-budget" className={input} placeholder="e.g. $25–$40" value={form.budget_per_gift} onChange={set('budget_per_gift')} />
          </div>
          <div>
            <label htmlFor="bz-date" className="block text-sm font-semibold text-cgc-ink mb-1">Requested delivery date</label>
            <input id="bz-date" type="date" className={input} value={form.delivery_date} onChange={set('delivery_date')} />
          </div>
          <div>
            <span className="block text-sm font-semibold text-cgc-ink mb-1">Logo (optional)</span>
            <label className="inline-flex items-center gap-2 rounded-lg border border-cgc-cream-deep px-4 py-2.5 text-sm font-semibold text-cgc-charcoal cursor-pointer hover:bg-cgc-cream">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {form.logo_url ? 'Replace logo' : 'Upload logo'}
              <input type="file" accept="image/*" className="sr-only"
                onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            </label>
            {form.logo_url && (
              <span className="ml-3 inline-flex items-center gap-1 text-sm text-green-700">
                <Check className="h-4 w-4" aria-hidden /> Logo attached
              </span>
            )}
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="bz-needs" className="block text-sm font-semibold text-cgc-ink mb-1">What are you planning?</label>
            <textarea id="bz-needs" rows={4} className={input}
              placeholder="Employee recognition, client gifts, event awards…"
              value={form.needs} onChange={set('needs')} />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-8 py-3.5 transition-colors disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Send Inquiry
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
