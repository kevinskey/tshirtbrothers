import { Link, Navigate, useParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import { CITY_LANDINGS, findCityLanding } from '@/data/cityLandings';
import {
  Shirt, Sparkles, MapPin, Clock, CheckCircle2, Star, Tag,
} from 'lucide-react';

/**
 * /custom-shirts/<city> — local SEO landing page.
 *
 * Each city in CITY_LANDINGS gets its own URL with unique meta, H1, and
 * a paragraph or two of city-specific copy. The rest of the page (price
 * tiers, services, CTAs) is shared because that part is genuinely the
 * same offering — only the framing changes.
 */
export default function CityLandingPage() {
  const { citySlug } = useParams<{ citySlug: string }>();
  const city = findCityLanding(citySlug);

  // Unknown city slug — bounce to the general homepage. Avoids leaving
  // an orphan URL that Google could index as thin content.
  if (!city) return <Navigate to="/" replace />;

  const otherCities = CITY_LANDINGS.filter((c) => c.slug !== city.slug).slice(0, 6);

  return (
    <Layout>
      <Seo
        title={`Custom T-Shirt Printing in ${city.name}, GA · Screen Print, DTF, Embroidery`}
        description={`Custom t-shirts, hoodies, and apparel for ${city.name}. Screen printing, DTF transfers, embroidery — no minimums, ${city.driveMinutes === 0 ? 'free local pickup in Fairburn' : `${city.driveMinutes} minutes from ${city.name}`}.`}
        path={`/custom-shirts/${city.slug}`}
      />

      {/* Hero */}
      <section className="bg-gray-950 text-white py-12 sm:py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-300 mb-3">
            <MapPin className="h-3 w-3" /> Serving {city.name}, GA
          </div>
          <h1
            className="text-3xl sm:text-5xl md:text-6xl text-white tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            Custom T-Shirt Printing in <span className="text-orange-500">{city.name}</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
            {city.intro}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/quote"
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-6 py-3 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors"
            >
              <Tag className="h-4 w-4" /> Get a Free Quote
            </Link>
            <Link
              to="/design"
              className="inline-flex items-center gap-2 rounded-xl bg-gray-800 hover:bg-gray-700 px-6 py-3 text-base font-bold text-white border border-white/10 transition-colors"
            >
              <Sparkles className="h-4 w-4" /> Start Designing
            </Link>
          </div>
          <div className="mt-5 flex items-center justify-center gap-5 text-xs sm:text-sm text-gray-400 flex-wrap">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-orange-500" /> No minimums</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-orange-500" /> 2–7 day turnaround</span>
            <span className="flex items-center gap-1.5"><Star className="h-4 w-4 text-orange-500 fill-orange-500" /> 5.0 on Google</span>
          </div>
        </div>
      </section>

      {/* Local framing */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2
            className="text-2xl sm:text-3xl text-gray-900 tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
          >
            Why {city.name} groups choose TShirt Brothers
          </h2>
          <p className="mt-3 text-gray-700 leading-relaxed">
            {city.whyHere}
          </p>
          {city.nearbyLandmarks.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                Familiar spots near {city.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {city.nearbyLandmarks.map((landmark) => (
                  <span
                    key={landmark}
                    className="rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-medium text-orange-800"
                  >
                    {landmark}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Services */}
      <section className="bg-gray-50 py-10 sm:py-14 border-y border-gray-200">
        <div className="container mx-auto px-4">
          <h2
            className="text-2xl sm:text-3xl text-gray-900 text-center tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
          >
            What we print for {city.name}
          </h2>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { title: 'Custom Apparel', body: 'T-shirts, hoodies, polos, long sleeves — screen print, DTF, or DTG.' },
              { title: 'Embroidery', body: 'Polos, caps, jackets, and uniforms with professional digitized stitching.' },
              { title: 'DTF Transfers', body: 'Press-ready transfer films — bring your own apparel or order ours.' },
              { title: 'Team & Group Orders', body: 'Schools, churches, family reunions, businesses. Bulk pricing kicks in at 24+.' },
            ].map((svc) => (
              <div
                key={svc.title}
                className="rounded-2xl bg-white border border-gray-200 p-5 hover:border-orange-300 hover:shadow-sm transition"
              >
                <Shirt className="h-6 w-6 text-orange-500 mb-2" />
                <h3
                  className="text-base text-gray-900"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700 }}
                >
                  {svc.title}
                </h3>
                <p className="mt-1 text-sm text-gray-600 leading-relaxed">{svc.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-gray-950 text-white py-10 sm:py-14 text-center">
        <div className="container mx-auto px-4">
          <h2
            className="text-2xl sm:text-3xl tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            Ready to print in <span className="text-orange-500">{city.name}</span>?
          </h2>
          <p className="mt-2 text-gray-300 text-sm sm:text-base max-w-lg mx-auto">
            Live pricing in real time — pick your garment, method, and quantity to see the price update.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
            <Link to="/quote" className="rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 text-sm shadow-md shadow-orange-500/25 transition-colors">
              Get a Free Quote
            </Link>
            <Link to="/design" className="rounded-lg border border-white/30 hover:bg-white/10 text-white font-bold px-6 py-3 text-sm transition-colors">
              Start a Design
            </Link>
          </div>
        </div>
      </section>

      {/* Other cities — internal linking helps Google understand the
          relationship between these pages and gives users a way to find
          their actual hometown if they landed here from a wrong query. */}
      <section className="py-10 sm:py-12 bg-white">
        <div className="container mx-auto px-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 text-center mb-4">
            Also serving
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {otherCities.map((c) => (
              <Link
                key={c.slug}
                to={`/custom-shirts/${c.slug}`}
                className="rounded-full border border-gray-300 hover:border-orange-500 hover:text-orange-600 px-4 py-1.5 text-xs font-semibold text-gray-700 transition"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
