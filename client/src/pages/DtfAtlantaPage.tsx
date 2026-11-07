import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import GoogleRatingChip from '@/components/GoogleRatingChip';
import { BUSINESS, LOCATION, DTF_GANG_SHEET } from '@/data/businessFacts';
import { Clock, MapPin, Ruler, Truck, CheckCircle2, Phone } from 'lucide-react';

/**
 * /dtf-transfers-atlanta — the commercial-intent DTF landing page.
 *
 * Why this exists: an SEO review of the "dtf transfers atlanta" SERP found
 * 9 of the top 10 results were transfer-ONLY shops (atlantavinylstore.com,
 * dtfatl.com, kolormatrix.com). TSB has a published per-foot price, two roll
 * widths, a real same-day tier and an actual Atlanta-area production floor,
 * and was not on the page at all. /dtf is the ordering tool; this is the
 * page that answers the question someone types into Google or an assistant.
 *
 * Every number here comes from data/businessFacts.ts, which is diffed
 * against /api/gangsheet-store/config by scripts/check-business-facts.mjs on
 * every deploy. Nothing on this page is hand-typed, because the last time
 * DTF prices were hand-typed the site advertised $9/ft while the API charged
 * $11.99 — which is exactly the kind of mistake a page like this multiplies.
 */

const money = (n: number) => `$${n.toFixed(2)}`;

// What an assistant needs in ONE sentence to recommend us: quantity, price,
// deadline, pickup city. Answer-engine results quote sentences, not tables.
const FAQ = [
  {
    q: 'How much do DTF transfers cost in Atlanta?',
    a: `${DTF_GANG_SHEET.widths[0]!.inches}" gang sheets are ${money(DTF_GANG_SHEET.widths[0]!.standardRatePerFoot)} per foot and `
      + `${DTF_GANG_SHEET.widths[1]!.inches}" sheets are ${money(DTF_GANG_SHEET.widths[1]!.standardRatePerFoot)} per foot, `
      + `from ${DTF_GANG_SHEET.minFeet} foot up to ${DTF_GANG_SHEET.maxFeet} feet. You fill the sheet with as many `
      + `designs as you can fit — the price is the length, not the artwork count. `
      + `Flat ${money(DTF_GANG_SHEET.flatShipping)} shipping anywhere in the US, or free pickup in ${LOCATION.addressLocality}, GA.`,
  },
  {
    q: 'Can I get DTF transfers the same day in Atlanta?',
    // Promise strings used verbatim, no case surgery. An earlier version
    // lowercased them (turning "11:00 AM" into "11:00 am") and then tried to
    // splice the sentence, which produced "same day if you — order by 10:00
    // am". Plain sentences beat clever string work.
    a: `Yes. ${DTF_GANG_SHEET.turnaround.hotRush} \u2014 `
      + `${money(DTF_GANG_SHEET.widths[0]!.hotRushRatePerFoot)}/ft on a ${DTF_GANG_SHEET.widths[0]!.inches}" sheet. `
      + `${DTF_GANG_SHEET.turnaround.rush} \u2014 `
      + `${money(DTF_GANG_SHEET.widths[0]!.rushRatePerFoot)}/ft. `
      + `Rush and same-day tiers run Monday to Friday. `
      + `${DTF_GANG_SHEET.turnaround.standard} is the standard tier at `
      + `${money(DTF_GANG_SHEET.widths[0]!.standardRatePerFoot)}/ft.`,
  },
  {
    q: 'What is a DTF gang sheet?',
    a: `One long sheet of transfer film with many designs "ganged" onto it, so you pay for film length `
      + `instead of per design. A ${DTF_GANG_SHEET.widths[0]!.inches}"-wide sheet at 5 feet costs `
      + `${money(DTF_GANG_SHEET.widths[0]!.standardRatePerFoot * 5)} and will hold dozens of pocket-sized prints `
      + `or a handful of full-front graphics. You cut them apart and press them as you need them.`,
  },
  {
    q: 'Do I need a minimum order for DTF transfers?',
    a: `No. The minimum is ${DTF_GANG_SHEET.minFeet} foot of film — there is no garment minimum and no setup fee, `
      + `which is the main reason DTF beats screen printing for small runs and for orders with lots of different designs.`,
  },
  {
    q: 'Where do I pick up DTF transfers near Atlanta?',
    a: `${LOCATION.streetAddress}, ${LOCATION.addressLocality}, ${LOCATION.addressRegion} ${LOCATION.postalCode} — `
      + `just off I-85 south of the airport. Pickup is free. Call ${BUSINESS.phone} if you need it on a tight deadline.`,
  },
  {
    q: 'Will DTF transfers work on polyester and blends?',
    a: 'Yes — cotton, polyester, blends, canvas, and most performance fabrics. That is the practical advantage over '
      + 'screen printing and over heat-transfer vinyl: one transfer type for nearly every garment in the catalog, '
      + 'full colour, no colour-count surcharge.',
  },
];

