import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import {
  ChevronLeft, ChevronRight, Pause, Play, Shirt, Feather, Gem,
  ArrowRight, Palette, Scale, Ruler, Printer, Check,
} from 'lucide-react';

/**
 * /compare — "Three Shirts. Three Price Points."
 *
 * Customer-facing explainer for the three quality tiers the quote wizard
 * offers. Everything on the page is generated from live data:
 *  - prices come from POST /api/quote/calculate (same engine as /quote)
 *  - brand reels + catalogues come from /api/products (S&S imagery — the
 *    brands' official media library distributed to resellers)
 */

const NAVY = '#1f2a44';

type Tier = {
  key: 'Standard' | 'Premium' | 'Ultra';
  brand: string;          // matches products.brand exactly for catalogue fetch
  brandShort: string;
  style: string;          // flagship style number
  styleName: string;
  ssId: string;           // flagship style's ss_id (for /api/products/colors/:id)
  tagline: string;
  weight: string;
  fabric: string;
  fit: string;
  feel: string;
  bestFor: string;
  accent: string;         // tailwind-free hex accents so the deck can theme itself
  accentSoft: string;
  icon: typeof Shirt;
  heroImg: string;
};

const TIERS: Tier[] = [
  {
    key: 'Standard',
    brand: 'Gildan',
    brandShort: 'Gildan',
    style: '5000',
    styleName: 'Heavy Cotton™ T-Shirt',
    ssId: '16',
    tagline: 'The workhorse. Dependable, budget-friendly, everywhere for a reason.',
    weight: '5.3 oz',
    fabric: '100% cotton',
    fit: 'Classic — roomy, true to size',
    feel: 'Sturdy everyday cotton',
    bestFor: 'Events, fundraisers, teams, big orders on a budget',
    accent: '#16a34a',
    accentSoft: '#dcfce7',
    icon: Shirt,
    heroImg: 'https://cdn.ssactivewear.com/Images/Style/16_fl.jpg',
  },
  {
    key: 'Premium',
    brand: 'Next Level',
    brandShort: 'Next Level',
    style: '6210',
    styleName: 'Unisex CVC Tee',
    ssId: '3227',
    tagline: 'The retail favorite. Soft, fitted, and made to be worn on repeat.',
    weight: '4.3 oz',
    fabric: '60/40 cotton-poly CVC',
    fit: 'Modern retail — slightly tailored',
    feel: 'Sueded, buttery soft',
    bestFor: 'Brands, merch drops, uniforms people actually keep wearing',
    accent: '#ea580c',
    accentSoft: '#ffedd5',
    icon: Feather,
    heroImg: 'https://cdn.ssactivewear.com/Images/Style/3227_fl.jpg',
  },
  {
    key: 'Ultra',
    brand: 'Comfort Colors',
    brandShort: 'Comfort Colors',
    style: '1717',
    styleName: 'Garment-Dyed Heavyweight T-Shirt',
    ssId: '1822',
    tagline: 'The premium pick. Garment-dyed, vintage color, built to last years.',
    weight: '6.1 oz',
    fabric: '100% ring-spun cotton, garment-dyed',
    fit: 'Relaxed — lived-in from day one',
    feel: 'Thick, washed, vintage-soft',
    bestFor: 'Boutiques, greek life, gifts, anywhere quality is the point',
    accent: '#7c3aed',
    accentSoft: '#ede9fe',
    icon: Gem,
    heroImg: 'https://cdn.ssactivewear.com/Images/Style/1822_fl.jpg',
  },
];

const fixCdn = (u?: string | null) =>
  u ? u.replace('www.ssactivewear.com/Images', 'cdn.ssactivewear.com/Images') : undefined;

/* ── Live pricing ──────────────────────────────────────────────────────── */

const QTY_OPTIONS = [12, 24, 50, 100, 250];

function useTierPrices(qty: number) {
  return useQuery({
    queryKey: ['tier-prices', qty],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(
        TIERS.map(async (t) => {
          const res = await fetch('/api/quote/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              garmentName: 'T-shirt',
              qualityTier: t.key,
              methodName: 'DTF',
              numLocations: 1,
              colorsPerLocation: 1,
              sizes: [{ size: 'L', quantity: qty }],
              discountQuantity: qty,
            }),
          });
          if (res.ok) {
            const d = await res.json();
            out[t.key] = d.per_shirt;
          }
        }),
      );
      return out;
    },
  });
}

/* ── Story-style slide deck ────────────────────────────────────────────── */

type Slide = {
  id: string;
  render: (active: boolean) => JSX.Element;
};

