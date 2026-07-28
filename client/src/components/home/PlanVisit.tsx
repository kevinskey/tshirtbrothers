import { Clock, MapPin, Ticket, Phone } from 'lucide-react';

// "Plan Your Visit" — the practical details, wrapped around the venue's
// signature promise: no reservations, just swing by. Address / hours are
// placeholders the owner can swap for the real venue info.
export default function PlanVisit() {
  return (
    <section id="plan-visit" className="scroll-mt-24 py-14 sm:py-20 bg-fling-ink text-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl bg-gradient-to-r from-fling-green via-fling-teal to-fling-blue p-8 sm:p-12 text-center shadow-2xl">
          <span className="text-4xl">👋</span>
          <h2
            className="mt-2 text-3xl sm:text-5xl leading-tight"
            style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 900 }}
          >
            No Reservations Needed. Just Swing By!
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-white/95 font-semibold">
            Walk-ins are always welcome. Round up your crew and come play — the
            fun starts the moment you arrive.
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6">
            <Clock className="h-7 w-7 text-fling-yellow" />
            <h3 className="mt-3 text-lg font-extrabold">Hours</h3>
            <p className="mt-1 text-sm text-white/80">
              Open daily &middot; Afternoons &amp; evenings
              <br />
              <span className="text-white/60">Call ahead for holiday hours.</span>
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6">
            <MapPin className="h-7 w-7 text-fling-pink" />
            <h3 className="mt-3 text-lg font-extrabold">Location</h3>
            <p className="mt-1 text-sm text-white/80">
              South Atlanta, GA
              <br />
              <span className="text-white/60">Free on-site parking.</span>
            </p>
          </div>
          <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-6">
            <Ticket className="h-7 w-7 text-fling-green" />
            <h3 className="mt-3 text-lg font-extrabold">Pricing</h3>
            <p className="mt-1 text-sm text-white/80">
              Per-activity &amp; combo passes
              <br />
              <span className="text-white/60">Group rates available.</span>
            </p>
          </div>
        </div>

        <div className="mt-8 text-center">
          <a
            href="tel:+14706221392"
            className="inline-flex items-center gap-2 rounded-2xl bg-fling-yellow px-7 py-4 text-base font-extrabold text-fling-ink shadow-xl transition-transform hover:-translate-y-0.5 hover:bg-white"
          >
            <Phone className="h-5 w-5" />
            Questions? Give Us a Ring
          </a>
        </div>
      </div>
    </section>
  );
}
