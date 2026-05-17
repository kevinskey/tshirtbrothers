import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Palette, Clock, MapPin, Users } from 'lucide-react';

const CDN = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides';
// Rotating background images — same set we already had, just used as a
// full-bleed backdrop now instead of a sidebar carousel.
const HERO_IMAGES = [
  `${CDN}/family-reunion.png?v=2`,
  `${CDN}/sports-jerseys.png?v=2`,
  `${CDN}/small-business.png?v=2`,
  `${CDN}/school-class.png?v=2`,
  `${CDN}/event-concert.png?v=2`,
  `${CDN}/church-ministry.png?v=2`,
];

export default function HeroSection() {
  const [activeImg, setActiveImg] = useState(0);
  const nextImg = useCallback(() => setActiveImg(s => (s + 1) % HERO_IMAGES.length), []);
  useEffect(() => {
    const t = setInterval(nextImg, 4500);
    return () => clearInterval(t);
  }, [nextImg]);

  return (
    <section className="relative isolate overflow-hidden bg-gray-900">
      {/* Rotating background images */}
      {HERO_IMAGES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === activeImg ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
      {/* Dark overlay for readable text */}
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900/70 via-gray-900/50 to-gray-900/80" />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28 md:py-36 text-center">
        <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight">
          Custom Apparel, <span className="text-orange-400">Done Right.</span>
        </h1>
        <p className="mt-6 text-base sm:text-lg md:text-xl text-gray-200 max-w-2xl mx-auto">
          Local pickup in Fairburn, GA · Shipped nationwide.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/quote"
            className="inline-flex items-center justify-center rounded-lg bg-orange-500 hover:bg-orange-600 px-8 py-4 text-base sm:text-lg font-bold text-white shadow-lg shadow-orange-500/30 transition-colors"
          >
            Get a Free Quote
          </Link>
          <Link
            to="/design"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 backdrop-blur ring-1 ring-white/30 hover:bg-white/20 px-8 py-4 text-base sm:text-lg font-bold text-white transition-colors"
          >
            <Palette className="h-5 w-5" />
            Design Studio
          </Link>
        </div>

        {/* Small signals strip, replaces the wall of stats we used to render. */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm text-gray-200">
          <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-orange-300" /> No minimums</span>
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-orange-300" /> 2–7 day turnaround</span>
          <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-orange-300" /> Fairburn, GA</span>
        </div>

        {/* Dot indicators for the rotating bg */}
        <div className="mt-10 flex items-center justify-center gap-1.5">
          {HERO_IMAGES.map((_, i) => (
            <button
              key={i}
              aria-label={`Slide ${i + 1}`}
              onClick={() => setActiveImg(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === activeImg ? 'w-8 bg-orange-400' : 'w-1.5 bg-white/40 hover:bg-white/70'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
