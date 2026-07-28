import { UtensilsCrossed, PartyPopper, Cake, Users } from 'lucide-react';

// Two side-by-side spotlight bands: Eats & Treats (#eats) and Parties &
// Events (#parties) — the anchor targets for two of the hero CTAs.
export default function EatsAndParties() {
  return (
    <>
      {/* Eats & Treats */}
      <section id="eats" className="scroll-mt-24 py-14 sm:py-20 bg-fling-yellow/15">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div>
              <span className="inline-block rounded-full bg-fling-orange/15 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-fling-orange">
                Eats &amp; Treats
              </span>
              <h2
                className="mt-3 text-3xl sm:text-4xl text-fling-ink tracking-tight"
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700 }}
              >
                Delicious Food Truck Bites
              </h2>
              <p className="mt-3 text-gray-700 leading-relaxed">
                All that swinging and flinging works up an appetite. Refuel with
                rotating food trucks, cold drinks, and sweet treats — no need to
                leave the fun to grab a bite.
              </p>
              <ul className="mt-5 space-y-2 text-sm font-semibold text-gray-800">
                <li className="flex items-center gap-2"><UtensilsCrossed className="h-4 w-4 text-fling-orange" /> Rotating local food trucks</li>
                <li className="flex items-center gap-2"><Cake className="h-4 w-4 text-fling-pink" /> Snacks, treats &amp; cold drinks</li>
                <li className="flex items-center gap-2"><Users className="h-4 w-4 text-fling-green" /> Plenty of seating for the whole group</li>
              </ul>
            </div>
            <div className="flex items-center justify-center">
              <div className="grid grid-cols-2 gap-4 text-6xl sm:text-7xl">
                {['🍔', '🌮', '🍟', '🥤', '🍦', '🍕'].map((e, i) => (
                  <span key={i} className="flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-3xl bg-white shadow-md">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Parties & Events */}
      <section id="parties" className="scroll-mt-24 py-14 sm:py-20 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-fling-pink via-fling-purple to-fling-blue p-8 sm:p-12 text-center text-white shadow-2xl">
            <PartyPopper className="mx-auto h-10 w-10 text-fling-yellow" />
            <h2
              className="mt-3 text-3xl sm:text-4xl tracking-tight"
              style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700 }}
            >
              Book Your Party or Event
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-white/95">
              Birthdays, team-building outings, date nights, and group
              celebrations — Swing &amp; Fling is South Atlanta&rsquo;s go-to spot
              for a day nobody forgets. Tell us what you&rsquo;re planning and
              we&rsquo;ll help you pull it off.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="tel:+14706221392"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-7 py-4 text-base font-extrabold text-fling-purple shadow-xl transition-transform hover:-translate-y-0.5 hover:bg-fling-yellow hover:text-fling-ink"
              >
                <PartyPopper className="h-5 w-5" />
                Start Planning
              </a>
              <a
                href="sms:+14706221392"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-fling-ink/30 px-7 py-4 text-base font-extrabold text-white ring-1 ring-white/40 transition-transform hover:-translate-y-0.5 hover:bg-fling-ink/50"
              >
                <Users className="h-5 w-5" />
                Ask About Group Rates
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
