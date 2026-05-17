import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Palette, Clock, MapPin, Users } from 'lucide-react';

// Custom Ink-style "floating products on a colored block." We composite
// three S&S catalog product shots — hoodie / tee / polo — onto a rounded
// colored card. The product images are white-background JPGs from S&S;
// `mix-blend-multiply` makes the white drop out so each garment appears
// to float on the card.
const SS_IMG = 'https://www.ssactivewear.com/Images/Style';
const HERO_PRODUCTS = {
  hoodie: `${SS_IMG}/3946_fm.jpg`, // Comfort Colors Garment-Dyed Hooded Sweatshirt
  tee:    `${SS_IMG}/1822_fm.jpg`, // Comfort Colors Heavyweight T-Shirt
  polo:   `${SS_IMG}/223_fm.jpg`,  // Gildan DryBlend Jersey Polo
};
// Rotating background colors only — same 3 garments, vivid colors cycle.
const HERO_SLIDES = [
  { bg: 'bg-violet-600' },
  { bg: 'bg-orange-500' },
  { bg: 'bg-emerald-600' },
  { bg: 'bg-rose-600' },
  { bg: 'bg-indigo-600' },
  { bg: 'bg-slate-700' },
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
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 pb-12 sm:pt-12 sm:pb-16">
        {/* Rounded colored card with 3 floating garments (Custom Ink style).
            White product backgrounds drop out via mix-blend-multiply.
            Explicit z-index layering: bg color = card itself, products
            stack on top, soft vignette overlay sits ABOVE them but at
            low opacity so it tints rather than covers. */}
        <div className={`relative overflow-hidden rounded-2xl sm:rounded-3xl shadow-sm aspect-[16/9] sm:aspect-[2/1] transition-colors duration-1000 ${HERO_SLIDES[activeImg]!.bg}`}>
          {/* Hoodie — left, slightly back/smaller */}
          <img
            src={HERO_PRODUCTS.hoodie}
            alt=""
            aria-hidden
            className="absolute z-10 left-[8%] bottom-[6%] h-[78%] object-contain mix-blend-multiply drop-shadow-2xl rotate-[-6deg] hidden sm:block"
            loading="eager"
          />
          {/* Polo — right, slightly back/smaller */}
          <img
            src={HERO_PRODUCTS.polo}
            alt=""
            aria-hidden
            className="absolute z-10 right-[8%] bottom-[6%] h-[78%] object-contain mix-blend-multiply drop-shadow-2xl rotate-[6deg] hidden sm:block"
            loading="eager"
          />
          {/* Tee — center, hero piece, in front */}
          <img
            src={HERO_PRODUCTS.tee}
            alt="Custom apparel"
            className="absolute z-20 left-1/2 -translate-x-1/2 bottom-[4%] h-[92%] object-contain mix-blend-multiply drop-shadow-2xl"
            loading="eager"
          />
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
        <div className="mt-10 sm:mt-14 text-center">
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-[1.1] tracking-tight">
            Custom Apparel, <span className="text-orange-500">Done Right.</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-600">
            Local pickup in Fairburn, GA · Shipped nationwide.
          </p>

          <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-3">
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

          <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm text-gray-500">
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-orange-500" /> No minimums</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-orange-500" /> 2–7 day turnaround</span>
            <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-orange-500" /> Fairburn, GA</span>
          </div>
        </div>
      </div>
    </section>
  );
}
