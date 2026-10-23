import { Link, Navigate, useParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import GoogleRatingChip from '@/components/GoogleRatingChip';
import { VERTICAL_LANDINGS, findVerticalLanding } from '@/data/verticalLandings';
import {
  Sparkles, CheckCircle2, Tag, Shirt, Printer, Tags, ListOrdered, HelpCircle, Settings2,
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
  const url = `https://tshirtbrothers.com/shirts-for/${vertical.slug}`;

  /**
   * Structured data for this page, as an @graph.
   *
   * - Service, so the page is machine-readable as "this business offers
   *   this named service in these places", attached by @id to the
   *   LocalBusiness declared in index.html rather than re-describing
   *   the business (which would create a competing entity).
   * - BreadcrumbList, so the hierarchy Home > Shirts For > <vertical>
   *   is explicit instead of inferred from the URL.
   * - FAQPage, only for verticals that actually have FAQs. Every
   *   question/answer pair below is also rendered as visible text on
   *   the page — required by Google's FAQPage policy, and the honest
   *   thing to do regardless.
   *
   * No ratings or review counts here: those come from the live Google
   * data in GoogleReviews/GoogleRatingChip, never from a literal.
   */
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${url}#service`,
        name: `Custom ${vertical.name}`,
        serviceType: vertical.name,
        description: vertical.heroLine,
        url,
        provider: { '@id': 'https://tshirtbrothers.com/#business' },
        areaServed: [
          'Fairburn', 'Fayetteville', 'Peachtree City', 'Tyrone',
          'Newnan', 'Union City', 'College Park', 'Atlanta',
        ].map((name) => ({
          '@type': 'City',
          name,
          containedInPlace: { '@type': 'State', name: 'Georgia' },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumbs`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://tshirtbrothers.com/' },
          { '@type': 'ListItem', position: 2, name: 'Services', item: 'https://tshirtbrothers.com/services' },
          { '@type': 'ListItem', position: 3, name: vertical.name, item: url },
        ],
      },
      ...(vertical.faqs?.length
        ? [{
            '@type': 'FAQPage',
            '@id': `${url}#faq`,
            mainEntity: vertical.faqs.map((f) => ({
              '@type': 'Question',
              name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          }]
        : []),
    ],
  };

  return (
    <Layout>
      <Seo
        title={`${vertical.name} · Custom Printing in Atlanta · TShirt Brothers`}
        description={`${vertical.heroLine} Screen printing, DTF, and embroidery. No minimums, ${vertical.pricingHint.toLowerCase()}. Atlanta metro pickup in Fairburn, GA.`}
        path={`/shirts-for/${vertical.slug}`}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      {/* Hero */}
      <section className="bg-gray-950 text-white py-12 sm:py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-300 mb-3">
            <Tags className="h-3 w-3" /> {vertical.shortLabel}
          </div>
          <h1
            className="text-4xl sm:text-5xl md:text-6xl text-white tracking-tight"
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
            {/* Live rating, not a literal — see GoogleRatingChip. */}
            <GoogleRatingChip />
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
            {/* Some verticals are a service mode, not an audience —
                "What we print for rush groups" reads as nonsense, so
                those supply their own heading. */}
            {vertical.introHeading ?? `What we print for ${vertical.shortLabel.toLowerCase()} groups`}
          </h2>
          <p className="mt-3 text-gray-700 leading-relaxed">
            {vertical.intro}
          </p>
          {vertical.methodDetail && (
            <p className="mt-4 text-gray-700 leading-relaxed">
              {vertical.methodDetail}
            </p>
          )}
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

      {/* Customization options — only rendered when the vertical
          actually lists some, so no page shows an empty heading. */}
      {vertical.options?.length ? (
        <section className="bg-gray-50 py-10 sm:py-14 border-y border-gray-200">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2
              className="flex items-center justify-center gap-2 text-2xl sm:text-3xl text-gray-900 text-center tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
            >
              <Settings2 className="h-6 w-6 text-orange-500" /> Ways to customize it
            </h2>
            <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {vertical.options.map((opt) => (
                <li
                  key={opt}
                  className="flex items-start gap-2.5 rounded-xl bg-white border border-gray-200 px-4 py-3"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-orange-500 shrink-0" />
                  <span className="text-sm sm:text-base text-gray-800">{opt}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Ordering process. An ordered list on purpose: this is the
          content that answers "how do I actually order from you", which
          is the question AI assistants most often have to answer about
          a print shop and most often can't find on one. */}
      {vertical.process?.length ? (
        <section className="py-10 sm:py-14">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2
              className="flex items-center gap-2 text-2xl sm:text-3xl text-gray-900 tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
            >
              <ListOrdered className="h-6 w-6 text-orange-500" /> How to order
            </h2>
            <ol className="mt-6 space-y-4">
              {vertical.process.map((p, i) => (
                <li key={p.step} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-bold text-gray-900">{p.step}</p>
                    <p className="mt-0.5 text-sm sm:text-base text-gray-700 leading-relaxed">{p.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {/* FAQs. Rendered as visible text, not just structured data —
          Google's FAQPage policy requires the markup to match on-page
          content, and an answer nobody can read is no use to a customer
          anyway. Plain markup (no accordion) so the text is in the
          prerendered HTML without needing an interaction. */}
      {vertical.faqs?.length ? (
        <section className="bg-gray-50 py-10 sm:py-14 border-y border-gray-200">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2
              className="flex items-center gap-2 text-2xl sm:text-3xl text-gray-900 tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
            >
              <HelpCircle className="h-6 w-6 text-orange-500" /> Common questions
            </h2>
            <div className="mt-6 space-y-5">
              {vertical.faqs.map((f) => (
                <div key={f.q} className="rounded-2xl bg-white border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-900">{f.q}</h3>
                  <p className="mt-1.5 text-sm sm:text-base text-gray-700 leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-gray-500">
              More answers on our{' '}
              <Link to="/faq" className="text-orange-600 hover:underline font-semibold">FAQ page</Link>, or call{' '}
              <a href="tel:+14706221392" className="text-orange-600 hover:underline font-semibold">(470) 622-1392</a>.
            </p>
          </div>
        </section>
      ) : null}

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
