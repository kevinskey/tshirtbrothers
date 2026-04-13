import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Star, MapPin, Clock, Shield, Truck, Users, Heart, Ship, Trophy, Briefcase, Sun, GraduationCap, Music, Church, Palette } from 'lucide-react';

const CDN = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/hero-slides';
const HERO_SLIDES = [
  { icon: Heart, label: 'Memorial & Funeral Shirts', desc: 'Honor loved ones with custom tribute tees', color: 'bg-purple-500', img: `${CDN}/memorial-funeral.png?v=2` },
  { icon: Ship, label: 'Cruise & Vacation Shirts', desc: 'Matching group shirts for your next trip', color: 'bg-blue-500', img: `${CDN}/cruise-vacation.png?v=2` },
  { icon: Trophy, label: 'Sports Teams & Jerseys', desc: 'Custom uniforms for every league and sport', color: 'bg-green-500', img: `${CDN}/sports-jerseys.png?v=2` },
  { icon: Briefcase, label: 'Small Business Polos & Tees', desc: 'Professional branded apparel for your team', color: 'bg-gray-700', img: `${CDN}/small-business.png?v=2` },
  { icon: Sun, label: 'Summer Camp Shirts', desc: 'Fun designs for camps, VBS & youth groups', color: 'bg-yellow-500', img: `${CDN}/summer-camp.png?v=2` },
  { icon: GraduationCap, label: 'School & Class Shirts', desc: 'Spirit wear, field day & graduation tees', color: 'bg-red-500', img: `${CDN}/school-class.png?v=2` },
  { icon: Music, label: 'Event & Concert Merch', desc: 'Custom merch for festivals, shows & events', color: 'bg-pink-500', img: `${CDN}/event-concert.png?v=2` },
  { icon: Church, label: 'Church & Ministry Apparel', desc: 'Shirts for outreach, retreats & ministries', color: 'bg-indigo-500', img: `${CDN}/church-ministry.png?v=2` },
  { icon: Users, label: 'Family Reunion Shirts', desc: 'Bring the family together in matching gear', color: 'bg-orange-600', img: `${CDN}/family-reunion.png?v=2` },
];

const SERVICE_CITIES = [
  'Tyrone', 'Fairburn', 'Fayetteville', 'Peachtree City', 'Newnan',
  'Palmetto', 'Union City', 'Jonesboro', 'McDonough', 'Riverdale',
  'College Park', 'East Point', 'Hapeville', 'Senoia', 'Brooks',
];

