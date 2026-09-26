import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, Camera, Check, Loader2, Sparkles, X } from 'lucide-react';
import { CARD_TEMPLATES, CARD_HERO_PRICE } from '../lib/cardTemplates';
import { CARD_SLOTS } from '../lib/cardSlots';
import { money } from '../lib/api';
import { useCgcPath } from '../lib/base';

// /holiday-cards/:id/design — the CGC card designer. The template art is
// the canvas background; customers drop their photos into the measured
// photo slots (cover-fit, ellipse-clipped where the art calls for it)
// and watch the live composite. Names/greeting personalization happens
// on the free proof, so text stays out of the canvas — no font matching
// risk. "Get My Cards" uploads the composite and hands off to the order
// form with the design attached.

type SlotPhoto = { img: HTMLImageElement; name: string } | null;

function drawCard(
  canvas: HTMLCanvasElement, art: HTMLImageElement,
  slots: Array<[number, number, number, number]>, shape: 'rect' | 'ellipse',
  photos: SlotPhoto[], highlight: number | null,
) {
  const W = canvas.width; const H = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(art, 0, 0, W, H);
  slots.forEach(([x, y, w, h], i) => {
    const px = x * W; const py = y * H; const pw = w * W; const ph = h * H;
    const photo = photos[i];
    ctx.save();
    ctx.beginPath();
    if (shape === 'ellipse') ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
    else ctx.rect(px, py, pw, ph);
    ctx.clip();
    if (photo) {
      const s = Math.max(pw / photo.img.naturalWidth, ph / photo.img.naturalHeight);
      const dw = photo.img.naturalWidth * s; const dh = photo.img.naturalHeight * s;
      ctx.drawImage(photo.img, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
    }
    ctx.restore();
    if (highlight === i) {
      ctx.save();
      ctx.strokeStyle = '#f97316'; ctx.lineWidth = Math.max(3, W * 0.006);
      ctx.setLineDash([10, 7]);
      if (shape === 'ellipse') {
        ctx.beginPath();
        ctx.ellipse(px + pw / 2, py + ph / 2, pw / 2, ph / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else ctx.strokeRect(px, py, pw, ph);
      ctx.restore();
    }
  });
}

export default function CardDesignerPage() {
  const { id } = useParams();
  const p = useCgcPath();
  const navigate = useNavigate();
  const template = useMemo(() => CARD_TEMPLATES.find((t) => t.id === id), [id]);
  const spec = id ? CARD_SLOTS[id] : undefined;

  const [art, setArt] = useState<HTMLImageElement | null>(null);
  const [photos, setPhotos] = useState<SlotPhoto[]>([]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingSlot = useRef(0);

  useEffect(() => {
    if (!template?.image || !spec) return;
    setPhotos(Array(spec.slots.length).fill(null));
    const img = new Image();
    img.onload = () => setArt(img);
    img.src = template.image;
  }, [template, spec]);

  // Redraw whenever anything changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !art || !spec) return;
    canvas.width = art.naturalWidth;
    canvas.height = art.naturalHeight;
    drawCard(canvas, art, spec.slots, spec.shape, photos, activeSlot);
  }, [art, spec, photos, activeSlot]);

  if (!template || !spec || !template.image) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-lg font-semibold text-cgc-ink">That design can’t be customized online yet.</p>
        <Link to={p('/holiday-cards')} className="mt-4 inline-flex rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3">
          Browse card templates
        </Link>
      </div>
    );
  }

  const filled = photos.filter(Boolean).length;

  const pickPhoto = (slot: number) => {
    pendingSlot.current = slot;
    setActiveSlot(slot);
    fileRef.current?.click();
  };

  const onFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setPhotos((prev) => {
          const next = [...prev];
          next[pendingSlot.current] = { img, name: file.name };
          return next;
        });
        setActiveSlot(null);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  // Map a canvas click to the slot underneath it.
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const hit = spec.slots.findIndex(([sx, sy, sw, sh]) => x >= sx && x <= sx + sw && y >= sy && y <= sy + sh);
    if (hit >= 0) pickPhoto(hit);
  };

  const submit = async () => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      setActiveSlot(null);
      // Give the redraw a frame so the highlight is off the composite.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const canvas = canvasRef.current;
      if (!canvas) throw new Error('Preview not ready');
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const res = await fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, filename: `card-${template.id}-${Date.now()}.jpg` }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not save your design — try again');
      const qs = new URLSearchParams({
        interest: 'holiday-cards',
        design: template.id,
        name: template.name,
        custom: data.url,
      });
      if (familyName.trim()) qs.set('family', familyName.trim());
      navigate(`${p('/business')}?${qs}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong — try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <Helmet><title>{`Design ${template.name} — Custom Gift Club`}</title></Helmet>

      <nav className="text-sm text-cgc-stone mb-4" aria-label="Breadcrumb">
        <Link to={p('/holiday-cards')} className="inline-flex items-center gap-1 hover:text-cgc-orange">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All card templates
        </Link>
      </nav>

      <div className="lg:flex lg:gap-8">
        {/* Live preview */}
        <div className="lg:flex-1 min-w-0">
          <div className="rounded-2xl bg-cgc-cream/60 border border-cgc-cream-deep p-4 sm:p-6 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              onClick={onCanvasClick}
              className="max-w-full h-auto max-h-[75vh] rounded-lg shadow-xl cursor-pointer"
              aria-label={`${template.name} card preview — click a photo area to add your photo`}
            />
          </div>
          <p className="mt-2 text-center text-xs text-cgc-stone">Click any photo area on the card to add your own photo.</p>
        </div>

        {/* Controls */}
        <div className="mt-6 lg:mt-0 lg:w-96 shrink-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-cgc-ink">{template.name}</h1>
          <p className="mt-1 text-sm text-cgc-stone">
            {template.fold} · {template.size}{template.foil !== 'None' ? ` · ${template.foil}` : ''} ·
            from <span className="font-bold text-cgc-ink">{money(CARD_HERO_PRICE.sale)} each</span> at {CARD_HERO_PRICE.qty}+
          </p>

          <div className="mt-5">
            <p className="text-sm font-bold text-cgc-ink">
              Your photos <span className="font-normal text-cgc-stone">({filled}/{spec.slots.length} added)</span>
            </p>
            <div className="mt-2 space-y-2">
              {spec.slots.map((_, i) => {
                const photo = photos[i];
                return (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      type="button" onClick={() => pickPhoto(i)}
                      className={`flex-1 flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors ${photo ? 'border-green-300 bg-green-50 text-green-800' : 'border-cgc-cream-deep text-cgc-ink hover:border-cgc-orange'}`}
                    >
                      {photo
                        ? <Check className="h-4 w-4 shrink-0 text-green-600" aria-hidden />
                        : <Camera className="h-4 w-4 shrink-0 text-cgc-orange" aria-hidden />}
                      {photo ? <span className="truncate">{photo.name}</span> : `Add photo ${spec.slots.length > 1 ? i + 1 : ''}`}
                    </button>
                    {photo && (
                      <button
                        type="button" aria-label={`Remove photo ${i + 1}`}
                        onClick={() => setPhotos((prev) => { const n = [...prev]; n[i] = null; return n; })}
                        className="rounded-full p-2 text-cgc-stone hover:bg-cgc-cream hover:text-cgc-ink"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <input
              ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { onFile(e.target.files); e.target.value = ''; }}
            />
          </div>

          <div className="mt-5">
            <label htmlFor="family-name" className="text-sm font-bold text-cgc-ink">Family name for the card</label>
            <input
              id="family-name" value={familyName} onChange={(e) => setFamilyName(e.target.value)}
              placeholder="The Williams Family"
              className="mt-1.5 w-full rounded-xl border border-cgc-cream-deep px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cgc-orange"
            />
            <p className="mt-1.5 text-xs text-cgc-stone">
              We set your name and greeting in the design’s exact fonts and send a free proof before anything prints — the preview keeps the sample text for now.
            </p>
          </div>

          {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}

          <button
            type="button" onClick={() => void submit()} disabled={submitting || filled === 0}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold py-3.5 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
            Get My Cards
          </button>
          <p className="mt-2 text-center text-xs text-cgc-stone">
            {filled === 0
              ? 'Add at least one photo to continue.'
              : 'Saves your design and takes you to the order form — no payment yet.'}
          </p>
        </div>
      </div>
    </div>
  );
}
