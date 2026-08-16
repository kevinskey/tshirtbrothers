import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Palette, Clock, MapPin, Users } from 'lucide-react';

interface HeroSlide {
  id: number;
  image_url: string;
  label: string | null;
  link_url: string | null;
}

// Default fallback so the page never renders a totally empty hero — if
// the API is unreachable or has zero active rows, we still show one slide.
// v3 is the optimized 1440×960 WebP (~94 KiB, down from a 2,189 KiB PNG)
// — see server/scripts/optimize-hero-image.js for how it's generated.
const FALLBACK_WEBP =
  'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v3/tshirt-ad.webp';
// Companion AVIF for the fallback; <picture> will prefer it when supported.
const FALLBACK_AVIF =
  'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v3/tshirt-ad.avif';
const FALLBACK_SLIDES: HeroSlide[] = [
  { id: 0, image_url: FALLBACK_WEBP, label: null, link_url: null },
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
  const next = useCallback(() => setActive(s => (s + 1) % slides.length), [slides.length]);
  useEffect(() => {
    // Clamp active when slide list shrinks (e.g. admin deleted some).
    if (active >= slides.length) setActive(0);
  }, [slides.length, active]);
  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(next, 7000);
    return () => clearInterval(t);
  }, [next, slides.length]);

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-2 pb-6 sm:pt-4 sm:pb-10">
        {/* lg+ : 2-column layout, text/CTAs LEFT and rotating image RIGHT.
            Below lg the TEXT block renders first so the headline and the
            two CTA buttons sit above the fold on phones; the slide image
            follows. (Source order = mobile order; the lg grid auto-places
            text into column 1 and image into column 2.) */}
        {/* Asymmetric 5/7 split — the text column only needs ~5 columns,
            so giving the image the rest closes the dead gap between them
            on wide desktops. */}
        {/* Desktop: three columns — headline / product slide / DTF card —
            so the transfer service is visible without scrolling. Below lg
            the DTF card hides (the DtfPromo band covers phones). */}
        <div className="lg:grid lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,3fr)] lg:gap-5 xl:gap-6 lg:items-stretch">

          {/* Headline + CTAs — first in source so phones lead with the
              actions, not the promo slide. self-center vertically aligns
              the text block with the image card to its right on lg. */}
          <div className="text-center lg:text-left lg:self-center">
            <h1
              className="text-3xl sm:text-4xl md:text-5xl lg:text-4xl xl:text-5xl 2xl:text-6xl text-gray-900 leading-[1.1] lg:leading-[1.05] tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
            >
              {/* Fluid size below sm: clamp() keeps this nowrap line inside
                  a 390px phone. Scale runs one step below the old sizing so
                  the hero doesn't dwarf the header at stacked widths. */}
              <span className="whitespace-nowrap text-[clamp(1.375rem,7vw,1.875rem)] sm:text-4xl md:text-5xl lg:text-4xl xl:text-5xl 2xl:text-6xl">Support Local <span className="text-orange-600">Atlanta</span>,</span>
              <span
                className="block my-1 sm:my-2 text-4xl sm:text-5xl md:text-6xl lg:text-5xl xl:text-6xl 2xl:text-7xl text-gray-900"
                style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, letterSpacing: '0.01em' }}
              >
                Custom Printing
              </span>
              <span className="text-orange-600">Done Right.</span>
            </h1>
            <p className="mt-2 sm:mt-3 text-sm sm:text-base text-gray-600">
              Now Shipping Nationwide!
            </p>

            <div className="mt-4 sm:mt-6 flex items-stretch justify-center lg:justify-start gap-2 sm:gap-3">
              <Link
                to="/quote"
                className="inline-flex flex-1 sm:flex-initial items-center justify-center rounded-xl bg-orange-700 hover:bg-orange-800 px-3 py-3 sm:px-8 sm:py-3.5 text-sm sm:text-lg lg:text-base font-bold text-white shadow-lg shadow-orange-700/25 transition-colors whitespace-nowrap sm:min-w-[10rem] lg:min-w-0"
              >
                Get a Free Quote
              </Link>
              <Link
                to="/design"
                className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-gray-900 hover:bg-gray-800 px-3 py-3 sm:px-8 sm:py-3.5 text-sm sm:text-lg lg:text-base font-bold text-white transition-colors whitespace-nowrap sm:min-w-[10rem] lg:min-w-0"
              >
                <Palette className="h-4 w-4 sm:h-5 sm:w-5 lg:h-4 lg:w-4" />
                Design Studio
              </Link>
            </div>

            <div className="mt-4 sm:mt-8 lg:mt-5 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs sm:text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-orange-500" /> No minimums</span>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-orange-500" /> 2–7 day turnaround</span>
              <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-orange-500" /> Fairburn, GA</span>
            </div>

            {/* Spanish-language toggle. Small, unobtrusive — only the
                people who need it will notice it. */}
            <p className="mt-3 text-xs text-gray-600">
              <a href="/es" className="text-orange-700 hover:underline font-semibold">
                ¿Hablas español? Ver en español →
              </a>
            </p>
          </div>

          {/* Hero image card — second in source so it drops below the fold
              on phones. aspect-[3/2] matches the 1440×960 slides exactly,
              killing the white letterbox bands object-contain used to leave
              inside the old 5/4 box. */}
          <div className="mt-5 lg:mt-0 -mx-4 sm:mx-0 lg:self-center relative overflow-hidden sm:rounded-3xl shadow-sm aspect-[3/2] bg-white">
            {slides.map((s, i) => {
              // Only the fallback slide has a paired AVIF; admin-uploaded
              // slides keep working as a plain <img> for back-compat.
              const isFallback = s.image_url === FALLBACK_WEBP;
              const img = (
                <img
                  src={s.image_url}
                  alt={s.label || ''}
                  width={1440}
                  height={960}
                  className={`absolute inset-0 h-full w-full object-contain object-center transition-opacity duration-1000 ${i === active ? 'opacity-100' : 'opacity-0'}`}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding={i === 0 ? 'sync' : 'async'}
                />
              );
              const picture = isFallback ? (
                <picture>
                  <source type="image/avif" srcSet={FALLBACK_AVIF} />
                  {img}
                </picture>
              ) : img;
              // Admin-set link_url makes the slide clickable; otherwise it's
              // a static image so the rotator dots can still steal focus.
              return s.link_url ? (
                <a key={s.id} href={s.link_url} className="absolute inset-0" aria-label={s.label || `Slide ${i + 1}`}>{picture}</a>
              ) : (
                <div key={s.id}>{picture}</div>
              );
            })}
            {/* Dot indicators */}
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

          {/* DTF card — third column, desktop only. Mirrors the /dtf hero
              (film ribbon + foot ruler) so the campaign is one glance away
              without scrolling. */}
          <Link
            to="/dtf"
            className="hidden lg:flex relative flex-col justify-between overflow-hidden rounded-3xl bg-gray-900 p-6 shadow-sm transition hover:ring-2 hover:ring-orange-500"
          >
            <div className="relative z-10">
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-orange-400">New · DTF transfers</p>
              <p
                className="mt-2 font-display text-2xl font-bold uppercase leading-[0.95] tracking-tight text-white xl:text-3xl"
                style={{ fontWeight: 900 }}
              >
                We print DTF.
                <span className="block text-orange-500">By the foot.</span>
              </p>
              <p className="mt-2 text-xs leading-relaxed text-gray-300">
                22&Prime; gang sheets from $9/ft — upload art or build a sheet online.
              </p>
            </div>
            <span className="relative z-10 mt-4 inline-block w-max rounded-lg bg-orange-600 px-4 py-2 text-xs font-bold text-white">
              Order transfers →
            </span>
            {/* mini ribbon along the card's bottom */}
            <svg aria-hidden="true" viewBox="0 0 300 90" className="relative z-0 mt-5 w-full">
              <rect x="-10" y="16" width="320" height="66" rx="5" fill="#1f2937" />
              <circle cx="34" cy="50" r="15" fill="#ffffff" />
              <circle cx="34" cy="50" r="11" fill="#ec4899" />
              <rect x="62" y="34" width="46" height="26" rx="6" fill="#ffffff" />
              <rect x="66" y="38" width="38" height="18" rx="4" fill="#22d3ee" />
              <rect x="120" y="36" width="60" height="24" rx="6" fill="#ffffff" />
              <rect x="124" y="40" width="52" height="16" rx="3" fill="#111827" />
              <text x="150" y="52" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="10" fill="#ffffff" letterSpacing="1.5">TSB</text>
              <circle cx="204" cy="48" r="13" fill="#ffffff" />
              <circle cx="204" cy="48" r="9" fill="#facc15" />
              <rect x="228" y="34" width="44" height="26" rx="6" fill="#ffffff" />
              <rect x="232" y="38" width="36" height="18" rx="4" fill="#ea580c" />
              {/* foot ruler */}
              <rect x="-10" y="8" width="320" height="8" fill="#111827" />
              {[0, 1, 2].map((ft) => (
                <g key={ft}>
                  <rect x={20 + ft * 110} y="8" width="2" height="8" fill="#ea580c" />
                  <text x={28 + ft * 110} y="15" fontFamily="ui-monospace, monospace" fontSize="7" fill="#9ca3af">{ft + 1}FT</text>
                </g>
              ))}
            </svg>
          </Link>

        </div>
      </div>
    </section>
  );
}
