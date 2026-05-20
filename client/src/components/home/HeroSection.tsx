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
const FALLBACK_SLIDES: HeroSlide[] = [
  { id: 0, image_url: 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2/tshirt-ad.png', label: null, link_url: null },
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-0 pb-3 sm:pt-4 sm:pb-16">
        {/* lg+ : 2-column layout, text/CTAs LEFT and rotating image RIGHT
            (Custom Ink desktop hero). Below lg the layout collapses back to
            image-on-top, text-below — the mobile experience we already tuned
            and which we explicitly preserve here. */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">

          {/* Hero image card — first in source so mobile renders it on top.
              On desktop, order-2 sends it to the right column. */}
          <div className="lg:order-2 relative overflow-hidden rounded-2xl sm:rounded-3xl shadow-sm aspect-square bg-white">
            {slides.map((s, i) => {
              const img = (
                <img
                  src={s.image_url}
                  alt={s.label || ''}
                  className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-1000 ${i === active ? 'opacity-100' : 'opacity-0'}`}
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
              );
              // Admin-set link_url makes the slide clickable; otherwise it's
              // a static image so the rotator dots can still steal focus.
              return s.link_url ? (
                <a key={s.id} href={s.link_url} className="absolute inset-0" aria-label={s.label || `Slide ${i + 1}`}>{img}</a>
              ) : (
                <div key={s.id}>{img}</div>
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

          {/* Headline + CTAs */}
          <div className="mt-1 sm:mt-14 lg:mt-0 lg:order-1 text-center lg:text-left">
            <h1
              className="text-4xl sm:text-5xl md:text-6xl lg:text-6xl xl:text-7xl text-gray-900 leading-[1.05] tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
            >
              Custom Apparel,<br />
              <span className="text-orange-500">Done Right.</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-gray-600">
              Local pickup in Fairburn, GA · Shipped nationwide.
            </p>

            <div className="mt-8 sm:mt-10 flex items-stretch justify-center lg:justify-start gap-2 sm:gap-3">
              <Link
                to="/quote"
                className="inline-flex flex-1 sm:flex-initial items-center justify-center rounded-xl bg-orange-500 hover:bg-orange-600 px-3 py-3 sm:px-10 sm:py-5 text-sm sm:text-xl font-bold text-white shadow-lg shadow-orange-500/25 transition-colors whitespace-nowrap sm:min-w-[10rem]"
              >
                Get a Free Quote
              </Link>
              <Link
                to="/design"
                className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-gray-900 hover:bg-gray-800 px-3 py-3 sm:px-10 sm:py-5 text-sm sm:text-xl font-bold text-white transition-colors whitespace-nowrap sm:min-w-[10rem]"
              >
                <Palette className="h-4 w-4 sm:h-6 sm:w-6" />
                Design Studio
              </Link>
            </div>

            <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 text-xs sm:text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-orange-500" /> No minimums</span>
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-orange-500" /> 2–7 day turnaround</span>
              <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-orange-500" /> Fairburn, GA</span>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
