import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Gem,
  Shirt,
  Sparkles,
  Timer,
  Users,
  X,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

// Rhinestone / spiritwear landing. The live price here is the real engine —
// POST /api/rhinestone/quote, same formula the admin quotes with — not a
// marketing approximation, because stone count is something we actually know
// (StoneCut digitizes the design before anyone quotes it).

type Quote = {
  quantity: number;
  stoneCount: number;
  pricePerPiece: number;
  effectivePerPiece: number;
  total: number;
  transferOnly: boolean;
  breakdown: {
    stone_charge_per_location: number;
    press_labor_per_location: number;
    decoration_per_piece: number;
    garment_per_piece: number;
    digitizing_fee: number;
    rush_surcharge: number;
  };
};

type GalleryDesign = {
  id: number;
  name: string;
  slug: string;
  preview_url: string;
  width_mm: string | number | null;
  height_mm: string | number | null;
  stone_count: number;
};

// Stone counts for the four design scales people actually order. Numbers come
// from StoneCut runs on real jobs — a name across the back is ~250 stones at
// SS10, a full front graphic lands near 900.
const DESIGN_SIZES = [
  { key: 'accent', label: 'Name or monogram', detail: '~4in · left chest', stones: 250 },
  { key: 'standard', label: 'Standard chest', detail: '~8in wide', stones: 500 },
  { key: 'full', label: 'Full front', detail: '~11in wide', stones: 900 },
  { key: 'allover', label: 'Big & bold', detail: '~14in, heavy fill', stones: 1600 },
] as const;

// Wholesale blank cost each; the engine applies the house markup. 0 is the
// transfer-only line — we make the sheet, the customer presses it.
const GARMENTS = [
  { key: 'transfer', label: 'Transfer only', detail: 'You press it', cost: 0 },
  { key: 'tee', label: 'Cotton tee', detail: 'Gildan / Bella', cost: 3.5 },
  { key: 'tank', label: 'Tank or crop', detail: 'Dance & cheer', cost: 4.25 },
  { key: 'perf', label: 'Performance tee', detail: 'Moisture-wicking', cost: 5.5 },
  { key: 'hoodie', label: 'Hoodie', detail: 'Midweight fleece', cost: 14 },
] as const;

const QTY_PRESETS = [6, 12, 24, 48, 100];

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

