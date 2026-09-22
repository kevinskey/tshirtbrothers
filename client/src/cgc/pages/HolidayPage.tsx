import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Gift, Loader2 } from 'lucide-react';
import { fetchHoliday, money } from '../lib/api';
import { useCgcPath } from '../lib/base';

// Holiday Gifts launch collection — four curated products from
// /api/cgc/holiday. Products render as "launching soon" until Doc flips
// `published` in server/lib/cgcHoliday.js (after supplier mapping,
// pricing, sample approval, and fulfillment are confirmed).
export default function HolidayPage() {
  const p = useCgcPath();
  const { data, isLoading } = useQuery({ queryKey: ['cgc-holiday'], queryFn: fetchHoliday });
  const products = data?.products ?? [];

  return (
    <>
      <Helmet>
        <title>Holiday Gifts — Custom Gift Club</title>
        <meta name="description" content="Give something only you could give. Personalized tumblers, cutting boards, ornaments, and journals — engraved to order by Custom Gift Club." />
      </Helmet>

      {/* Campaign hero */}
      <section className="bg-cgc-ink text-white" aria-labelledby="holiday-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-center">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.15em] text-cgc-orange">
            The Holiday Collection
          </p>
          <h1 id="holiday-heading" className="mt-3 text-4xl sm:text-5xl font-extrabold leading-[1.08] tracking-tight">
            Give Something <span className="text-cgc-orange">Only You</span> Could Give<span className="text-cgc-orange">.</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/80 max-w-xl mx-auto">
            Four gifts, engraved to order — a tumbler, a family cutting board,
            a Christmas ornament, and a journal, each made personal with a name
            that matters.
          </p>
        </div>
      </section>

      {/* Launch products */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14" aria-label="Holiday launch products">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-cgc-orange" aria-label="Loading collection" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {products.map((prod) => (
              <Link
                key={prod.slug}
                to={p(`/holiday/${prod.slug}`)}
                className="group rounded-2xl border border-cgc-cream-deep overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="relative aspect-square bg-cgc-cream flex items-center justify-center p-6">
                  {prod.image_url ? (
                    <img
                      src={prod.image_url}
                      alt={prod.title}
                      loading="lazy"
                      className="max-h-full max-w-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <Gift className="h-12 w-12 text-cgc-stone" aria-hidden />
                  )}
                  {!prod.available && (
                    <span className="absolute top-3 left-3 rounded-full bg-cgc-ink text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1">
                      Launching soon
                    </span>
                  )}
                  {prod.featured && (
                    <span className="absolute top-3 right-3 rounded-full bg-cgc-orange text-white text-[11px] font-bold uppercase tracking-wide px-3 py-1">
                      Featured
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="font-extrabold text-cgc-ink group-hover:text-cgc-orange transition-colors">
                    {prod.title}
                  </h2>
                  <p className="mt-1 text-sm text-cgc-stone line-clamp-2">{prod.intro}</p>
                  {prod.from_cents != null && (
                    <p className="mt-2 text-sm font-bold text-cgc-ink">
                      From {money(prod.from_cents)}
                      <span className="font-medium text-cgc-stone"> + engraving</span>
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Teams & clients */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-12" aria-labelledby="holiday-teams-heading">
        <div className="rounded-2xl bg-cgc-cream px-6 sm:px-10 py-8 sm:py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h2 id="holiday-teams-heading" className="text-2xl sm:text-3xl font-extrabold tracking-tight text-cgc-ink">
              Gifts for Teams &amp; Clients
            </h2>
            <p className="mt-2 text-cgc-charcoal max-w-xl">
              Ordering for a whole team? Tell us your quantity, budget per gift,
              and when you need them — we&rsquo;ll put together options with your logo.
            </p>
          </div>
          <Link
            to={p('/business')}
            className="inline-flex items-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3.5 transition-colors whitespace-nowrap"
          >
            Start an Inquiry <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}
