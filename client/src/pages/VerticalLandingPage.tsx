import { Link, Navigate, useParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import { VERTICAL_LANDINGS, findVerticalLanding } from '@/data/verticalLandings';
import {
  Sparkles, CheckCircle2, Star, Tag, Shirt, Printer, Tags,
} from 'lucide-react';

/**
 * /shirts-for/<slug> — use-case (vertical) landing page.
 *
 * Each entry in VERTICAL_LANDINGS gets its own URL with unique meta,
 * H1, and use-case-specific framing (intro, typical projects,
 * recommended method/garment, price hint). Mirror of the city-landing
 * pattern but targeting intent keywords ("church shirts") instead of
 * geographic ones ("custom shirts atlanta").
 */
export default function VerticalLandingPage() {
  const { verticalSlug } = useParams<{ verticalSlug: string }>();
  const vertical = findVerticalLanding(verticalSlug);

  if (!vertical) return <Navigate to="/" replace />;

  const otherVerticals = VERTICAL_LANDINGS.filter((v) => v.slug !== vertical.slug).slice(0, 6);

  return (
    <Layout>
      <Seo
        title={`${vertical.name} · Custom Printing in Atlanta · TShirt Brothers`}
        description={`${vertical.heroLine} Screen printing, DTF, and embroidery. No minimums, ${vertical.pricingHint.toLowerCase()}. Atlanta metro pickup in Fairburn, GA.`}
        path={`/shirts-for/${vertical.slug}`}
      />

      {/* Hero */}
      <section className="bg-gray-950 text-white py-12 sm:py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-300 mb-3">
            <Tags className="h-3 w-3" /> {vertical.shortLabel}
          </div>
          <h1
            className="text-3xl sm:text-5xl md:text-6xl text-white tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            Custom <span className="text-orange-500">{vertical.name}</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
            {vertical.heroLine}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            <Link
              to={vertical.cta.to}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 hover:bg-orange-600 px-6 py-3 text-base font-bold text-white shadow-lg shadow-orange-500/25 transition-colors"
            >
              <Tag className="h-4 w-4" /> {vertical.cta.label}
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
            <span className="flex items-center gap-1.5"><Star className="h-4 w-4 text-orange-500 fill-orange-500" /> 5.0 on Google</span>
            <span className="flex items-center gap-1.5"><Tag className="h-4 w-4 text-orange-500" /> {vertical.pricingHint}</span>
          </div>
        </div>
      </section>

      {/* Intro framing */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2
            className="text-2xl sm:text-3xl text-gray-900 tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
          >
            What we print for {vertical.shortLabel.toLowerCase()} groups
          </h2>
          <p className="mt-3 text-gray-700 leading-relaxed">
            {vertical.intro}
          </p>
        </div>
      </section>

      {/* Examples */}
      <section className="bg-gray-50 py-10 sm:py-14 border-y border-gray-200">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2
            className="text-2xl sm:text-3xl text-gray-900 text-center tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
          >
            Common projects
          </h2>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {vertical.examples.map((ex) => (
              <div
                key={ex}
                className="flex items-start gap-2.5 rounded-xl bg-white border border-gray-200 px-4 py-3 hover:border-orange-300 transition"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-orange-500 shrink-0" />
                <span className="text-sm sm:text-base text-gray-800 font-medium">{ex}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recommendations */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2
            className="text-2xl sm:text-3xl text-gray-900 text-center tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
          >
            What we usually recommend
          </h2>
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-gray-200 p-5">
              <Printer className="h-6 w-6 text-orange-500 mb-2" />
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Method</p>
              <p className="text-base text-gray-800 font-semibold">{vertical.recommendedMethod}</p>
            </div>
            <div className="rounded-2xl border border-gray-200 p-5">
              <Shirt className="h-6 w-6 text-orange-500 mb-2" />
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Garment</p>
              <p className="text-base text-gray-800 font-semibold">{vertical.recommendedGarment}</p>
            </div>
          </div>
          <p className="mt-4 text-sm text-gray-500 text-center">
            Not sure? Use the <Link to="/quote" className="text-orange-600 hover:underline font-semibold">Instant Quote</Link> to see live pricing across every method.
          </p>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-gray-950 text-white py-10 sm:py-14 text-center">
        <div className="container mx-auto px-4">
          <h2
            className="text-2xl sm:text-3xl tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            Ready to print your <span className="text-orange-500">{vertical.shortLabel.toLowerCase()}</span> order?
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

      {/* Other verticals — internal linking. */}
      <section className="py-10 sm:py-12 bg-white">
        <div className="container mx-auto px-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 text-center mb-4">
            Also printing for
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {otherVerticals.map((v) => (
              <Link
                key={v.slug}
                to={`/shirts-for/${v.slug}`}
                className="rounded-full border border-gray-300 hover:border-orange-500 hover:text-orange-600 px-4 py-1.5 text-xs font-semibold text-gray-700 transition"
              >
                {v.name}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
