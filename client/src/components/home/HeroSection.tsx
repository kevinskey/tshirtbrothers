// Landing hero — "Custom Apparel Made Easy." model (2026-09 redesign):
// headline + trust icons with the rotating poster beside it, then three
// action cards (Quick Quote / Design Studio / DTF Transfers), a shop-by-
// category tile row, and the dark trust bar. Mobile-first: everything
// stacks in that order on phones.
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Truck, Tag, ShieldCheck, Clock, MapPin, Users, ChevronRight,
  FileText, Palette, Film, Shirt, GraduationCap, ShoppingBag as BagIcon,
} from 'lucide-react';

interface HeroSlide {
  id: number;
  image_url: string;
  label: string | null;
  link_url: string | null;
}

// Default fallback so the page never renders a totally empty hero — if
// the API is unreachable or has zero active rows, we still show one slide.
const FALLBACK_WEBP =
  'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v4/spirit-wear.webp';
const FALLBACK_SLIDES: HeroSlide[] = [
  { id: 0, image_url: FALLBACK_WEBP, label: 'Spirit Wear', link_url: null },
];

const avifFor = (url: string) =>
  /\/hero-slides\/v[34]\/[^/]+\.webp$/.test(url) ? url.replace(/\.webp$/, '.avif') : null;

// Shop-by-category tiles — labels match the retail categories the
// /api/products filter understands.
const CATEGORY_TILES = [
  { label: 'T-Shirts',    param: 'T-Shirts',             icon: Shirt },
  { label: 'Hoodies',     param: 'Hoodies',              icon: GraduationCap },
  { label: 'Hats',        param: 'Headwear',             icon: Tag },
  { label: 'Polos',       param: 'Polos',                icon: Shirt },
  { label: 'Bags',        param: 'Bags',                 icon: BagIcon },
  { label: 'Sweatshirts', param: 'Crewneck Sweatshirts', icon: Shirt },
];

