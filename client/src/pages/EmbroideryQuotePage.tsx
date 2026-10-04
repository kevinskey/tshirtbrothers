// Embroidery Quote — the customer path for stitched work (Kevin, 2026-10-03).
//
// Embroidery cannot be instant-quoted the way screen printing can: price is
// driven by STITCH COUNT, and stitch count only exists after the artwork is
// digitized. So this page collects the request (artwork, size, placement,
// garment) and gates on the $25 digitization fee via Stripe Checkout. The
// quote itself is a human reply after digitizing: stitches x rate + garment.
// That economic reality is stated plainly on the page — a customer who
// understands WHY there's a fee pays it; one who hits a surprise charge
// bounces.
import { useRef, useState } from 'react';
import Seo from '@/components/Seo';
import { Loader2, Shirt, Upload, Check, AlertTriangle } from 'lucide-react';

const PLACEMENTS = [
  { key: 'left_chest',  label: 'Left chest',  blurb: 'Classic logo spot — polos, work shirts' },
  { key: 'right_chest', label: 'Right chest', blurb: 'Names, titles, opposite the logo' },
  { key: 'full_back',   label: 'Full back',   blurb: 'Big statement — jackets, work wear' },
  { key: 'hat_front',   label: 'Hat front',   blurb: 'Caps and beanies' },
  { key: 'sleeve',      label: 'Sleeve',      blurb: 'Left or right sleeve accent' },
  { key: 'other',       label: 'Somewhere else', blurb: 'Tell us where below' },
] as const;
type PlacementKey = typeof PLACEMENTS[number]['key'];

