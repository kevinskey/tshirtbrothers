// Easy Quote — mobile-first card wizard replacing the dense instant-quote
// form at /quote (the classic form lives on at /quote/classic). One
// question per card, big touch targets, priced by the same server engine
// (/api/quote/calculate|save|lock-in) as the classic calculator.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '@/components/Seo';
import {
  ArrowLeft, ArrowRight, Check, Loader2, AlertTriangle, Mail, CreditCard,
  CalendarDays, Sparkles,
} from 'lucide-react';

/* ── Static data ──────────────────────────────────────────────────────── */

// key → pricing-table garment name (null = no instant price; goes to the
// quote as a custom line the shop prices after review).
const PRODUCT_TYPES = [
  { key: 'tshirt',     label: 'T-Shirt',    emoji: '👕', pricing: 'T-shirt' },
  { key: 'sweatshirt', label: 'Sweatshirt', emoji: '🧶', pricing: 'Sweatshirt' },
  { key: 'hoodie',     label: 'Hoodie',     emoji: '🧥', pricing: 'Hoodie' },
  { key: 'tank',       label: 'Tank',       emoji: '🎽', pricing: 'Tank' },
  { key: 'jacket',     label: 'Jacket',     emoji: '🧷', pricing: null },
  { key: 'cap',        label: 'Cap',        emoji: '🧢', pricing: 'Hat' },
  { key: 'dtf',        label: 'DTF Prints', emoji: '🎞️', pricing: null },
  { key: 'other',      label: 'Other',      emoji: '✨', pricing: null },
] as const;
type ProductKey = typeof PRODUCT_TYPES[number]['key'];

const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

// Standard Gildan shade card (name + close hex).
const GILDAN_COLORS = [
  ['Black', '#1a1a1a'], ['White', '#f7f7f5'], ['Navy', '#1f2a44'], ['Sport Grey', '#9ea1a3'],
  ['Dark Heather', '#4b4f54'], ['Charcoal', '#3b3b3d'], ['Red', '#c8102e'], ['Cardinal', '#8a1538'],
  ['Maroon', '#5b2b38'], ['Royal', '#1f4ed8'], ['Carolina Blue', '#7ba4db'], ['Light Blue', '#a3c1e0'],
  ['Indigo Blue', '#4a6c8c'], ['Purple', '#4d2c8c'], ['Forest', '#1e4030'], ['Irish Green', '#00a94f'],
  ['Kelly', '#009a49'], ['Military Green', '#5e6737'], ['Orange', '#f96302'], ['Gold', '#ffb612'],
  ['Daisy', '#ffd54d'], ['Sand', '#d6cdb8'], ['Natural', '#e8e2d2'], ['Ash', '#c9cbca'],
  ['Heliconia', '#e0407b'], ['Light Pink', '#f2c4d0'],
] as const;

const QUALITY_TIERS = [
  { tier: 'Standard', label: 'Standard',           dollars: '$',   blurb: 'Gildan Heavy Cotton — the team-order workhorse.' },
  { tier: 'Premium',  label: 'Mid-Level · Softer', dollars: '$$',  blurb: 'Next Level — soft ringspun retail fit people keep wearing.' },
  { tier: 'Ultra',    label: 'Premium',            dollars: '$$$', blurb: 'Comfort Colors — garment-dyed, top-shelf feel. The good-good.' },
] as const;

const ORANGE = '#f97316';

type Settings = {
  rush_surcharge_pct: number;
  standard_turnaround: number;
  rush_turnaround: number;
};

type CalcLine = {
  key: ProductKey;
  label: string;
  quantity: number;
  per_shirt: number;
  total: number;
  rush_surcharge: number;
};

const STEPS = ['name', 'phone', 'email', 'products', 'qty', 'color', 'quality', 'date', 'art', 'quote'] as const;
type Step = typeof STEPS[number];