export default function HeroSection() {
  const { data } = useQuery<{ slides: HeroSlide[] }>({
    queryKey: ['hero-slides'],
    queryFn: async () => {
      const r = await fetch('/api/hero-slides');
      if (!r.ok) return { slides: [] };
      return r.json();
    },
    staleTime: 60_000,
  });
  const slides = data?.slides && data.slides.length > 0 ? data.slides : FALLBACK_SLIDES;

  const [active, setActive] = useState(0);
  const next = useCallback(() => setActive((s) => (s + 1) % slides.length), [slides.length]);
  useEffect(() => {
    if (active >= slides.length) setActive(0);
  }, [slides.length, active]);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(next, 7000);
    return () => clearInterval(t);
  }, [next, slides.length]);

  return (
    <section className="bg-white">
      {/* ── Headline + poster ─────────────────────────────────────────── */}
      <div className="bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-10 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center">
          <div>
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl leading-[1.02] tracking-tight text-gray-900"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
            >
              Custom Apparel<br />
              <span className="text-orange-600">Made Easy.</span>
            </h1>
            <p className="mt-3 text-lg sm:text-xl text-gray-700">
              Quality printing. Fast turnaround. No minimums.
            </p>

            <div className="mt-6 grid grid-cols-3 max-w-md divide-x divide-gray-200 text-center">
              <div className="px-2">
                <Truck className="h-7 w-7 mx-auto text-gray-800" />
                <p className="mt-1.5 text-xs sm:text-sm text-gray-600 leading-tight">2–7 Day<br />Turnaround</p>
              </div>
              <div className="px-2">
                <Tag className="h-7 w-7 mx-auto text-gray-800" />
                <p className="mt-1.5 text-xs sm:text-sm text-gray-600 leading-tight">Competitive<br />Pricing</p>
              </div>
              <div className="px-2">
                <ShieldCheck className="h-7 w-7 mx-auto text-gray-800" />
                <p className="mt-1.5 text-xs sm:text-sm text-gray-600 leading-tight">Nationwide<br />Shipping</p>
              </div>
            </div>
          </div>

          {/* Rotating poster (admin hero slides) */}
          <div className="relative overflow-hidden rounded-3xl shadow-sm aspect-[4/5] sm:max-w-[26rem] sm:mx-auto lg:max-w-none w-full bg-white">
            {slides.map((s, i) => {
              const avif = avifFor(s.image_url);
              const img = (
                <img
                  src={s.image_url}
                  alt={s.label || ''}
                  width={1200}
                  height={1500}
                  className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000 ${i === active ? 'opacity-100' : 'opacity-0'}`}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding={i === 0 ? 'sync' : 'async'}
                />
              );
              const picture = avif ? (
                <picture>
                  <source type="image/avif" srcSet={avif} />
                  {img}
                </picture>
              ) : img;
              return s.link_url ? (
                <a key={s.id} href={s.link_url} className="absolute inset-0" aria-label={s.label || `Slide ${i + 1}`}>{picture}</a>
              ) : (
                <div key={s.id}>{picture}</div>
              );
            })}
            {slides.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    aria-label={`Slide ${i + 1}`}
                    onClick={() => setActive(i)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-8 bg-white shadow' : 'w-1.5 bg-white/60 hover:bg-white'}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Action cards ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <Link to="/quote"
            className="group rounded-2xl bg-orange-600 text-white p-5 flex flex-col justify-between shadow-sm transition hover:shadow-lg hover:-translate-y-0.5">
            <FileText className="h-9 w-9" />
            <div className="mt-4 flex items-end justify-between gap-2">
              <div>
                <p className="text-xl font-black">Quick Quote</p>
                <p className="mt-1 text-sm text-orange-100">Choose a product and quantity to see pricing.</p>
              </div>
              <ChevronRight className="h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link to="/design"
            className="group rounded-2xl bg-gray-900 text-white p-5 flex flex-col justify-between shadow-sm transition hover:shadow-lg hover:-translate-y-0.5">
            <Palette className="h-9 w-9" />
            <div className="mt-4 flex items-end justify-between gap-2">
              <div>
                <p className="text-xl font-black">Design Studio</p>
                <p className="mt-1 text-sm text-gray-300">Create or upload your design.</p>
              </div>
              <ChevronRight className="h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>

          <Link to="/dtf"
            className="group rounded-2xl bg-gray-100 text-gray-900 p-5 flex flex-col justify-between shadow-sm transition hover:shadow-lg hover:-translate-y-0.5">
            <Film className="h-9 w-9" />
            <div className="mt-4 flex items-end justify-between gap-2">
              <div>
                <p className="text-xl font-black">DTF Transfers</p>
                <p className="mt-1 text-sm text-gray-600">Gang sheets from $9/ft — press them anywhere.</p>
              </div>
              <ChevronRight className="h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </div>

        {/* ── Shop by category ────────────────────────────────────────── */}
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-3">
          {CATEGORY_TILES.map((c) => {
            const Icon = c.icon;
            return (
              <Link key={c.label} to={`/shop?category=${encodeURIComponent(c.param)}`}
                className="rounded-2xl bg-gray-50 border border-gray-100 p-4 text-center transition hover:border-orange-300 hover:bg-orange-50">
                <Icon className="h-8 w-8 mx-auto text-gray-800" />
                <p className="mt-2 text-xs sm:text-sm font-semibold text-gray-800">{c.label}</p>
              </Link>
            );
          })}
        </div>

        {/* ── Trust bar ───────────────────────────────────────────────── */}
        <div className="mt-4 rounded-2xl bg-gray-900 text-white px-4 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
          <span className="flex items-center gap-2"><Users className="h-4 w-4" /> No Minimums</span>
          <span className="flex items-center gap-2"><Truck className="h-4 w-4" /> Nationwide Shipping</span>
          <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> 2–7 Day Turnaround</span>
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-gray-600">
          <MapPin className="h-4 w-4 text-orange-500" /> Fairburn, GA
        </p>
        <p className="mt-1 pb-2 text-center text-sm">
          <a href="/es" className="font-bold text-orange-700 hover:underline">
            ¿Hablas español? Ver en español →
          </a>
        </p>
      </div>
    </section>
  );
}