export default function EmbroideryQuotePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [desiredSize, setDesiredSize] = useState('');
  const [placement, setPlacement] = useState<PlacementKey | null>(null);
  const [placementNote, setPlacementNote] = useState('');
  const [garmentMode, setGarmentMode] = useState<'tsb' | 'own' | null>(null);
  const [garmentChoice, setGarmentChoice] = useState('');
  const [notes, setNotes] = useState('');
  const [quantity, setQuantity] = useState('1');

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [imageBase64, setImageBase64] = useState('');
  const [preview, setPreview] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { setError('That file is over 20 MB — email it to us instead.'); return; }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      setImageBase64(result);
      setPreview(result);
      setFileName(f.name);
      setError(null);
    };
    reader.readAsDataURL(f);
  };

  const canSubmit =
    name.trim() && /\S+@\S+\.\S+/.test(email) && imageBase64 && desiredSize.trim()
    && placement && (placement !== 'other' || placementNote.trim())
    && garmentMode && (garmentMode !== 'tsb' || garmentChoice.trim())
    && (parseInt(quantity, 10) || 0) >= 1;

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/embroidery/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(), email: email.trim(), phone: phone.trim() || undefined,
          imageBase64, filename: fileName || undefined,
          desiredSize: desiredSize.trim(), placement, placementNote: placementNote.trim() || undefined,
          garmentMode, garmentChoice: garmentChoice.trim() || undefined,
          quantity: parseInt(quantity, 10) || 1,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      // Straight to Stripe — the whole flow hinges on the fee clearing.
      window.location.href = data.checkoutUrl;
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/60';
  const labelCls = 'block text-sm font-semibold text-gray-800 mb-1.5';

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Seo
        path="/embroidery"
        title="Embroidery Quote — T-Shirt Brothers"
        description="Upload your logo for custom embroidery. $25 digitization, then a stitch-count quote on polos, hats, jackets and more."
      />

      <div className="mb-6 text-center">
        <Shirt className="mx-auto mb-2 h-8 w-8" aria-hidden />
        <h1 className="text-2xl font-bold">Embroidery Quote</h1>
        <p className="mt-2 text-sm text-gray-600">
          Embroidery is priced by <strong>stitch count</strong>, and we only know the
          stitch count after your artwork is <strong>digitized</strong> — converted
          into a stitch file a machine can sew. Digitization is a one-time{' '}
          <strong>$25</strong>. Pay it here, we digitize, and your quote lands in
          your inbox: stitching + your garment. The stitch file is yours to keep.
        </p>
      </div>

      <div className="space-y-6">
        {/* Artwork */}
        <section>
          <label className={labelCls}>1. Your artwork</label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 px-4 py-6 text-sm text-gray-600 hover:border-gray-400"
          >
            {preview ? (
              <>
                <img src={preview} alt="Your artwork" className="h-16 w-16 rounded object-contain bg-gray-50" />
                <span className="min-w-0 truncate">{fileName} — tap to change</span>
                <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
              </>
            ) : (
              <>
                <Upload className="h-5 w-5" aria-hidden />
                Upload your logo or design (PNG/JPG, up to 20 MB)
              </>
            )}
          </button>
          <input
            ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </section>

        {/* Size */}
        <section>
          <label htmlFor="emb-size" className={labelCls}>2. How big should it stitch?</label>
          <input
            id="emb-size" type="text" value={desiredSize}
            onChange={(e) => setDesiredSize(e.target.value)}
            placeholder={'e.g. 3.5" wide (typical left chest) or 10" wide (full back)'}
            className={inputCls}
          />
        </section>

        {/* Placement */}
        <section>
          <span className={labelCls}>3. Where does it go?</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PLACEMENTS.map((p) => (
              <button
                key={p.key} type="button" onClick={() => setPlacement(p.key)}
                className={`rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  placement === p.key ? 'border-black bg-black text-white' : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <span className="block font-medium">{p.label}</span>
                <span className={`block text-xs ${placement === p.key ? 'text-gray-300' : 'text-gray-500'}`}>{p.blurb}</span>
              </button>
            ))}
          </div>
          {placement === 'other' && (
            <input
              type="text" value={placementNote} onChange={(e) => setPlacementNote(e.target.value)}
              placeholder="Describe the placement" className={`${inputCls} mt-2`}
            />
          )}
        </section>

        {/* Garment */}
        <section>
          <span className={labelCls}>4. The garment</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button" onClick={() => setGarmentMode('tsb')}
              className={`rounded-lg border px-3 py-3 text-left text-sm ${
                garmentMode === 'tsb' ? 'border-black bg-black text-white' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <span className="block font-medium">Get it from us</span>
              <span className={`block text-xs ${garmentMode === 'tsb' ? 'text-gray-300' : 'text-gray-500'}`}>
                Polos, hats, jackets, hoodies — we&rsquo;ll price it into your quote
              </span>
            </button>
            <button
              type="button" onClick={() => { setGarmentMode('own'); setGarmentChoice(''); }}
              className={`rounded-lg border px-3 py-3 text-left text-sm ${
                garmentMode === 'own' ? 'border-black bg-black text-white' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <span className="block font-medium">I&rsquo;ll bring my own</span>
              <span className={`block text-xs ${garmentMode === 'own' ? 'text-gray-300' : 'text-gray-500'}`}>
                You supply the garment, we stitch it
              </span>
            </button>
          </div>
          {garmentMode === 'tsb' && (
            <input
              type="text" value={garmentChoice} onChange={(e) => setGarmentChoice(e.target.value)}
              placeholder={'What would you like? e.g. "Navy polo, mens L, qty 12"'}
              className={`${inputCls} mt-2`}
            />
          )}
        </section>

        {/* Quantity */}
        <section>
          <label htmlFor="emb-qty" className={labelCls}>5. How many pieces?</label>
          <input
            id="emb-qty" type="number" min={1} max={999} value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={`${inputCls} max-w-[8rem]`}
          />
          <p className="mt-1 text-xs text-gray-500">Pricing drops at 2, 6, 24, 72, 144 and 500 pieces. Over 1,000 — call us.</p>
        </section>

        {/* Contact */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label htmlFor="emb-name" className={labelCls}>Name</label>
            <input id="emb-name" type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoComplete="name" />
          </div>
          <div className="sm:col-span-1">
            <label htmlFor="emb-email" className={labelCls}>Email</label>
            <input id="emb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} autoComplete="email" />
          </div>
          <div className="sm:col-span-1">
            <label htmlFor="emb-phone" className={labelCls}>Phone (optional)</label>
            <input id="emb-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} autoComplete="tel" />
          </div>
        </section>

        <section>
          <label htmlFor="emb-notes" className={labelCls}>Anything else? (optional)</label>
          <textarea
            id="emb-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={2} className={inputCls} placeholder="Thread colors, deadline, quantity…"
          />
        </section>

        {error && (
          <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
          </p>
        )}

        <button
          type="button" onClick={submit} disabled={!canSubmit || submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-black px-6 py-4 text-base font-semibold text-white disabled:opacity-40"
        >
          {submitting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
          {submitting ? 'Heading to checkout…' : 'Pay $25 digitization & get my quote'}
        </button>
        <p className="text-center text-xs text-gray-500">
          Secure checkout by Stripe. After payment we digitize your art and email
          your quote — no stitching happens until you approve it.
        </p>

        {/* The fine print — mirrors our production terms so nobody is
            surprised later. Spoilage language comes with the territory of
            customer-supplied goods. */}
        <div className="rounded-lg bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-500">
          <p><strong>Turnaround:</strong> standard production is 5–7 business days. Rush available — 4 days +25%, 2–3 days +50%, next day +75%, same day +100% (subject to availability).</p>
          <p className="mt-1"><strong>Your own garments:</strong> you assume liability for workmanship on supplied goods; please allow up to 2% for spoilage. Spoilage beyond 2% is credited.</p>
          <p className="mt-1"><strong>Artwork:</strong> best formats are .ai, .cdr, .eps; .jpg/.tiff/.bmp accepted. Art that isn't camera-ready may incur art charges at $40/hr — we'll tell you before any of that happens.</p>
        </div>
      </div>
    </div>
  );
}