export default function HeroSection() {
  const [activeSlide, setActiveSlide] = useState(0);
  const nextSlide = useCallback(() => setActiveSlide(s => (s + 1) % HERO_SLIDES.length), []);

  useEffect(() => {
    const timer = setInterval(nextSlide, 3500);
    return () => clearInterval(timer);
  }, [nextSlide]);

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-white via-orange-50 to-orange-100 relative overflow-hidden">
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, black 1px, transparent 0)', backgroundSize: '40px 40px' }} />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-6 sm:pt-4 sm:pb-8 md:pt-6 md:pb-10 lg:pt-8 lg:pb-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text */}
            <div>
              {/* Local badge */}
              <div className="inline-flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 text-orange-600 text-xs sm:text-sm font-semibold px-3 py-1 sm:px-4 sm:py-1.5 rounded-full mb-4 sm:mb-6">
                <MapPin className="h-4 w-4" />
                Proudly Serving South Atlanta Since 2011
              </div>

              <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-[3.4rem] font-bold text-gray-900 mb-4 md:mb-5 leading-[1.15]">
                Your Local
                <br />
                <span className="text-orange-500">Custom Print Shop</span>
                <br />
                in Fairburn, GA
              </h1>

              <p className="text-gray-600 text-base md:text-lg lg:text-xl mb-4 max-w-lg leading-relaxed">
                Screen printing, DTF transfers, embroidery & more for businesses, schools, churches, and teams. Local pickup in Fairburn, GA or <strong className="text-gray-900">shipped nationwide</strong> to your door.
              </p>

              {/* Google Reviews */}
              <div className="flex items-center gap-2 mb-3 sm:mb-5">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <span className="text-gray-900 font-bold text-sm sm:text-base">5.0</span>
                <span className="text-gray-500 text-xs sm:text-sm">· 42 reviews on Google</span>
              </div>

              {/* Turnaround */}
              <p className="text-xs sm:text-sm text-gray-500 mb-4 sm:mb-6 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-orange-500" />
                Most local orders ready in 2–7 business days
              </p>

              {/* CTA buttons */}
              <div className="flex flex-row gap-2 sm:gap-3 items-center flex-wrap">
                <Link
                  to="/quote"
                  className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 sm:px-8 sm:py-3.5 rounded-lg transition-colors shadow-lg shadow-orange-500/25 text-sm sm:text-lg"
                >
                  Get a Free Quote
                </Link>
                <Link
                  to="/design"
                  className="inline-flex items-center justify-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white font-bold px-5 py-2.5 sm:px-8 sm:py-3.5 rounded-lg transition-colors text-sm sm:text-lg"
                >
                  <Palette className="h-4 w-4 sm:h-5 sm:w-5" />
                  Design Studio
                </Link>
              </div>

              {/* Quick local stats */}
              <div className="mt-5 sm:mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><Truck className="h-4 w-4 text-orange-500" /> Ships Nationwide</span>
                <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-orange-500" /> Fast Turnaround</span>
                <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-orange-500" /> Local Pickup Available</span>
                <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-orange-500" /> No Minimums</span>
              </div>
            </div>

            {/* Right: Sliding use-case cards */}
            <div className="flex justify-center lg:justify-end">
              <div className="w-full lg:max-w-lg xl:max-w-xl space-y-4">
                {/* Main slide */}
                <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-gray-200 bg-white">
                    {HERO_SLIDES.map((slide, i) => (
                    <img
                      key={i}
                      src={slide.img}
                      alt={slide.label}
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === activeSlide ? 'opacity-100' : 'opacity-0'}`}
                    />
                  ))}
                  <div className="w-full aspect-[4/3]" />
                  {/* Slide overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <div className="flex items-center gap-3" key={activeSlide}>
                      <div className={`h-12 w-12 ${HERO_SLIDES[activeSlide]!.color} rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg`}>
                        {(() => { const Icon = HERO_SLIDES[activeSlide]!.icon; return <Icon className="h-6 w-6 text-white" />; })()}
                      </div>
                      <div className="animate-[fadeIn_0.4s_ease-out]">
                        <p className="text-base font-bold text-white">{HERO_SLIDES[activeSlide]!.label}</p>
                        <p className="text-sm text-white/70">{HERO_SLIDES[activeSlide]!.desc}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dot indicators */}
                <div className="flex justify-center gap-1.5">
                  {HERO_SLIDES.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveSlide(i)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === activeSlide ? 'w-6 bg-orange-500' : 'w-1.5 bg-gray-300 hover:bg-gray-400'
                      }`}
                    />
                  ))}
                </div>

                {/* Mini cards grid — show 3 upcoming slides */}
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map(offset => {
                    const idx = (activeSlide + offset) % HERO_SLIDES.length;
                    const slide = HERO_SLIDES[idx]!;
                    const Icon = slide.icon;
                    return (
                      <button
                        key={idx}
                        onClick={() => setActiveSlide(idx)}
                        className="flex items-center gap-2 bg-white rounded-lg p-2.5 shadow-sm ring-1 ring-gray-100 hover:ring-orange-300 transition text-left"
                      >
                        <div className={`h-8 w-8 ${slide.color} rounded-lg flex items-center justify-center flex-shrink-0`}>
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <span className="text-[11px] font-semibold text-gray-700 leading-tight line-clamp-2">{slide.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust badges + Service area */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {[
              { icon: Shield, label: '100% Satisfaction Guarantee' },
              { icon: MapPin, label: 'Local Pickup in Fairburn, GA' },
              { icon: Clock, label: 'Fast 2-7 Day Turnaround' },
              { icon: Truck, label: 'Free Shipping on Large Orders' },
            ].map((badge) => (
              <div
                key={badge.label}
                className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700"
              >
                <badge.icon className="h-5 w-5 text-orange-500 flex-shrink-0" />
                <span>{badge.label}</span>
              </div>
            ))}
          </div>
          {/* Service area cities */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-3 border-t border-gray-100">
            <span className="text-xs font-semibold text-gray-500 mr-1">Serving:</span>
            {SERVICE_CITIES.map((city) => (
              <span key={city} className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{city}</span>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
