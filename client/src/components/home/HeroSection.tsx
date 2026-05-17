import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Palette, Clock, MapPin, Users } from 'lucide-react';

// Rotating hero — files live in DO Spaces under hero-slides/v2/ as
// public-read PNGs. Add/remove entries here to change the carousel.
const CDN = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/v2';
const HERO_SLIDES = [
  `${CDN}/tshirt-ad.png`,
  `${CDN}/team-wear.png`,
  `${CDN}/spirit-wear.png`,
  `${CDN}/family-reunion.png`,
  `${CDN}/embroidery.png`,
  `${CDN}/small-business.png`,
  `${CDN}/summer-camp.png`,
  `${CDN}/summer-essentials.png`,
  `${CDN}/cruise-ad.png`,
];

export default function HeroSection() {
  const [active, setActive] = useState(0);
  const next = useCallback(() => setActive(s => (s + 1) % HERO_SLIDES.length), []);
  useEffect(() => {
    const t = setInterval(next, 4500);
    return () => clearInterval(t);
  }, [next]);

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-3 pb-12 sm:pt-4 sm:pb-16">
        {/* lg+ : 2-column layout, text/CTAs LEFT and rotating image RIGHT
            (Custom Ink desktop hero). Below lg the layout collapses back to
            image-on-top, text-below — the mobile experience we already tuned
            and which we explicitly preserve here. */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-12 lg:items-center">

          {/* Hero image card — first in source so mobile renders it on top.
              On desktop, order-2 sends it to the right column. */}
          <div className="lg:order-2 relative overflow-hidden rounded-2xl sm:rounded-3xl shadow-sm aspect-[64/37] sm:aspect-[3/2] lg:aspect-square bg-gray-100">
            {HERO_SLIDES.map((src, i) => (
              <img
                key={src}
                src={src}
                alt=""
                aria-hidden
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === active ? 'opacity-100' : 'opacity-0'}`}
                loading={i === 0 ? 'eager' : 'lazy'}
              />
            ))}
            {/* Dot indicators */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {HERO_SLIDES.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Slide ${i + 1}`}
                  onClick={() => setActive(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-8 bg-white' : 'w-1.5 bg-white/60 hover:bg-white'}`}
                />
              ))}
            </div>
          </div>

          {/* Headline + CTAs */}
          <div className="mt-10 sm:mt-14 lg:mt-0 lg:order-1 text-center lg:text-left">
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
