import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Palette, Clock, MapPin, Users } from 'lucide-react';

const CDN = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides';
// Each slide gets a vivid solid background color so the photo card
// always contrasts against the white page (Custom Ink-style). The
// color rotates with the active image.
const HERO_SLIDES = [
  { img: `${CDN}/family-reunion.png?v=2`,   bg: 'bg-orange-500' },
  { img: `${CDN}/sports-jerseys.png?v=2`,   bg: 'bg-emerald-600' },
  { img: `${CDN}/small-business.png?v=2`,   bg: 'bg-slate-700' },
  { img: `${CDN}/school-class.png?v=2`,     bg: 'bg-rose-600' },
  { img: `${CDN}/event-concert.png?v=2`,    bg: 'bg-indigo-600' },
  { img: `${CDN}/church-ministry.png?v=2`,  bg: 'bg-violet-600' },
];

export default function HeroSection() {
  const [activeImg, setActiveImg] = useState(0);
  const nextImg = useCallback(() => setActiveImg(s => (s + 1) % HERO_SLIDES.length), []);
  useEffect(() => {
    const t = setInterval(nextImg, 4500);
    return () => clearInterval(t);
  }, [nextImg]);

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-10 sm:pt-6 sm:pb-14">
        {/* Photo card — rounded, contained. Card bg rotates through vivid
            colors so the hero always pops off the white page (Custom Ink
            purple-block style). */}
        <div className={`relative overflow-hidden rounded-2xl sm:rounded-3xl shadow-sm aspect-[16/9] sm:aspect-[2/1] transition-colors duration-1000 ${HERO_SLIDES[activeImg]!.bg}`}>
          {HERO_SLIDES.map((slide, i) => (
            <img
              key={slide.img}
              src={slide.img}
              alt=""
              aria-hidden
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === activeImg ? 'opacity-100' : 'opacity-0'}`}
            />
          ))}
          {/* Dot indicators sit inside the photo card */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {HERO_SLIDES.map((_, i) => (
              <button
                key={i}
                aria-label={`Slide ${i + 1}`}
                onClick={() => setActiveImg(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${i === activeImg ? 'w-8 bg-white' : 'w-1.5 bg-white/60 hover:bg-white'}`}
              />
            ))}
          </div>
        </div>

        {/* Text + CTAs BELOW the photo, like the Custom Ink reference */}
        <div className="mt-8 sm:mt-10 text-center">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-[1.1] tracking-tight">
            Custom Apparel, <span className="text-orange-500">Done Right.</span>
          </h1>
          <p className="mt-3 text-base sm:text-lg text-gray-600">
            Local pickup in Fairburn, GA · Shipped nationwide.
          </p>

          <div className="mt-6 sm:mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/quote"
              className="inline-flex items-center justify-center rounded-lg bg-orange-500 hover:bg-orange-600 px-7 py-3.5 sm:px-8 sm:py-4 text-base sm:text-lg font-bold text-white shadow-lg shadow-orange-500/25 transition-colors"
            >
              Get a Free Quote
            </Link>
            <Link
              to="/design"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 hover:bg-gray-800 px-7 py-3.5 sm:px-8 sm:py-4 text-base sm:text-lg font-bold text-white transition-colors"
            >
              <Palette className="h-5 w-5" />
              Design Studio
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm text-gray-500">
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-orange-500" /> No minimums</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-orange-500" /> 2–7 day turnaround</span>
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-orange-500" /> Fairburn, GA</span>
          </div>
        </div>
      </div>
    </section>
  );
}
