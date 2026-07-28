import { Flag, Target, UtensilsCrossed, CalendarCheck } from 'lucide-react';

// Swing & Fling hero — the venue's front door. Deliberately loud and
// colorful: a rainbow wordmark, a rotating cast of "people having fun"
// emoji, and three high-intent CTAs. No data fetching here — the venue
// homepage is fully static, so the old hero-slides API call is gone.

const FUN = ['⛳', '🪓', '🎯', '🍔', '🏆', '🎉', '🎟️', '🥳'];

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-fling-green via-fling-teal to-fling-blue">
      {/* Playful blurred color blobs behind the content for depth. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-fling-yellow/40 blur-3xl" />
        <div className="absolute top-10 right-0 h-80 w-80 rounded-full bg-fling-pink/30 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-fling-purple/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 pb-14 sm:pt-14 sm:pb-20 text-center">
        {/* No-reservations banner pill */}
        <div className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-xs sm:text-sm font-extrabold uppercase tracking-wide text-fling-ink shadow-lg ring-1 ring-white/50">
          <span className="text-lg leading-none">{'👋'}</span>
          No Reservations Needed &mdash; Just Swing By!
        </div>

        {/* Combined SWING &amp; FLING wordmark */}
        <h1 className="mt-6 select-none leading-[0.9]">
          <span className="sr-only">Swing &amp; Fling</span>
          <span
            aria-hidden
            className="block text-6xl sm:text-8xl lg:text-9xl tracking-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 900 }}
          >
            <span className="text-fling-yellow drop-shadow-[0_3px_0_rgba(0,0,0,0.18)]">Swing</span>
            <span className="mx-2 text-white/90">&amp;</span>
            <span className="text-fling-pink drop-shadow-[0_3px_0_rgba(0,0,0,0.18)]">Fling</span>
          </span>
        </h1>

        {/* Rotating cast of "people having fun" emoji */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-2xl sm:text-3xl">
          {FUN.map((e, i) => (
            <span
              key={i}
              className="inline-flex h-11 w-11 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-white/90 shadow-md ring-1 ring-white/60"
            >
              {e}
            </span>
          ))}
        </div>

        {/* Headline */}
        <p
          className="mx-auto mt-8 max-w-4xl text-2xl sm:text-4xl lg:text-5xl text-white leading-tight"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700 }}
        >
          Mini Golf. Axe Throwing. Good Food.{' '}
          <span className="text-fling-yellow">Unforgettable Memories.</span>
        </p>

        {/* Sub-headline */}
        <p className="mx-auto mt-4 max-w-2xl text-base sm:text-xl font-semibold text-white/95">
          South Atlanta&rsquo;s premier outdoor entertainment venue for families,
          date nights, and group celebrations.
        </p>

        {/* Paragraph */}
        <p className="mx-auto mt-4 max-w-2xl text-sm sm:text-base text-white/90 leading-relaxed">
          Ready for some fun? Swing by for 18 holes of mini-golf, axe throwing,
          ninja stars, and delicious food truck bites! Whether you&rsquo;re
          celebrating a big event or aiming for bragging rights on our famous
          Winner&rsquo;s Wall, you&rsquo;re guaranteed to leave with
          unforgettable memories.
        </p>

        {/* Action buttons */}
        <div className="mt-9 flex flex-col sm:flex-row items-stretch justify-center gap-3 sm:gap-4">
          <a
            href="#plan-visit"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 text-base sm:text-lg font-extrabold text-fling-green shadow-xl transition-transform hover:-translate-y-0.5 hover:bg-fling-yellow hover:text-fling-ink"
          >
            <Flag className="h-5 w-5" />
            Plan Your Visit
          </a>
          <a
            href="#parties"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-fling-pink px-7 py-4 text-base sm:text-lg font-extrabold text-white shadow-xl transition-transform hover:-translate-y-0.5 hover:bg-fling-purple"
          >
            <CalendarCheck className="h-5 w-5" />
            Book Your Party/Event
          </a>
          <a
            href="#eats"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-fling-orange px-7 py-4 text-base sm:text-lg font-extrabold text-white shadow-xl transition-transform hover:-translate-y-0.5 hover:bg-fling-red"
          >
            <UtensilsCrossed className="h-5 w-5" />
            Eats &amp; Treats
          </a>
        </div>

        {/* Quick highlight row */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm font-bold text-white/95">
          <span className="flex items-center gap-1.5"><Target className="h-4 w-4 text-fling-yellow" /> Axe Throwing &amp; Ninja Stars</span>
          <span className="flex items-center gap-1.5"><Flag className="h-4 w-4 text-fling-yellow" /> 18-Hole Mini Golf</span>
          <span className="flex items-center gap-1.5"><UtensilsCrossed className="h-4 w-4 text-fling-yellow" /> Food Truck Bites</span>
        </div>
      </div>
    </section>
  );
}