function useAutoAdvance(count: number, ms: number, paused: boolean) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % count), ms);
    return () => clearInterval(t);
  }, [count, ms, paused]);
  return [idx, setIdx] as const;
}

function SlideDeck({ prices }: { prices?: Record<string, number> }) {
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const slides: Slide[] = useMemo(() => {
    const s: Slide[] = [];

    // Opener
    s.push({
      id: 'open',
      render: (active) => (
        <div className="h-full flex flex-col items-center justify-center text-center px-6" style={{ background: NAVY }}>
          <p className={`text-orange-400 font-black uppercase tracking-[0.3em] text-xs sm:text-sm transition-all duration-700 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            The TSB Feel Test
          </p>
          <h3 className={`mt-3 text-white font-black text-3xl sm:text-6xl leading-tight transition-all duration-700 delay-150 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            Three shirts.<br />Three price points.
          </h3>
          <p className={`mt-4 text-gray-300 text-sm sm:text-lg max-w-md transition-all duration-700 delay-300 ${active ? 'opacity-100' : 'opacity-0'}`}>
            Every quote we build starts with one question — which shirt? Here's how the three answer.
          </p>
        </div>
      ),
    });

    // One slide per tier
    TIERS.forEach((t, i) => {
      s.push({
        id: t.key,
        render: (active) => (
          <div className="h-full grid grid-cols-[1fr_auto] sm:grid-cols-2 items-center overflow-hidden" style={{ background: t.accentSoft }}>
            <div className="pl-6 sm:pl-12 py-6 relative z-10">
              <span
                className="text-[64px] sm:text-[120px] font-black leading-none opacity-15 absolute -top-2 sm:top-0 left-3 sm:left-6 select-none"
                style={{ color: t.accent }}
              >
                0{i + 1}
              </span>
              <p className="text-[11px] sm:text-sm font-black uppercase tracking-[0.25em]" style={{ color: t.accent }}>
                {t.key} tier
              </p>
              <h3 className={`mt-1 font-black text-2xl sm:text-5xl leading-tight transition-all duration-700 ${active ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-6'}`} style={{ color: NAVY }}>
                {t.brand}<br className="sm:hidden" /> {t.style}
              </h3>
              <p className={`mt-2 text-xs sm:text-base text-gray-700 max-w-sm transition-all duration-700 delay-150 ${active ? 'opacity-100' : 'opacity-0'}`}>
                {t.tagline}
              </p>
              <div className={`mt-3 sm:mt-5 flex flex-wrap gap-1.5 sm:gap-2 transition-all duration-700 delay-300 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
                {[t.weight, t.fabric, t.feel].map((chip) => (
                  <span key={chip} className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] sm:text-xs font-bold text-gray-800 shadow-sm">
                    {chip}
                  </span>
                ))}
              </div>
              {prices?.[t.key] != null && (
                <p className={`mt-3 sm:mt-5 font-black text-lg sm:text-3xl transition-all duration-700 delay-500 ${active ? 'opacity-100' : 'opacity-0'}`} style={{ color: t.accent }}>
                  from ${prices![t.key]!.toFixed(2)}<span className="text-xs sm:text-base font-bold text-gray-600"> /shirt printed*</span>
                </p>
              )}
            </div>
            <img
              src={t.heroImg}
              alt={`${t.brand} ${t.style} ${t.styleName}`}
              className={`h-full max-h-full w-auto object-contain justify-self-end pr-2 sm:pr-10 transition-all duration-1000 ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-110'}`}
            />
          </div>
        ),
      });
    });

    // Price race
    s.push({
      id: 'price',
      render: (active) => (
        <div className="h-full flex flex-col justify-center px-6 sm:px-12" style={{ background: NAVY }}>
          <h3 className="text-white font-black text-xl sm:text-4xl">Same design. 24 shirts. One front print.</h3>
          <div className="mt-5 sm:mt-8 space-y-3 sm:space-y-4">
            {TIERS.map((t, i) => {
              const p = prices?.[t.key];
              const max = Math.max(...TIERS.map((x) => prices?.[x.key] ?? 1));
              const pct = p ? Math.max(28, (p / max) * 100) : 30 + i * 25;
              return (
                <div key={t.key} className="flex items-center gap-3">
                  <span className="w-24 sm:w-36 text-right text-[11px] sm:text-sm font-bold text-gray-300 shrink-0">{t.brandShort}</span>
                  <div
                    className="h-8 sm:h-11 rounded-r-full flex items-center justify-end pr-3 transition-all duration-1000 ease-out"
                    style={{ background: t.accent, width: active ? `${pct}%` : '0%', transitionDelay: `${i * 200}ms` }}
                  >
                    <span className="text-white font-black text-xs sm:text-lg whitespace-nowrap">
                      {p != null ? `$${p.toFixed(2)}` : '…'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 sm:mt-6 text-gray-400 text-[10px] sm:text-sm">*Per shirt, full-color DTF front print included. Volume pricing pools across your whole order.</p>
        </div>
      ),
    });

    // Verdict / CTA
    s.push({
      id: 'verdict',
      render: (active) => (
        <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-orange-600">
          <h3 className={`text-white font-black text-2xl sm:text-5xl leading-tight transition-all duration-700 ${active ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
            There's no wrong answer.
          </h3>
          <p className={`mt-3 text-orange-100 text-sm sm:text-lg max-w-lg transition-all duration-700 delay-200 ${active ? 'opacity-100' : 'opacity-0'}`}>
            Budget, retail-soft, or premium heavyweight — pick your tier in the quote wizard and see your exact price in about a minute.
          </p>
          <Link
            to="/quote"
            className={`mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 font-black text-orange-700 shadow-lg transition-all duration-700 delay-300 hover:scale-105 ${active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
          >
            Start my quote <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ),
    });

    return s;
  }, [prices]);

  const [idx, setIdx] = useAutoAdvance(slides.length, 6000, paused);

  return (
    <div
      className="relative rounded-3xl overflow-hidden shadow-2xl select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => { touchX.current = e.touches[0]?.clientX ?? null; }}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
        if (dx < -40) setIdx((idx + 1) % slides.length);
        if (dx > 40) setIdx((idx - 1 + slides.length) % slides.length);
        touchX.current = null;
      }}
    >
      {/* Story progress bars */}
      <div className="absolute top-3 left-4 right-4 z-20 flex gap-1.5">
        {slides.map((sl, i) => (
          <button
            key={sl.id}
            aria-label={`Slide ${i + 1}`}
            onClick={() => setIdx(i)}
            className="h-1.5 flex-1 rounded-full bg-white/30 overflow-hidden"
          >
            <span
              className="block h-full bg-white rounded-full transition-all"
              style={{
                width: i < idx ? '100%' : i === idx ? '100%' : '0%',
                transitionDuration: i === idx && !paused ? '6000ms' : '200ms',
                transitionTimingFunction: 'linear',
                transform: i === idx ? 'none' : undefined,
              }}
            />
          </button>
        ))}
      </div>

      <div className="h-[420px] sm:h-[520px] relative">
        {slides.map((sl, i) => (
          <div
            key={sl.id}
            className={`absolute inset-0 transition-opacity duration-500 ${i === idx ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}
          >
            {sl.render(i === idx)}
          </div>
        ))}
      </div>

      {/* Controls */}
      <button
        aria-label="Previous slide"
        onClick={() => setIdx((idx - 1 + slides.length) % slides.length)}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/30 hover:bg-black/50 text-white p-2 backdrop-blur-sm transition"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        aria-label="Next slide"
        onClick={() => setIdx((idx + 1) % slides.length)}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 rounded-full bg-black/30 hover:bg-black/50 text-white p-2 backdrop-blur-sm transition"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      <button
        aria-label={paused ? 'Play' : 'Pause'}
        onClick={() => setPaused((p) => !p)}
        className="absolute bottom-3 right-3 z-20 rounded-full bg-black/30 hover:bg-black/50 text-white p-2 backdrop-blur-sm transition"
      >
        {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </button>
    </div>
  );
}

/* ── Brand reel — video-like Ken Burns loop built from brand imagery ───── */

function BrandReel({ tier }: { tier: Tier }) {
  const { data } = useQuery({
    queryKey: ['brand-reel', tier.ssId],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/products/colors/${tier.ssId}`);
      if (!res.ok) return [] as string[];
      const d = await res.json();
      const imgs = (d.colors ?? [])
        .map((c: { image?: string }) => fixCdn(c.image))
        .filter(Boolean) as string[];
      // Sample up to 8 evenly across the color range for variety
      if (imgs.length <= 8) return imgs;
      const step = imgs.length / 8;
      return Array.from({ length: 8 }, (_, i) => imgs[Math.floor(i * step)]!);
    },
  });
  const frames = data && data.length > 0 ? data : [tier.heroImg];
  const [paused, setPaused] = useState(false);
  const [idx] = useAutoAdvance(frames.length, 2800, paused);

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[4/5] group"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {frames.map((f, i) => (
        <img
          key={f}
          src={f}
          alt={`${tier.brand} ${tier.styleName}`}
          loading={i === 0 ? 'eager' : 'lazy'}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${i === idx ? 'opacity-100' : 'opacity-0'}`}
          style={{
            animation: i === idx && !paused ? 'tsbKenBurns 3.2s ease-out forwards' : 'none',
          }}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
        <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: tier.accentSoft }}>{tier.key} tier</p>
        <p className="text-white font-black text-lg leading-tight">{tier.brand} {tier.style}</p>
        <p className="text-gray-300 text-xs">{tier.styleName}</p>
      </div>
      {/* frame counter dots */}
      <div className="absolute top-3 right-3 flex gap-1">
        {frames.map((_, i) => (
          <span key={i} className={`h-1.5 w-1.5 rounded-full transition ${i === idx ? 'bg-white' : 'bg-white/40'}`} />
        ))}
      </div>
    </div>
  );
}

/* ── Catalogue tabs ────────────────────────────────────────────────────── */

type CatalogProduct = {
  id: number;
  ss_id?: string;
  name: string;
  brand: string;
  category?: string;
  image_url?: string;
  style_number?: string;
};

function BrandCatalogue() {
  const [brand, setBrand] = useState(TIERS[1]!.brand);
  const [limit, setLimit] = useState(12);
  const { data, isLoading } = useQuery({
    queryKey: ['tier-catalogue', brand],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/products?brand=${encodeURIComponent(brand)}&limit=100`);
      if (!res.ok) throw new Error('catalogue fetch failed');
      return res.json() as Promise<{ products: CatalogProduct[]; total: number }>;
    },
  });
  const products = data?.products ?? [];
  const tier = TIERS.find((t) => t.brand === brand)!;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {TIERS.map((t) => (
          <button
            key={t.brand}
            onClick={() => { setBrand(t.brand); setLimit(12); }}
            className={`rounded-full px-4 py-2 text-sm font-black transition ${
              brand === t.brand ? 'text-white shadow-md' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            style={brand === t.brand ? { background: t.accent } : undefined}
          >
            {t.brand}
            {data && brand === t.brand ? ` · ${data.total}` : ''}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {isLoading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-gray-100 animate-pulse aspect-[4/5]" />
          ))}
        {products.slice(0, limit).map((p) => (
          <Link
            key={p.id}
            to={`/shop?search=${encodeURIComponent(`${p.brand} ${p.style_number ?? p.name}`)}`}
            className="group rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition"
          >
            <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
              {p.image_url ? (
                <img
                  src={fixCdn(p.image_url)}
                  alt={p.name}
                  loading="lazy"
                  className="w-full h-full object-contain p-3 group-hover:scale-105 transition-transform"
                />
              ) : (
                <Shirt className="h-10 w-10 text-gray-300" />
              )}
            </div>
            <div className="p-3">
              <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: tier.accent }}>
                {p.style_number || p.brand}
              </p>
              <p className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{p.name}</p>
              {p.category && <p className="mt-0.5 text-xs text-gray-500">{p.category}</p>}
            </div>
          </Link>
        ))}
      </div>

      {products.length > limit && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setLimit((l) => l + 12)}
            className="rounded-full border-2 px-6 py-2.5 font-black text-sm transition hover:text-white"
            style={{ borderColor: tier.accent, color: tier.accent }}
            onMouseEnter={(e) => { e.currentTarget.style.background = tier.accent; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = tier.accent; }}
          >
            Show more {brand} ({products.length - limit} left)
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

const STAT_ROWS: { label: string; icon: typeof Scale; get: (t: Tier) => string }[] = [
  { label: 'Fabric weight', icon: Scale, get: (t) => t.weight },
  { label: 'Material', icon: Shirt, get: (t) => t.fabric },
  { label: 'Fit', icon: Ruler, get: (t) => t.fit },
  { label: 'Hand feel', icon: Feather, get: (t) => t.feel },
  { label: 'Prints well with', icon: Printer, get: () => 'Screen print · DTF · Embroidery' },
  { label: 'Best for', icon: Check, get: (t) => t.bestFor },
];

export default function QualityTiersPage() {
  const [qty, setQty] = useState(24);
  const { data: prices } = useTierPrices(qty);
  const { data: deckPrices } = useTierPrices(24);

  return (
    <Layout>
      <Seo
        title="Compare Our T-Shirt Tiers — Gildan vs Next Level vs Comfort Colors"
        description="See the three quality tiers TShirt Brothers prints on — Gildan Heavy Cotton, Next Level CVC, and Comfort Colors garment-dyed — with live per-shirt pricing."
        path="/compare"
      />
      <style>{`
        @keyframes tsbKenBurns {
          from { transform: scale(1.02) translateY(0); }
          to { transform: scale(1.12) translateY(-2%); }
        }
      `}</style>

      {/* Hero */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 text-center">
          <p className="font-black uppercase tracking-[0.3em] text-orange-600 text-xs sm:text-sm">Know your shirt</p>
          <h1 className="mt-2 font-black text-3xl sm:text-6xl leading-tight" style={{ color: NAVY }}>
            Three shirts.<br className="sm:hidden" /> Three price points.
          </h1>
          <p className="mt-3 text-gray-600 text-sm sm:text-lg max-w-2xl mx-auto">
            Every custom order starts with the blank. We print on three garments that cover
            every budget — here's exactly what you get at each tier.
          </p>
        </div>

        {/* Slide deck */}
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 mt-6 sm:mt-10">
          <SlideDeck prices={deckPrices} />
        </div>
      </section>

      {/* Stat cards */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-20">
        <h2 className="font-black text-2xl sm:text-4xl text-center" style={{ color: NAVY }}>
          Side by side
        </h2>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {TIERS.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.key} className="rounded-3xl border-2 bg-white overflow-hidden shadow-sm" style={{ borderColor: t.accentSoft }}>
                <div className="p-5 flex items-center gap-3" style={{ background: t.accentSoft }}>
                  <span className="rounded-2xl p-2.5 text-white" style={{ background: t.accent }}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: t.accent }}>{t.key} tier</p>
                    <p className="font-black text-lg leading-tight" style={{ color: NAVY }}>{t.brand} {t.style}</p>
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  {STAT_ROWS.map((row) => (
                    <div key={row.label} className="flex gap-2.5 items-start">
                      <row.icon className="h-4 w-4 mt-0.5 shrink-0" style={{ color: t.accent }} />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">{row.label}</p>
                        <p className="text-sm text-gray-800">{row.get(t)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Live pricing */}
      <section className="mt-12 sm:mt-20 py-10 sm:py-16" style={{ background: NAVY }}>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-black text-2xl sm:text-4xl text-white">What would <span className="text-orange-400">your order</span> cost?</h2>
          <p className="mt-2 text-gray-300 text-sm sm:text-base">Per-shirt price with a full-color front print included. Pulled live from our quote engine.</p>
          <div className="mt-5 inline-flex rounded-full bg-white/10 p-1">
            {QTY_OPTIONS.map((q) => (
              <button
                key={q}
                onClick={() => setQty(q)}
                className={`rounded-full px-4 sm:px-5 py-2 text-sm font-black transition ${qty === q ? 'bg-orange-500 text-white' : 'text-gray-300 hover:text-white'}`}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-6">
            {TIERS.map((t) => (
              <div key={t.key} className="rounded-2xl bg-white/5 border border-white/10 p-4 sm:p-6">
                <p className="text-[10px] sm:text-xs font-black uppercase tracking-[0.2em]" style={{ color: t.accent === '#16a34a' ? '#4ade80' : t.accent === '#7c3aed' ? '#c4b5fd' : '#fdba74' }}>
                  {t.brandShort}
                </p>
                <p className="mt-1.5 text-white font-black text-xl sm:text-4xl">
                  {prices?.[t.key] != null ? `$${prices[t.key]!.toFixed(2)}` : '…'}
                </p>
                <p className="text-gray-400 text-[10px] sm:text-sm">per shirt · qty {qty}</p>
              </div>
            ))}
          </div>
          <Link
            to="/quote"
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-orange-500 hover:bg-orange-400 px-7 py-3 font-black text-white shadow-lg transition"
          >
            Build my exact quote <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* Brand reels */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-20">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="font-black text-2xl sm:text-4xl" style={{ color: NAVY }}>See the colors move</h2>
            <p className="mt-1 text-gray-600 text-sm sm:text-base">Live reels built from each brand's official color range.</p>
          </div>
          <Palette className="h-8 w-8 text-orange-500 shrink-0" />
        </div>
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
          {TIERS.map((t) => (
            <BrandReel key={t.key} tier={t} />
          ))}
        </div>
      </section>

      {/* Full catalogue */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-12 sm:mt-20 mb-16 sm:mb-24">
        <h2 className="font-black text-2xl sm:text-4xl" style={{ color: NAVY }}>The full catalogue</h2>
        <p className="mt-1 text-gray-600 text-sm sm:text-base">
          Everything we stock from all three brands — tees, fleece, headwear, and more.
        </p>
        <div className="mt-5">
          <BrandCatalogue />
        </div>
      </section>
    </Layout>
  );
}