// A real ladder rather than "contact us for pricing". The SEO review found
// exactly one local competitor publishing quantity pricing, and it ranks.
const LENGTHS = [1, 2, 5, 10, 20];

export default function DtfAtlantaPage() {
  const w22 = DTF_GANG_SHEET.widths[0]!;
  const w34 = DTF_GANG_SHEET.widths[1]!;

  return (
    <Layout>
      <Seo
        title={`DTF Transfers in Atlanta — ${DTF_GANG_SHEET.fromPriceLabel} Gang Sheets | ${BUSINESS.name}`}
        description={
          `DTF gang sheets from ${DTF_GANG_SHEET.fromPriceLabel}. `
          + `${DTF_GANG_SHEET.turnaround.hotRush}. No minimums, no setup fees, `
          + `free pickup in ${LOCATION.addressLocality} GA or flat ${money(DTF_GANG_SHEET.flatShipping)} shipping.`
        }
        path="/dtf-transfers-atlanta"
      />

      {/* FAQPage + Service, so the answers above are extractable. The
          business itself is already described by the LocalBusiness node in
          index.html — referenced by @id here rather than re-declared, so
          there is only ever one entity for this shop. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'FAQPage',
                '@id': 'https://tshirtbrothers.com/dtf-transfers-atlanta#faq',
                mainEntity: FAQ.map((f) => ({
                  '@type': 'Question',
                  name: f.q,
                  acceptedAnswer: { '@type': 'Answer', text: f.a },
                })),
              },
              // Matches the pattern VerticalLandingPage already uses, so the
              // hierarchy is explicit rather than inferred from the URL.
              {
                '@type': 'BreadcrumbList',
                '@id': 'https://tshirtbrothers.com/dtf-transfers-atlanta#breadcrumbs',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://tshirtbrothers.com/' },
                  { '@type': 'ListItem', position: 2, name: 'DTF Transfers', item: 'https://tshirtbrothers.com/dtf' },
                  { '@type': 'ListItem', position: 3, name: 'DTF Transfers in Atlanta', item: 'https://tshirtbrothers.com/dtf-transfers-atlanta' },
                ],
              },
              {
                '@type': 'Service',
                '@id': 'https://tshirtbrothers.com/dtf-transfers-atlanta#service',
                name: 'DTF Transfer Printing',
                serviceType: 'DTF transfer printing',
                provider: { '@id': 'https://tshirtbrothers.com/#business' },
                areaServed: { '@type': 'City', name: 'Atlanta' },
                offers: {
                  '@type': 'AggregateOffer',
                  priceCurrency: 'USD',
                  lowPrice: w22.standardRatePerFoot.toFixed(2),
                  highPrice: w34.hotRushRatePerFoot.toFixed(2),
                  unitText: 'foot',
                  availability: 'https://schema.org/InStock',
                  seller: { '@id': 'https://tshirtbrothers.com/#business' },
                },
              },
            ],
          }),
        }}
      />

      {/* ── Hero: price, deadline and city above the fold ──────────────── */}
      <section className="bg-gray-900 text-white">
        <div className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <MapPin className="h-3.5 w-3.5" />
            {LOCATION.addressLocality}, {LOCATION.addressRegion} &middot; metro Atlanta
          </p>
          <h1 className="mt-4 font-display text-3xl font-black leading-tight sm:text-5xl">
            DTF transfers in Atlanta,{' '}
            <span className="text-orange-400">{DTF_GANG_SHEET.fromPriceLabel}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-gray-200">
            Gang sheets printed on our own floor in {LOCATION.addressLocality}. Fill the sheet with as many
            designs as you can fit &mdash; you pay for the length, not the artwork count. No minimums, no
            setup fees, no colour-count surcharge.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/dtf"
              className="inline-flex items-center justify-center rounded-full bg-orange-600 px-7 py-3.5 font-bold text-white hover:bg-orange-700"
            >
              Build your gang sheet
            </Link>
            <a
              href={`tel:${BUSINESS.phoneE164}`}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-7 py-3.5 font-semibold hover:bg-white/10"
            >
              <Phone className="h-4 w-4" />
              {BUSINESS.phone}
            </a>
          </div>
          <div className="mt-7">
            <GoogleRatingChip />
          </div>
        </div>
      </section>

      {/* ── The three facts that decide the sale ───────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            // The promise strings already say "Ready next business day", so a
            // "Next business day:" label in front of them read as
            // "Next business day: ready next business day".
            { icon: Clock, head: 'Same day available', body: `${DTF_GANG_SHEET.turnaround.hotRush}. ${DTF_GANG_SHEET.turnaround.rush}. ${DTF_GANG_SHEET.turnaround.standard} as standard. Rush tiers run Mon–Fri.` },
            { icon: Ruler, head: 'Two roll widths', body: `${w22.inches}" at ${money(w22.standardRatePerFoot)}/ft and ${w34.inches}" at ${money(w34.standardRatePerFoot)}/ft, from ${DTF_GANG_SHEET.minFeet} to ${DTF_GANG_SHEET.maxFeet} feet.` },
            { icon: Truck, head: 'Pickup or ship', body: `Free pickup at ${LOCATION.streetAddress}, ${LOCATION.addressLocality}. Flat ${money(DTF_GANG_SHEET.flatShipping)} shipping anywhere in the US.` },
          ].map((c) => (
            <div key={c.head} className="rounded-2xl border border-gray-200 bg-white p-5">
              <c.icon className="h-6 w-6 text-orange-600" />
              <h2 className="mt-3 font-display text-lg font-bold text-gray-900">{c.head}</h2>
              <p className="mt-1.5 text-sm text-gray-600">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Published price ladder ─────────────────────────────────────── */}
      <section className="border-y border-gray-200 bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 py-12">
          <h2 className="font-display text-2xl font-black text-gray-900">What it costs</h2>
          <p className="mt-2 max-w-2xl text-gray-600">
            Real prices, not &ldquo;contact us for a quote&rdquo;. Standard turnaround
            ({DTF_GANG_SHEET.turnaround.standard.toLowerCase()}); rush and same-day cost a little more per foot.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[30rem] border-separate border-spacing-0 text-left text-sm">
              <caption className="sr-only">DTF gang sheet price by length and roll width</caption>
              <thead>
                <tr className="text-xs uppercase tracking-wider text-gray-600">
                  <th scope="col" className="pb-2 pr-4 font-semibold">Length</th>
                  <th scope="col" className="pb-2 pr-4 font-semibold">{w22.inches}&quot; wide</th>
                  <th scope="col" className="pb-2 font-semibold">{w34.inches}&quot; wide</th>
                </tr>
              </thead>
              <tbody className="text-gray-900">
                {LENGTHS.map((ft) => (
                  <tr key={ft} className="border-t border-gray-200">
                    <th scope="row" className="py-3 pr-4 font-semibold">
                      {ft} {ft === 1 ? 'foot' : 'feet'}
                    </th>
                    <td className="py-3 pr-4">{money(w22.standardRatePerFoot * ft)}</td>
                    <td className="py-3">{money(w34.standardRatePerFoot * ft)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            Add flat {money(DTF_GANG_SHEET.flatShipping)} shipping, or collect it in {LOCATION.addressLocality} for free.
            Need more than {DTF_GANG_SHEET.maxFeet} feet? Call {BUSINESS.phone} and we will run it as a production order.
          </p>
        </div>
      </section>

      {/* ── Who it suits ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="font-display text-2xl font-black text-gray-900">When DTF is the right call</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {[
            'Lots of different designs in one order — every name, number or logo can differ at no extra cost.',
            'Small runs. No setup fee means 6 shirts costs what 6 shirts should cost.',
            'Full-colour artwork, gradients and photographs, which screen printing charges per colour for.',
            'Mixed garments — cotton tees, poly jerseys, canvas totes and caps all take the same transfer.',
            'You press them yourself, on your own schedule, as orders come in.',
            'Reorders: keep the leftover film and press more whenever you need them.',
          ].map((t) => (
            <li key={t} className="flex gap-2.5 text-gray-700">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-600" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-gray-600">
          Running one or two colours across a few hundred shirts instead? Screen printing is cheaper at that
          volume &mdash; <Link to="/quote" className="font-semibold text-orange-700 underline">get a printing quote</Link>{' '}
          and we will tell you honestly which way is less money.
        </p>
      </section>

      {/* ── FAQ: the extractable half ──────────────────────────────────── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-12">
          <h2 className="font-display text-2xl font-black text-gray-900">DTF questions we actually get</h2>
          <dl className="mt-6 divide-y divide-gray-200">
            {FAQ.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-display text-base font-bold text-gray-900">{f.q}</dt>
                <dd className="mt-1.5 text-gray-700">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ── Close ──────────────────────────────────────────────────────── */}
      <section className="bg-orange-600 text-white">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center">
          <h2 className="font-display text-2xl font-black sm:text-3xl">Build your sheet now</h2>
          <p className="mx-auto mt-3 max-w-xl text-orange-50">
            Lay your designs out, see the price as you go, and choose pickup in {LOCATION.addressLocality} or
            flat {money(DTF_GANG_SHEET.flatShipping)} shipping at checkout.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              to="/dtf"
              className="inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 font-bold text-orange-700 hover:bg-orange-50"
            >
              Start a gang sheet
            </Link>
            <a
              href={`tel:${BUSINESS.phoneE164}`}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/40 px-7 py-3.5 font-semibold hover:bg-white/10"
            >
              <Phone className="h-4 w-4" />
              Talk to a person
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
}
