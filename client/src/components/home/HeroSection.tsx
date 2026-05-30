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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-4 sm:pb-10">
        {/* lg+ : 2-column layout, text/CTAs LEFT and rotating image RIGHT.
            Mobile collapses back to image-on-top, text-below.
            items-stretch + image self-stretch makes the image card grow to
            match text column height so they read as visually paired
            instead of a short square floating next to tall text. */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-8 xl:gap-12 lg:items-center">

          {/* Hero image card — first in source so mobile renders it on top.
              At lg, aspect-[5/4] makes the card shorter than a square so
              self-center actually moves it down to sit visually paired with
              the (similarly-tall) text column instead of overflowing it. */}
          <div className="-mx-4 sm:mx-0 lg:order-2 lg:self-center relative overflow-hidden sm:rounded-3xl shadow-sm aspect-[5/4] bg-white">
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

          {/* Headline + CTAs. self-center vertically aligns the text block
              with the (now stretched) image card to its right. No max-width
              or right-padding so the text fills its column and visually
              sits flush against the gap rather than drifting left. */}
          <div className="mt-3 sm:mt-14 lg:mt-0 lg:order-1 text-center lg:text-left lg:self-center">
            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-4xl xl:text-5xl 2xl:text-6xl text-gray-900 leading-[1.1] lg:leading-[1.05] tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
            >
              <span className="whitespace-nowrap">Support Local <span className="text-orange-600">Atlanta</span>,</span>
              <span
                className="block my-1.5 sm:my-3 text-5xl sm:text-6xl md:text-7xl lg:text-5xl xl:text-6xl 2xl:text-7xl text-gray-900"
                style={{ fontFamily: "'Caveat', cursive", fontWeight: 700, letterSpacing: '0.01em' }}
              >
                Custom Printing
              </span>
              <span className="text-orange-600">Done Right.</span>
            </h1>
            <p className="mt-4 lg:mt-3 text-base sm:text-lg lg:text-base text-gray-600">
              Atlanta's custom apparel shop · Pickup in Fairburn, GA · Shipped nationwide.
            </p>

            <div className="mt-6 sm:mt-10 lg:mt-6 flex items-stretch justify-center lg:justify-start gap-2 sm:gap-3">
              <Link
                to="/quote"
                className="inline-flex flex-1 sm:flex-initial items-center justify-center rounded-xl bg-orange-600 hover:bg-orange-700 px-3 py-3 sm:px-10 sm:py-5 lg:px-6 lg:py-3.5 text-sm sm:text-xl lg:text-base font-bold text-white shadow-lg shadow-orange-600/25 transition-colors whitespace-nowrap sm:min-w-[10rem] lg:min-w-0"
              >
                Get a Free Quote
              </Link>
              <Link
                to="/design"
                className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-gray-900 hover:bg-gray-800 px-3 py-3 sm:px-10 sm:py-5 lg:px-6 lg:py-3.5 text-sm sm:text-xl lg:text-base font-bold text-white transition-colors whitespace-nowrap sm:min-w-[10rem] lg:min-w-0"
              >
                <Palette className="h-4 w-4 sm:h-6 sm:w-6 lg:h-4 lg:w-4" />
                Design Studio
              </Link>
            </div>

            <div className="mt-6 sm:mt-10 lg:mt-5 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs sm:text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-orange-500" /> No minimums</span>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-orange-500" /> 2–7 day turnaround</span>
              <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-orange-500" /> Fairburn, GA</span>
            </div>

            {/* Spanish-language toggle. Small, unobtrusive — only the
                people who need it will notice it. */}
            <p className="mt-4 text-xs text-gray-600">
              <a href="/es" className="text-orange-700 hover:underline font-semibold">
                ¿Hablas español? Ver en español →
              </a>
            </p>
          </div>

        </div>
      </div>
    </section>
  );
}