export default function EasyQuotePage() {
  const [step, setStep] = useState<Step>('name');
  const [settings, setSettings] = useState<Settings | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [picked, setPicked] = useState<ProductKey[]>([]);
  const [otherAcked, setOtherAcked] = useState(false);
  const [otherText, setOtherText] = useState('');
  // qty[productKey][size] = string; custom types use the single '_qty' key
  const [qty, setQty] = useState<Record<string, Record<string, string>>>({});
  const [color, setColor] = useState('');
  const [quality, setQuality] = useState<typeof QUALITY_TIERS[number]['tier'] | ''>('');
  const [needBy, setNeedBy] = useState('');
  const [artUrls, setArtUrls] = useState<string[]>([]);
  const [artUploading, setArtUploading] = useState(0);
  const artInputRef = useRef<HTMLInputElement | null>(null);

  const [calcLines, setCalcLines] = useState<CalcLine[] | null>(null);
  const [calcBusy, setCalcBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState<'draft' | 'deposit' | null>(null);
  const [draftDone, setDraftDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch('/api/quote/options')
      .then((r) => r.json())
      .then((d) => setSettings(d.settings))
      .catch(() => setSettings({ rush_surcharge_pct: 25, standard_turnaround: 7, rush_turnaround: 3 }));
  }, []);

  const stepIdx = STEPS.indexOf(step);
  const go = (dir: 1 | -1) => {
    setError(null);
    setStep(STEPS[Math.min(STEPS.length - 1, Math.max(0, stepIdx + dir))]!);
    cardRef.current?.scrollTo?.({ top: 0 });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pickedTypes = PRODUCT_TYPES.filter((p) => picked.includes(p.key));
  const pricedTypes = pickedTypes.filter((p) => p.pricing);
  const customTypes = pickedTypes.filter((p) => !p.pricing);

  const typeQty = (key: string) => {
    const m = qty[key] ?? {};
    return Object.values(m).reduce((s, v) => s + (parseInt(v, 10) || 0), 0);
  };
  const totalQty = pickedTypes.reduce((s, p) => s + typeQty(p.key), 0);

  // Days EARLIER than standard turnaround the customer needs it — each
  // day adds the per-day rush percentage on the server.
  const rushDays = useMemo(() => {
    if (!needBy || !settings) return 0;
    const days = Math.ceil((new Date(`${needBy}T12:00:00`).getTime() - Date.now()) / 86_400_000);
    return Math.max(0, settings.standard_turnaround - days);
  }, [needBy, settings]);
  const isRush = rushDays > 0;

  /* Live pricing when the quote card opens. */
  useEffect(() => {
    if (step !== 'quote') return;
    let cancelled = false;
    (async () => {
      setCalcBusy(true);
      setCalcLines(null);
      try {
        const lines: CalcLine[] = [];
        for (const p of pricedTypes) {
          const sizes = SIZES
            .map((s) => ({ size: s, quantity: parseInt(qty[p.key]?.[s] ?? '0', 10) || 0 }))
            .filter((s) => s.quantity > 0);
          if (sizes.length === 0) continue;
          const res = await fetch('/api/quote/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              garmentName: p.pricing,
              qualityTier: quality || 'Standard',
              methodName: 'DTF',
              numLocations: 1,
              colorsPerLocation: 1,
              rush: isRush,
              rushDays,
              sizes,
              // Pool the whole order for the quantity-tier discount.
              discountQuantity: pricedTypes.reduce((s, t) => s + typeQty(t.key), 0),
            }),
          });
          if (!res.ok) throw new Error(`Pricing failed for ${p.label}`);
          const d = await res.json();
          lines.push({
            key: p.key, label: p.label,
            quantity: d.quantity, per_shirt: d.per_shirt, total: d.total,
            rush_surcharge: d.breakdown?.rush_surcharge ?? 0,
          });
        }
        if (!cancelled) setCalcLines(lines);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setCalcBusy(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const pricedTotal = (calcLines ?? []).reduce((s, l) => s + l.total, 0);
  const rushTotal = (calcLines ?? []).reduce((s, l) => s + l.rush_surcharge, 0);

  const uploadArt = (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      setArtUploading((n) => n + 1);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch('/api/quotes/upload-design', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: reader.result,
              filename: file.name || 'easy-quote-art.png',
              customerEmail: email.trim() || 'easy-quote',
            }),
          });
          const d = await res.json();
          if (res.ok && d.url) setArtUrls((prev) => [...prev, d.url]);
          else setError(d.error || 'Upload failed — try a PNG or JPG');
        } catch {
          setError('Upload failed — check your connection and try again');
        } finally {
          setArtUploading((n) => n - 1);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const buildItems = () => {
    const items: unknown[] = [];
    for (const p of pricedTypes) {
      const sizes = SIZES
        .map((s) => ({ size: s, quantity: parseInt(qty[p.key]?.[s] ?? '0', 10) || 0 }))
        .filter((s) => s.quantity > 0);
      if (sizes.length === 0) continue;
      items.push({
        inputs: {
          garmentName: p.pricing,
          qualityTier: quality || 'Standard',
          methodName: 'DTF',
          numLocations: 1,
          colorsPerLocation: 1,
          rush: isRush,
          rushDays,
          sizes,
        },
      });
    }
    for (const p of customTypes) {
      const q = typeQty(p.key) || 1;
      const description = p.key === 'other'
        ? `Other: ${otherText.trim() || 'customer to describe'}`
        : p.key === 'dtf'
          ? 'DTF transfer prints (priced by sheet — shop will size and quote)'
          : `${p.label} (no instant pricing — shop to quote)`;
      items.push({ kind: 'custom', custom: { description, quantity: q, notes: null } });
    }
    // Uploaded art rides on the first item: first file as the design,
    // the rest as extras (matches /save's design_url contract).
    if (items.length > 0 && artUrls.length > 0) {
      const first = items[0] as Record<string, unknown>;
      first.design_url = artUrls[0];
      if (artUrls.length > 1) first.extra_design_urls = artUrls.slice(1);
    }
    return items;
  };

  const submit = async (mode: 'draft' | 'deposit') => {
    setSubmitBusy(mode);
    setError(null);
    try {
      const notes = [
        `Easy Quote wizard`, color && `Color: ${color}`,
        quality && `Quality: ${QUALITY_TIERS.find((t) => t.tier === quality)?.label}`,
        needBy && `Need by: ${needBy}${isRush ? ' (RUSH)' : ''}`,
      ].filter(Boolean).join(' · ');
      const res = await fetch('/api/quote/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: buildItems(),
          customer_name: name.trim(),
          customer_email: email.trim(),
          customer_phone: phone.trim(),
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (mode === 'draft') {
        setDraftDone(data.id);
        return;
      }
      const li = await fetch('/api/quote/lock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: data.id }),
      });
      const liData = await li.json();
      if (!li.ok || !liData.url) throw new Error(liData.error || 'Could not start deposit checkout');
      window.location.href = liData.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitBusy(null);
    }
  };

  /* ── validation per card ─────────────────────────────────────────────── */
  const canNext: boolean = (() => {
    switch (step) {
      case 'name': return name.trim().length >= 2;
      case 'phone': return phone.replace(/\D/g, '').length >= 10;
      case 'email': return /.+@.+\..+/.test(email);
      case 'products':
        return picked.length > 0
          && (!picked.includes('other') || (otherAcked && otherText.trim().length > 0));
      case 'qty': return totalQty > 0;
      case 'color': return !!color;
      case 'quality': return !!quality;
      case 'date': return !!needBy;
      case 'art': return artUploading === 0; // optional — just wait for uploads
      default: return false;
    }
  })();

  const progressPct = Math.round((stepIdx / (STEPS.length - 1)) * 100);

  /* ── Draft-saved terminal screen ─────────────────────────────────────── */
  if (draftDone != null) {
    return (
      <Shell>
        <div className="text-center py-10">
          <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ background: '#dcfce7' }}>
            <Mail className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="tsb-font-display text-3xl font-black mt-5">Quote saved &amp; emailed!</h1>
          <p className="mt-3 text-gray-600">
            Quote <span className="font-mono font-semibold">#{draftDone}</span> is in your inbox at{' '}
            <span className="font-semibold">{email}</span>. We&apos;ll confirm final pricing and reach out.
          </p>
          <Link to="/" className="inline-block mt-8 px-6 py-3 rounded-full text-white font-bold" style={{ background: ORANGE }}>
            Back to TShirt Brothers
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Seo title="Easy Quote · TShirt Brothers" description="Get a custom printing quote in under a minute." path="/quote" />
      {/* progress */}
      <div className="flex items-center gap-3 mb-6">
        {stepIdx > 0 ? (
          <button type="button" onClick={() => go(-1)} aria-label="Back"
            className="p-2 -ml-2 rounded-full hover:bg-black/5">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
        ) : (
          <Link to="/" aria-label="Home" className="p-2 -ml-2 rounded-full hover:bg-black/5">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
        )}
        <div className="flex-1 h-2 rounded-full bg-black/10 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progressPct}%`, background: ORANGE }} />
        </div>
        <span className="text-xs font-semibold text-gray-500">{stepIdx + 1}/{STEPS.length}</span>
      </div>

      <div ref={cardRef} key={step} className="animate-[eq-in_.35s_ease]" style={{ minHeight: 320 }}>
        {step === 'name' && (
          <Card title="Hi! 👋 What's your name?">
            <BigInput autoFocus value={name} onChange={setName} placeholder="Your name"
              onEnter={() => canNext && go(1)} />
          </Card>
        )}

        {step === 'phone' && (
          <Card title={`Nice to meet you, ${name.trim().split(' ')[0] || 'friend'}! What's your phone number?`}>
            <BigInput autoFocus type="tel" value={phone} onChange={setPhone} placeholder="(555) 555-5555"
              onEnter={() => canNext && go(1)} />
          </Card>
        )}

        {step === 'email' && (
          <Card title="And your email?" sub="Your quote lands here.">
            <BigInput autoFocus type="email" value={email} onChange={setEmail} placeholder="you@email.com"
              onEnter={() => canNext && go(1)} />
          </Card>
        )}

        {step === 'products' && (
          <Card title="What do you want printed?" sub="Pick everything that applies.">
            <div className="grid grid-cols-2 gap-3">
              {PRODUCT_TYPES.map((p) => {
                const on = picked.includes(p.key);
                return (
                  <button key={p.key} type="button"
                    onClick={() => {
                      setPicked((prev) => on ? prev.filter((k) => k !== p.key) : [...prev, p.key]);
                      if (p.key === 'other' && on) { setOtherAcked(false); setOtherText(''); }
                    }}
                    className={`rounded-2xl border-2 px-3 py-4 text-left transition-all ${
                      on ? 'text-white shadow-lg scale-[1.02]' : 'bg-white border-gray-200 hover:border-gray-400'
                    }`}
                    style={on ? { background: ORANGE, borderColor: ORANGE } : undefined}
                  >
                    <span className="text-2xl">{p.emoji}</span>
                    <span className="block mt-1 font-bold">{p.label}</span>
                    {on && <Check className="w-4 h-4 mt-1" />}
                  </button>
                );
              })}
            </div>

            {picked.includes('dtf') && (
              <Note>DTF transfer prints are priced by the sheet — we&apos;ll size your art and quote that part after review. Want it now? Try the <Link to="/dtf/builder" className="underline font-semibold">gang sheet builder</Link>.</Note>
            )}
            {picked.includes('jacket') && (
              <Note>Jackets vary a lot, so that line gets priced by the shop after review — the rest of your quote is still instant.</Note>
            )}
            {picked.includes('other') && !otherAcked && (
              <div className="mt-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
                <p className="flex items-start gap-2 text-sm text-amber-900">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                  Items outside our standard list can&apos;t get an instant price — we&apos;ll review your request and follow up with a custom quote.
                </p>
                <button type="button" onClick={() => setOtherAcked(true)}
                  className="mt-3 px-4 py-2 rounded-full bg-amber-600 text-white text-sm font-bold">
                  Got it — let me describe it
                </button>
              </div>
            )}
            {picked.includes('other') && otherAcked && (
              <div className="mt-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">What are you looking for?</label>
                <input value={otherText} onChange={(e) => setOtherText(e.target.value)}
                  placeholder="e.g. aprons with our logo"
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base focus:border-gray-900 focus:outline-none" />
              </div>
            )}
          </Card>
        )}

        {step === 'qty' && (
          <Card title="How many?" sub="Quantities per size — skip sizes you don't need.">
            <div className="space-y-6">
              {pricedTypes.map((p) => (
                <div key={p.key}>
                  <p className="font-bold mb-2">{p.emoji} {p.label}
                    <span className="ml-2 text-xs font-semibold text-gray-400">{typeQty(p.key)} pcs</span>
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {SIZES.map((s) => (
                      <label key={s} className="rounded-xl border border-gray-200 bg-white px-2 py-1.5 text-center">
                        <span className="block text-[11px] font-bold text-gray-500">{s}</span>
                        <input inputMode="numeric" pattern="[0-9]*" placeholder="0"
                          value={qty[p.key]?.[s] ?? ''}
                          onChange={(e) => setQty((prev) => ({
                            ...prev,
                            [p.key]: { ...(prev[p.key] ?? {}), [s]: e.target.value.replace(/\D/g, '') },
                          }))}
                          className="w-full text-center text-base font-semibold focus:outline-none" />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {customTypes.map((p) => (
                <div key={p.key}>
                  <p className="font-bold mb-2">{p.emoji} {p.key === 'other' ? (otherText.trim() || 'Other') : p.label}
                    <span className="ml-2 text-[11px] font-semibold text-amber-600">priced after review</span>
                  </p>
                  <input inputMode="numeric" pattern="[0-9]*" placeholder="How many?"
                    value={qty[p.key]?.['_qty'] ?? ''}
                    onChange={(e) => setQty((prev) => ({
                      ...prev, [p.key]: { _qty: e.target.value.replace(/\D/g, '') },
                    }))}
                    className="w-40 rounded-xl border-2 border-gray-200 px-4 py-2.5 text-base font-semibold focus:border-gray-900 focus:outline-none" />
                </div>
              ))}
            </div>
          </Card>
        )}

        {step === 'color' && (
          <Card title="What color?" sub="Standard Gildan shade card — more colors available on request.">
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
              {GILDAN_COLORS.map(([n, hex]) => {
                const on = color === n;
                return (
                  <button key={n} type="button" onClick={() => setColor(n)} title={n}
                    className={`rounded-2xl p-1 transition-transform ${on ? 'scale-110' : 'hover:scale-105'}`}
                    style={{ outline: on ? `3px solid ${ORANGE}` : '1px solid rgba(0,0,0,0.12)', outlineOffset: 2 }}
                  >
                    <span className="block aspect-square rounded-xl" style={{ background: hex }} />
                    <span className="block mt-1 text-[10px] font-semibold text-gray-600 leading-tight">{n}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {step === 'quality' && (
          <Card title="What quality level?">
            <div className="space-y-3">
              {QUALITY_TIERS.map((t) => {
                const on = quality === t.tier;
                return (
                  <button key={t.tier} type="button" onClick={() => setQuality(t.tier)}
                    className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                      on ? 'text-white shadow-lg' : 'bg-white border-gray-200 hover:border-gray-400'
                    }`}
                    style={on ? { background: ORANGE, borderColor: ORANGE } : undefined}
                  >
                    <span className="flex items-baseline justify-between">
                      <span className="font-bold text-lg">{t.label}</span>
                      <span className={`font-black ${on ? '' : 'text-gray-400'}`}>{t.dollars}</span>
                    </span>
                    <span className={`block mt-1 text-sm ${on ? 'text-white/85' : 'text-gray-500'}`}>{t.blurb}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {step === 'date' && (
          <Card title="When do you need it?" sub="Pick your in-hands date.">
            <label className="flex items-center gap-3 rounded-2xl border-2 border-gray-200 bg-white px-4 py-4 focus-within:border-gray-900">
              <CalendarDays className="w-6 h-6 text-gray-400" />
              <input type="date" required value={needBy}
                min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                onChange={(e) => setNeedBy(e.target.value)}
                className="flex-1 text-lg font-semibold bg-transparent focus:outline-none" />
            </label>
            {settings && needBy && (
              isRush ? (
                <Note tone="amber">
                  ⚡ That&apos;s <strong>{rushDays} {rushDays === 1 ? 'day' : 'days'} sooner</strong> than our
                  standard {settings.standard_turnaround}-day turnaround — a{' '}
                  <strong>{settings.rush_surcharge_pct}% per-day rush fee</strong> ({rushDays} × {settings.rush_surcharge_pct}% ={' '}
                  {rushDays * settings.rush_surcharge_pct}%) applies and we&apos;ll move fast.
                </Note>
              ) : (
                <Note tone="green">✓ Plenty of time — standard turnaround, no rush fee.</Note>
              )
            )}
          </Card>
        )}

        {step === 'art' && (
          <Card title="Got art? 🎨" sub="Upload your logo or design — or skip and send it later.">
            <button type="button" onClick={() => artInputRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-gray-300 bg-white px-4 py-10 text-center hover:border-gray-500 transition-colors">
              <p className="text-3xl">📂</p>
              <p className="mt-2 font-bold">Tap to upload</p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG — as many files as you need</p>
            </button>
            <input ref={artInputRef} type="file" accept=".png,.jpg,.jpeg,.webp" multiple className="hidden"
              onChange={(e) => { uploadArt(e.target.files); e.target.value = ''; }} />
            {(artUrls.length > 0 || artUploading > 0) && (
              <div className="mt-4 grid grid-cols-4 gap-2">
                {artUrls.map((u) => (
                  <div key={u} className="relative rounded-xl border border-gray-200 bg-white overflow-hidden aspect-square">
                    <img src={u} alt="" className="w-full h-full object-contain" />
                    <button type="button" aria-label="Remove"
                      onClick={() => setArtUrls((prev) => prev.filter((x) => x !== u))}
                      className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] leading-5">✕</button>
                  </div>
                ))}
                {Array.from({ length: artUploading }).map((_, i) => (
                  <div key={`up-${i}`} className="rounded-xl border border-gray-200 bg-gray-50 aspect-square flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {step === 'quote' && (
          <Card title="Your quote 🎉" sub="Standard pricing — final numbers confirmed by the shop.">
            {calcBusy && (
              <div className="py-10 text-center"><Loader2 className="w-7 h-7 animate-spin text-gray-400 mx-auto" /></div>
            )}
            {!calcBusy && calcLines && (
              <>
                <div className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white overflow-hidden">
                  {calcLines.map((l) => (
                    <div key={l.key} className="px-4 py-3 flex items-baseline justify-between gap-3">
                      <div>
                        <p className="font-semibold">{l.label} × {l.quantity}</p>
                        <p className="text-xs text-gray-500">${l.per_shirt.toFixed(2)} each · {color} · {QUALITY_TIERS.find((t) => t.tier === quality)?.label}</p>
                      </div>
                      <p className="font-bold shrink-0">${l.total.toFixed(2)}</p>
                    </div>
                  ))}
                  {customTypes.map((p) => (
                    <div key={p.key} className="px-4 py-3 flex items-baseline justify-between gap-3">
                      <div>
                        <p className="font-semibold">{p.key === 'other' ? (otherText.trim() || 'Other') : p.label} × {typeQty(p.key) || 1}</p>
                        <p className="text-xs text-amber-600 font-semibold">priced by the shop after review</p>
                      </div>
                      <p className="font-bold text-gray-400 shrink-0">TBD</p>
                    </div>
                  ))}
                  <div className="px-4 py-3 bg-gray-50">
                    {isRush && rushTotal > 0 && (
                      <p className="text-xs text-amber-700 font-semibold mb-1">
                        Includes ${rushTotal.toFixed(2)} rush fee for your {needBy} date
                      </p>
                    )}
                    <p className="flex items-baseline justify-between">
                      <span className="font-bold">Estimated total{customTypes.length > 0 ? ' (instant items)' : ''}</span>
                      <span className="tsb-font-display text-2xl font-black">${pricedTotal.toFixed(2)}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  <button type="button" disabled={!!submitBusy}
                    onClick={() => submit('deposit')}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full text-white font-bold text-lg shadow-lg disabled:opacity-60"
                    style={{ background: ORANGE }}>
                    {submitBusy === 'deposit' ? <Loader2 className="w-5 h-5 animate-spin" /> : <CreditCard className="w-5 h-5" />}
                    Accept Quote &amp; Pay Deposit
                  </button>
                  <button type="button" disabled={!!submitBusy}
                    onClick={() => submit('draft')}
                    className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full border-2 border-gray-300 font-bold disabled:opacity-60 hover:border-gray-900">
                    {submitBusy === 'draft' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mail className="w-5 h-5" />}
                    Save Draft (email it to me)
                  </button>
                  <p className="text-center text-xs text-gray-400">
                    Paying the deposit starts your order. <Sparkles className="inline w-3 h-3" /> Prefer the full calculator? <Link to="/quote/classic" className="underline">Classic version</Link>
                  </p>
                </div>
              </>
            )}
          </Card>
        )}
      </div>

      {error && <p className="mt-4 text-sm font-semibold text-red-600 text-center">{error}</p>}

      {step !== 'quote' && (
        <button type="button" disabled={!canNext} onClick={() => go(1)}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-full text-white font-bold text-lg shadow-lg transition-opacity disabled:opacity-40"
          style={{ background: ORANGE }}>
          {step === 'art' && artUrls.length === 0 ? 'Skip for now' : 'Next'} <ArrowRight className="w-5 h-5" />
        </button>
      )}

      <style>{`@keyframes eq-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }`}</style>
    </Shell>
  );
}

/* ── UI bits ──────────────────────────────────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg,#fff7ed 0%,#f7f4ee 100%)' }}>
      <div className="max-w-md mx-auto px-4 py-6 sm:py-10">{children}</div>
    </div>
  );
}

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="tsb-font-display text-2xl sm:text-3xl font-black leading-tight">{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-gray-500">{sub}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

function BigInput({ value, onChange, onEnter, placeholder, type = 'text', autoFocus }: {
  value: string; onChange: (v: string) => void; onEnter?: () => void;
  placeholder?: string; type?: string; autoFocus?: boolean;
}) {
  return (
    <input
      type={type} value={value} autoFocus={autoFocus} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(); }}
      className="w-full rounded-2xl border-2 border-gray-200 bg-white px-5 py-4 text-xl font-semibold focus:border-gray-900 focus:outline-none"
    />
  );
}

function Note({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'amber' | 'green' }) {
  const styles = {
    gray:  'border-gray-200 bg-white text-gray-600',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    green: 'border-green-200 bg-green-50 text-green-800',
  } as const;
  return <p className={`mt-4 rounded-2xl border-2 px-4 py-3 text-sm ${styles[tone]}`}>{children}</p>;
}
