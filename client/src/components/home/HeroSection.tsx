import { Link } from 'react-router-dom';
import { Palette, Clock, MapPin, Users } from 'lucide-react';

// Single hero image — point this at the uploaded file in DO Spaces.
// Replace with the actual CDN URL once the file is uploaded.
const HERO_IMG = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides/hero-main.jpg';

export default function HeroSection() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-3 pb-12 sm:pt-4 sm:pb-16">
        {/* Hero card */}
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl shadow-sm aspect-[4/3] sm:aspect-[3/2] bg-gray-100">
          <img
            src={HERO_IMG}
            alt="Custom apparel"
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
          />
        </div>

        {/* Headline + CTAs below the photo */}
        <div className="mt-10 sm:mt-14 text-center">
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-gray-900 leading-[1.05] tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            Custom Apparel, <span className="text-orange-500">Done Right.</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg text-gray-600">
            Local pickup in Fairburn, GA · Shipped nationwide.
          </p>

          <div className="mt-8 sm:mt-10 flex flex-wrap items-stretch justify-center gap-3">
            <Link
              to="/quote"
              className="inline-flex items-center justify-center rounded-xl bg-orange-500 hover:bg-orange-600 px-8 py-4 sm:px-10 sm:py-5 text-lg sm:text-xl font-bold text-white shadow-lg shadow-orange-500/25 transition-colors min-w-[10rem]"
            >
              Get a Free Quote
            </Link>
            <Link
              to="/design"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 hover:bg-gray-800 px-8 py-4 sm:px-10 sm:py-5 text-lg sm:text-xl font-bold text-white transition-colors min-w-[10rem]"
            >
              <Palette className="h-5 w-5 sm:h-6 sm:w-6" />
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