export default function BlingPage() {
  const [sizeKey, setSizeKey] = useState<string>('standard');
  const [garmentKey, setGarmentKey] = useState<string>('tee');
  const [quantity, setQuantity] = useState(24);
  const [locations, setLocations] = useState(1);
  const [rush, setRush] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryDesign[]>([]);

  const size = useMemo(
    () => DESIGN_SIZES.find((d) => d.key === sizeKey) ?? DESIGN_SIZES[1],
    [sizeKey],
  );
  const garment = useMemo(
    () => GARMENTS.find((g) => g.key === garmentKey) ?? GARMENTS[1],
    [garmentKey],
  );

  // Featured designs published out of StoneCut. An empty gallery is a normal
  // state (nothing featured yet), so the section just hides itself.
  useEffect(() => {
    let live = true;
    fetch('/api/rhinestone/designs?limit=12')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (live && Array.isArray(rows)) setGallery(rows); })
      .catch(() => { /* gallery is decorative — never block the page */ });
    return () => { live = false; };
  }, []);

  // Re-price on every change. Debounced so dragging the quantity slider
  // doesn't fire a request per pixel.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      fetch('/api/rhinestone/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity,
          stoneCount: size.stones,
          garmentCost: garment.cost,
          garmentName: garment.label,
          numLocations: locations,
          rush,
        }),
      })
        .then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not price that');
          return r.json();
        })
        .then((q) => { if (live) { setQuote(q); setQuoteError(null); } })
        .catch((e) => { if (live) setQuoteError(e instanceof Error ? e.message : 'Could not price that'); });
    }, 180);
    return () => { live = false; clearTimeout(t); };
  }, [quantity, size.stones, garment.cost, garment.label, locations, rush]);

  return (
    <Layout>
      <Seo
        title="Custom Rhinestone Shirts & Bling Spiritwear · Atlanta · TShirt Brothers"
        description="Custom rhinestone shirts, bling spiritwear, and ready-to-press rhinestone transfers — made in Fairburn, GA. Free digital proofs, no 48-piece minimum, unlimited stone colors, and pricing from the real stone count. Get an instant price."
        path="/bling"
      />

      {/* The sparkle is pure CSS so it costs nothing and degrades to a plain
          dark hero wherever prefers-reduced-motion is set. */}
      <style>{`
        @keyframes tsb-twinkle {
          0%, 100% { opacity: 0.15; transform: scale(0.7); }
          50%      { opacity: 1;    transform: scale(1.15); }
        }
        .tsb-sparkle { animation: tsb-twinkle 3.2s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .tsb-sparkle { animation: none; opacity: 0.5; }
        }
      `}</style>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-gray-950 via-purple-950 to-gray-900 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {HERO_SPARKLES.map((s, i) => (
            <span
              key={i}
              className="tsb-sparkle absolute rounded-full bg-white"
              style={{
                left: `${s.x}%`,
                top: `${s.y}%`,
                width: s.r,
                height: s.r,
                animationDelay: `${s.d}s`,
                boxShadow: '0 0 6px 1px rgba(255,255,255,0.8)',
              }}
            />
          ))}
        </div>

        <div className="relative container mx-auto px-4 py-20 md:py-28 max-w-5xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur">
            <Gem className="h-4 w-4" /> Made in Fairburn, GA — stones set in-house
          </span>
          <h1 className="mt-6 font-display text-4xl md:text-6xl font-bold leading-tight">
            Bling that doesn&apos;t
            <span className="bg-gradient-to-r from-amber-200 via-white to-fuchsia-200 bg-clip-text text-transparent">
              {' '}fall off
            </span>
          </h1>
          <p className="mt-5 text-lg text-gray-300 max-w-2xl mx-auto">
            Custom rhinestone shirts and spiritwear for schools, teams, dance studios, cheer squads,
            Greek life, and small brands. We cut the template, set the stones, and press them
            ourselves — so one shirt costs the same per stone as a hundred would.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#price"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-orange-500 px-7 py-3.5 font-semibold shadow-lg shadow-fuchsia-900/40 hover:brightness-110"
            >
              <Sparkles className="h-4 w-4" /> Price my bling
            </a>
            <Link
              to="/quote"
              className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-7 py-3.5 font-semibold hover:bg-white/10"
            >
              Talk to a human <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <dl className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
            {[
              { k: 'No minimum', v: 'Order 1 or 1,000' },
              { k: 'Free proofs', v: 'Every single time' },
              { k: '90+ colors', v: 'Mix as many as you like' },
              { k: '5–7 days', v: 'Rush available' },
            ].map((s) => (
              <div key={s.k} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <dt className="font-display text-lg font-bold">{s.k}</dt>
                <dd className="text-sm text-gray-400">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Live price ─────────────────────────────────────────────────── */}
      <section id="price" className="scroll-mt-20 py-16 bg-gray-50">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold">What will it cost?</h2>
            <p className="mt-3 text-gray-500 max-w-2xl mx-auto">
              Most shops price bling by the square inch and guess at the rest. We price by the stone,
              because our design software counts them before we quote you. Move the sliders.
            </p>
          </div>

          <div className="mt-10 grid lg:grid-cols-5 gap-6">
            {/* Controls */}
            <div className="lg:col-span-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <Field label="How big is the design?">
                <div className="grid sm:grid-cols-2 gap-2">
                  {DESIGN_SIZES.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => setSizeKey(d.key)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        sizeKey === d.key
                          ? 'border-fuchsia-500 bg-fuchsia-50 ring-1 ring-fuchsia-500'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="block font-semibold text-sm">{d.label}</span>
                      <span className="block text-xs text-gray-500">{d.detail}</span>
                      <span className="mt-1 block text-xs font-medium text-fuchsia-600">
                        ≈ {d.stones.toLocaleString()} stones
                      </span>
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="On what?">
                <div className="flex flex-wrap gap-2">
                  {GARMENTS.map((g) => (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => setGarmentKey(g.key)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                        garmentKey === g.key
                          ? 'border-fuchsia-500 bg-fuchsia-50 ring-1 ring-fuchsia-500'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{g.label}</span>
                      <span className="block text-xs text-gray-500">{g.detail}</span>
                    </button>
                  ))}
                </div>
              </Field>

              <Field label={`How many? — ${quantity} piece${quantity === 1 ? '' : 's'}`}>
                <input
                  type="range"
                  min={1}
                  max={250}
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  className="w-full accent-fuchsia-500"
                  aria-label="Quantity"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {QTY_PRESETS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuantity(q)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        quantity === q ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700' : 'border-gray-200 text-gray-600'
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </Field>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Placements">
                  <div className="flex gap-2">
                    {[1, 2].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setLocations(n)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                          locations === n
                            ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-700'
                            : 'border-gray-200 text-gray-600'
                        }`}
                      >
                        {n === 1 ? 'One spot' : 'Front + back'}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Timing">
                  <button
                    type="button"
                    onClick={() => setRush(!rush)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm font-semibold ${
                      rush ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    <Timer className="mr-1.5 inline h-4 w-4" />
                    {rush ? 'Rush — move me up the line' : 'Standard — 5 to 7 days'}
                  </button>
                </Field>
              </div>
            </div>

            {/* Result */}
            <div className="lg:col-span-2">
              <div className="sticky top-24 rounded-2xl bg-gray-950 p-6 text-white shadow-lg">
                {quoteError ? (
                  <p className="text-sm text-red-300">{quoteError}</p>
                ) : !quote ? (
                  <p className="text-sm text-gray-400">Pricing…</p>
                ) : (
                  <>
                    <p className="text-xs uppercase tracking-wider text-gray-400">Your price</p>
                    <p className="mt-1 font-display text-5xl font-bold">
                      {money(quote.effectivePerPiece)}
                      <span className="ml-1 text-base font-normal text-gray-400">each</span>
                    </p>
                    <p className="mt-1 text-sm text-gray-400">
                      {money(quote.total)} for {quote.quantity} ·{' '}
                      {quote.transferOnly ? 'transfer only' : garment.label.toLowerCase()}
                    </p>

                    <ul className="mt-6 space-y-2 border-t border-white/10 pt-4 text-sm">
                      <Row
                        label={`${size.stones.toLocaleString()} stones${locations > 1 ? ' × 2 spots' : ''}`}
                        value={money(quote.breakdown.stone_charge_per_location * locations)}
                      />
                      {/* On a transfer-only order we set the stones into the
                          template but the customer presses it, so calling the
                          line "pressing" would be plainly untrue. */}
                      <Row
                        label={`${quote.transferOnly ? 'Stone setting' : 'Setting & pressing'}${
                          locations > 1 ? ' × 2' : ''
                        }`}
                        value={money(quote.breakdown.press_labor_per_location * locations)}
                      />
                      {quote.breakdown.garment_per_piece > 0 && (
                        <Row label={garment.label} value={money(quote.breakdown.garment_per_piece)} />
                      )}
                      {quote.breakdown.digitizing_fee > 0 && (
                        <Row
                          label="One-time digitizing"
                          value={money(quote.breakdown.digitizing_fee)}
                          hint="Free at 24+"
                        />
                      )}
                      {quote.breakdown.rush_surcharge > 0 && (
                        <Row label="Rush" value={money(quote.breakdown.rush_surcharge)} />
                      )}
                    </ul>

                    <Link
                      to="/quote"
                      className="mt-6 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-500 to-orange-500 px-5 py-3 font-semibold hover:brightness-110"
                    >
                      Lock this in <ArrowRight className="h-4 w-4" />
                    </Link>
                    <p className="mt-3 text-center text-[11px] leading-relaxed text-gray-500">
                      Estimate based on a typical design at this size. Your real stone count comes
                      from the digitized file — we send it with your free proof before you pay.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Gallery ────────────────────────────────────────────────────── */}
      {gallery.length > 0 && (
        <section className="py-16">
          <div className="container mx-auto px-4 max-w-6xl">
            <h2 className="font-display text-3xl font-bold text-center">Recently off the board</h2>
            <p className="mt-3 text-center text-gray-500">
              Every one of these was digitized stone-by-stone in our own software.
            </p>
            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
              {gallery.map((d) => (
                <figure
                  key={d.id}
                  className="group rounded-xl border border-gray-200 bg-gradient-to-b from-gray-900 to-gray-800 p-4 transition-transform hover:-translate-y-1"
                >
                  <img
                    src={d.preview_url}
                    alt={d.name}
                    loading="lazy"
                    className="h-40 w-full object-contain"
                  />
                  <figcaption className="mt-3 text-center">
                    <span className="block text-sm font-semibold text-white">{d.name}</span>
                    <span className="block text-xs text-gray-400">
                      {d.stone_count.toLocaleString()} stones
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Who it's for ───────────────────────────────────────────────── */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 max-w-6xl">
          <h2 className="font-display text-3xl md:text-4xl font-bold text-center">Spiritwear, sorted</h2>
          <p className="mt-3 text-center text-gray-500 max-w-2xl mx-auto">
            Half of what we set goes on a school, a squad, or a studio. Pair bling with a web store and
            your families order and pay directly — you never collect a dime or sort a single shirt.
          </p>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AUDIENCES.map((a) => (
              <div key={a.title} className="rounded-xl border border-gray-200 bg-white p-5">
                <a.icon className="h-6 w-6 text-fuchsia-500" />
                <h3 className="mt-3 font-display text-lg font-bold">{a.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{a.blurb}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              to="/webstores"
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-800"
            >
              See how a spiritwear store works <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="font-display text-3xl font-bold text-center">How a bling order runs</h2>
          <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-gray-200 p-5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-fuchsia-100 font-display font-bold text-fuchsia-700">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{s.blurb}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Comparison ─────────────────────────────────────────────────── */}
      <section className="py-16 bg-gray-950 text-white">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="font-display text-3xl font-bold text-center">
            Why people leave the big rhinestone shops
          </h2>
          <p className="mt-3 text-center text-gray-400">
            Not a dig — their equipment is set up for volume. Ours is set up for you.
          </p>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="py-3 pr-4 font-display font-bold" />
                  <th className="py-3 pr-4 font-display font-bold text-gray-400">Typical shop</th>
                  <th className="py-3 font-display font-bold">TShirt Brothers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {COMPARISON.map((c) => (
                  <tr key={c.what}>
                    <td className="py-3 pr-4 font-medium">{c.what}</td>
                    <td className="py-3 pr-4 text-gray-400">
                      <X className="mr-1.5 inline h-4 w-4 text-red-400" />
                      {c.them}
                    </td>
                    <td className="py-3">
                      <Check className="mr-1.5 inline h-4 w-4 text-emerald-400" />
                      {c.us}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="font-display text-3xl font-bold text-center">Straight answers</h2>
          <div className="mt-8 divide-y divide-gray-200">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="cursor-pointer list-none font-display font-bold marker:hidden">
                  <span className="inline-flex w-full items-center justify-between gap-4">
                    {f.q}
                    <ArrowRight className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Close ──────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-r from-fuchsia-600 to-orange-500 py-16 text-white">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold">Send us a sketch</h2>
          <p className="mt-3 text-white/90">
            A logo, a phone photo of a napkin, a Pinterest screenshot — we&apos;ll turn it into stones
            and show you a free proof before you owe anything.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              to="/quote"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-7 py-3.5 font-semibold text-gray-900 hover:bg-gray-100"
            >
              Start a quote <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/design"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/40 px-7 py-3.5 font-semibold hover:bg-white/10"
            >
              Try the Design Studio
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 last:mb-0">
      <p className="mb-2 text-sm font-semibold text-gray-700">{label}</p>
      {children}
    </div>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-gray-400">
        {label}
        {hint && <span className="ml-1.5 text-[11px] text-emerald-400">{hint}</span>}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </li>
  );
}

// Fixed positions rather than Math.random(), so the hero doesn't reshuffle on
// every render and the prerender output stays byte-stable.
const HERO_SPARKLES = [
  { x: 6, y: 18, r: 3, d: 0 },
  { x: 14, y: 68, r: 2, d: 1.1 },
  { x: 22, y: 34, r: 4, d: 2.0 },
  { x: 31, y: 82, r: 2, d: 0.6 },
  { x: 43, y: 12, r: 3, d: 1.7 },
  { x: 52, y: 60, r: 2, d: 2.6 },
  { x: 61, y: 26, r: 4, d: 0.3 },
  { x: 70, y: 74, r: 3, d: 1.4 },
  { x: 78, y: 40, r: 2, d: 2.2 },
  { x: 86, y: 16, r: 4, d: 0.9 },
  { x: 92, y: 62, r: 3, d: 1.9 },
  { x: 96, y: 30, r: 2, d: 2.8 },
];

const AUDIENCES = [
  { icon: Users, title: 'Schools & PTAs', blurb: 'Mascot on the front, last names on the back, a store link in the newsletter.' },
  { icon: Sparkles, title: 'Dance & cheer', blurb: 'Studio logos on tanks and crops, competition years, team mom shirts.' },
  { icon: Shirt, title: 'Greek life', blurb: 'Letters in crystal, chapter events, bid day, homecoming.' },
  { icon: Gem, title: 'Churches & ministries', blurb: "Anniversary tees, women's conference sets, choir robes and jackets." },
  { icon: Timer, title: 'Last-minute events', blurb: 'Reunions, birthdays, game-day shirts — rush when you need it.' },
  { icon: Check, title: 'Small brands', blurb: 'Wholesale transfers so you can press your own and keep the margin.' },
];

const STEPS = [
  { title: 'Send the art', blurb: 'Logo, sketch, or a screenshot. Bold and simple stones best — we will tell you straight if it will not.' },
  { title: 'We digitize it', blurb: 'Our software maps every stone by size and color. That map is what you get quoted on.' },
  { title: 'Free proof', blurb: 'You see the exact stone layout on your garment before production starts. Revisions included.' },
  { title: 'Set and pressed', blurb: 'Template cut, stones brushed and picked up, heat-pressed in-house. 5 to 7 days.' },
];

const COMPARISON = [
  { what: 'Minimum order', them: '48 pieces', us: 'One piece' },
  { what: 'Digital proof', them: 'Around $17', us: 'Free, always' },
  { what: 'Stone colors per design', them: 'Two', us: 'As many as the design needs' },
  { what: 'How it is priced', them: 'Square inches, coverage guessed', us: 'Actual stone count from the file' },
  { what: 'Turnaround', them: '10–14 business days', us: '5–7 days, rush available' },
  { what: 'Who presses it', them: 'Outsourced', us: 'Us, in Fairburn' },
];

const FAQ = [
  {
    q: 'Will the stones come off in the wash?',
    a: 'Not if you treat them right. We use hotfix stones with commercial-grade adhesive and a calibrated press. Wash inside out in cold, skip the fabric softener, and hang dry or tumble low — done that way the stones outlast the shirt. Bleach and high heat are what kill a bling shirt.',
  },
  {
    q: 'What artwork works and what does not?',
    a: 'A stone is a dot about 3mm across, so the design gets built out of dots. Bold letters, clean shapes, and thick lines translate beautifully. Fine serifs, gradients, tiny text, and photo-realistic detail do not — we will simplify them and show you exactly what we changed in the proof. If it will not work, we say so before you pay.',
  },
  {
    q: 'Can I mix rhinestones with printing or embroidery?',
    a: 'Yes, and it is often the best-looking option — stones as the accent over a printed or embroidered base. One note from the press side: stones only bond over water-based ink, not plastisol, so tell us up front if a design is layered.',
  },
  {
    q: 'Can I buy just the transfer?',
    a: 'Yes. Pick "Transfer only" in the calculator and we ship you the sheet, ready to press at 335°F for 10–15 seconds, peel cold. Plenty of our customers press their own blanks and keep the garment margin.',
  },
  {
    q: 'Do you do names and numbers for a whole team?',
    a: 'That is most of what we set. Personalization is priced per shirt the same way, and a web store is usually the easiest way to run it — each family picks their own name, size, and color, and pays at checkout.',
  },
  {
    q: 'How exact is the price on this page?',
    a: 'The stone counts here are averages for each design scale, and that is the only estimate in it — the formula, volume breaks, and fees are the same ones our admin quotes with. Once your art is digitized we requote on the real count, which goes out with your proof.',
  },
];
