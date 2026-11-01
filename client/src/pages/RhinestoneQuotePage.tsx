import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

type Selection = { sizeKey: string; garmentKey: string; quantity: number; numLocations: number; rush: boolean };
type Price = { total: number; effectivePerPiece: number; stoneCount: number; garmentName: string; quantity: number };
const sizes: Record<string, string> = { accent: 'Name or monogram (~4in)', standard: 'Standard chest (~8in)', full: 'Full front (~11in)', allover: 'Big & bold (~14in)' };
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export default function RhinestoneQuotePage() {
  const location = useLocation();
  const [selection] = useState<Selection | null>(() => {
    try {
      const value = location.state?.rhinestone || JSON.parse(sessionStorage.getItem('tsb_rhinestone_selection') || 'null');
      return value && sizes[value.sizeKey] && ['transfer', 'tee', 'tank', 'perf', 'hoodie'].includes(value.garmentKey)
        && Number.isInteger(value.quantity) && value.quantity >= 1 && value.quantity <= 250
        && [1, 2].includes(value.numLocations) ? value : null;
    } catch { return null; }
  });
  const [contact, setContact] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('tsb_contact_draft') || 'null') || { name: '', email: '', phone: '' }; }
    catch { return { name: '', email: '', phone: '' }; }
  });
  const [price, setPrice] = useState<Price | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ id: number; total: number } | null>(null);
  const [notes, setNotes] = useState('');
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    fetch('/api/rhinestone/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection) })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Unable to load your estimate'); return data; })
      .then(data => { if (!cancelled) setPrice(data); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [selection]);
  useEffect(() => {
    try { sessionStorage.setItem('tsb_contact_draft', JSON.stringify(contact)); } catch { /* storage unavailable */ }
  }, [contact]);
  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) return;
    let live = true;
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null).then(me => {
        if (live && me) setContact((c: typeof contact) => ({ name: c.name || me.name || '', email: c.email || me.email || '', phone: c.phone || me.phone || '' }));
      }).catch(() => {});
    return () => { live = false; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || saved || !price) return;
    if (contact.phone.replace(/\D/g, '').length < 10 || contact.phone.replace(/\D/g, '').length > 15) { setError('Please enter a valid phone number.'); return; }
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/quote/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        items: [{ kind: 'rhinestone', selection }], customer_name: contact.name.trim(), customer_email: contact.email.trim(), customer_phone: contact.phone.trim(),
        notes: `Rhinestone calculator request. ${sizes[selection!.sizeKey]}; ${price.stoneCount} estimated stones per placement; ${selection!.numLocations} placement(s); ${selection!.rush ? 'rush requested' : 'standard timing'}. ${notes.trim()}`, lang: 'en',
      }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Could not save your quote. Please try again.');
      setSaved({ id: data.id, total: data.total });
      try { sessionStorage.removeItem('tsb_rhinestone_selection'); } catch { /* quote is already saved */ }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your quote.'); }
    finally { setBusy(false); }
  }
  const fieldClass = 'mt-2 w-full rounded-lg border border-slate-300 p-3 text-base focus:border-orange-500 focus:outline-orange-500';
  return <Layout><Seo title="Complete Your Rhinestone Quote · T-Shirt Brothers" description="Confirm your rhinestone apparel estimate and save your quote." path="/quote/rhinestone" />
    <section className="bg-orange-50/50 px-5 py-12 md:py-20"><div className="mx-auto max-w-5xl">
      {saved ? <div className="rounded-2xl bg-white p-8 shadow-sm" role="status"><p className="text-sm font-bold uppercase tracking-widest text-orange-600">Quote #{saved.id}</p><h1 className="mt-3 text-3xl font-bold">Your rhinestone quote is saved.</h1><p className="mt-5">Estimated total: <strong>{money(saved.total)}</strong></p><p className="mt-4 leading-relaxed text-slate-600">Your selections and contact information are with T-Shirt Brothers. We'll review your artwork and confirm the final stone count, garment details and price before production.</p><Link to="/bling" className="mt-6 inline-block font-bold text-orange-700 underline">Back to the Rhinestone Studio</Link></div>
      : !selection ? <div className="rounded-2xl bg-white p-8"><h1 className="text-3xl font-bold">Start with your rhinestone estimate</h1><p className="my-5">Choose your design size, garment and quantity in the calculator first.</p><Link to="/bling#price" className="font-bold text-orange-700 underline">Open rhinestone calculator</Link></div>
      : <div className="grid gap-8 md:grid-cols-2"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-700">Your rhinestone quote</p><h1 className="mt-4 text-4xl font-bold tracking-tight">Where should we send it?</h1><p className="mt-4 text-slate-600">Your project details are already filled in. Just add your contact information to save your quote.</p><div className="mt-7 rounded-2xl bg-slate-950 p-7 text-white"><p className="text-lg font-bold">{price?.garmentName || 'Rhinestone apparel'}</p><ul className="mt-4 space-y-2 text-sm text-slate-300"><li>{sizes[selection.sizeKey]}</li><li>{selection.quantity} pieces</li><li>{price ? `${price.stoneCount.toLocaleString()} estimated stones per placement` : 'Loading estimate…'}</li><li>{selection.numLocations === 2 ? 'Front + back · 2 placements' : 'One placement'}</li><li>{selection.rush ? 'Rush requested' : 'Standard timing'}</li></ul>{price && <><p className="mt-6 text-4xl font-bold">{money(price.total)}</p><p className="mt-2 text-sm text-slate-300">{money(price.effectivePerPiece)} each · estimated total</p></>}<p className="mt-5 text-xs leading-relaxed text-slate-400">Final stone count and garment details are confirmed after artwork review.</p></div><Link to="/bling#price" className="mt-5 inline-block text-sm font-semibold text-orange-700 underline">Edit calculator selections</Link></div>
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-orange-100 bg-white p-6 md:p-8"><h2 className="text-2xl font-bold">Customer information</h2>{(['name', 'phone', 'email'] as const).map(key => <label key={key} className="block text-sm font-semibold">{key === 'name' ? 'Full name' : key === 'phone' ? 'Phone number' : 'Email address'}<input required type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} autoComplete={key === 'phone' ? 'tel' : key} minLength={key === 'name' ? 2 : undefined} value={contact[key]} onChange={e => setContact({ ...contact, [key]: e.target.value })} className={fieldClass} /></label>)}<label className="block text-sm font-semibold">Project notes (optional)<textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Garment color, sizes, event date or artwork details" className={fieldClass} rows={3} maxLength={3000} /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy || !price} className="w-full rounded-lg bg-orange-500 px-6 py-4 font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-50">{busy ? 'Saving your quote…' : 'Save my rhinestone quote'}</button><p className="text-xs leading-relaxed text-slate-500">Saves your estimate in the T-Shirt Brothers quotation system. No payment is collected here.</p></form>
      </div>}
    </div></section>
  </Layout>;
}
