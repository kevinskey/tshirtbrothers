import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import { ChevronDown, HelpCircle, Tag, Sparkles } from 'lucide-react';

// FAQ content. Edit here to change live page + the FAQPage JSON-LD
// schema below — Google reads the schema and frequently renders an
// accordion of these answers directly under your search listing.
//
// Order them by buying-intent: pricing first, turnaround second,
// minimums third, then the rest.
const FAQS: { q: string; a: string }[] = [
  {
    q: 'How much does it cost to print custom t-shirts in Atlanta?',
    a: 'A single t-shirt with a one-location print runs roughly $25–$32 depending on garment. At 24 shirts you\'re around $14–$18 each, and at 100+ you\'re in the $8–$12 range. The big variables are print method (DTF vs screen printing scale differently), number of print locations, and rush. See our full cost guide on the blog or use the Instant Quote calculator for a real-time number.',
  },
  {
    q: 'Do you have a minimum order?',
    a: 'No minimums. We\'ll print a single custom shirt for you and we\'ll print a thousand. Smaller orders cost more per shirt because the setup is the same — that\'s just math, not a policy.',
  },
  {
    q: 'How fast can I get my order?',
    a: 'Standard turnaround is 2–7 business days from approved mockup. Rush jobs (under 48 hours) add 20–30% to the base. Same-day jobs are sometimes possible for small DTF runs picked up locally in Fairburn — call ahead so we can confirm.',
  },
  {
    q: 'What\'s the difference between screen printing and DTF transfers?',
    a: 'Screen printing pushes ink through a mesh screen — best for bulk orders (50+) with 1–3 colors because the per-shirt cost drops dramatically at scale. DTF (Direct-to-Film) prints your art onto a transfer film that\'s heat-pressed to the shirt — best for low quantities, full-color art, and one-off designs because there\'s no per-color setup. We\'ll recommend the right method when you quote.',
  },
  {
    q: 'Can I see my design before you print it?',
    a: 'Yes — we send you a mockup for approval before anything goes on a press. You can also build the mockup yourself in the free Design Studio and it carries directly into your quote.',
  },
  {
    q: 'What file format do you need for my artwork?',
    a: 'Print-ready PNGs with a transparent background work best (300 dpi or higher). We also accept SVG, AI, PSD, and high-res JPG. If your file needs vectorizing or color separation work, there\'s usually a $20–$50 one-time art fee, quoted up-front.',
  },
  {
    q: 'Do you do team or bulk orders?',
    a: 'Yes — teams, schools, churches, family reunions, businesses. Bulk pricing kicks in at 24 shirts and gets dramatically cheaper at 50, 100, and 250+. Tax-exempt forms accepted for qualifying organizations.',
  },
  {
    q: 'Do you ship nationwide?',
    a: 'Yes. Standard shipping is $7–$15 depending on weight. Orders over $150 ship free anywhere in the continental US. Local pickup at our Fairburn, GA shop is free.',
  },
  {
    q: 'Can I order just transfer films without shirts?',
    a: 'Yes — we offer ready-to-press DTF transfer films with no garments attached. You bring your own apparel (or have a local printer press them onto blanks). Useful if you already have a stack of blanks or want to add prints to non-standard items.',
  },
  {
    q: 'Do you do embroidery too?',
    a: 'Yes — multi-needle embroidery for polos, caps, jackets, bags, and uniforms. Embroidery is priced by stitch count, not by color. We can also digitize your logo if you don\'t have a stitch file yet.',
  },
  {
    q: 'How do I pay?',
    a: 'Card payments via Stripe through your invoice link, ACH for larger orders, or cash/check at the shop for local pickup. Deposits are usually 50% to start production, balance on completion.',
  },
  {
    q: 'What if I\'m not happy with my order?',
    a: 'Reach out — we\'ll fix it. Custom printing means every order is unique, so we can\'t restock the way a retailer can, but if anything is wrong on our end (color, placement, garment, print quality) we\'ll reprint at our cost.',
  },
  {
    q: 'Where are you located?',
    a: 'We\'re a working print shop at 6010 Renaissance Parkway, Fairburn, GA 30213 — about 25 minutes from downtown Atlanta. Open Monday through Saturday, 8 AM to 8 PM. Walk-ins welcome.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left hover:text-orange-600 transition"
        aria-expanded={open}
      >
        <span className="text-base sm:text-lg font-semibold text-gray-900">{q}</span>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180 text-orange-500' : ''}`}
        />
      </button>
      {open && (
        <div className="pb-4 text-sm sm:text-base text-gray-700 leading-relaxed">{a}</div>
      )}
    </div>
  );
}

export default function FaqPage() {
  // JSON-LD: FAQPage schema. Google often surfaces these as an
  // accordion of "People also ask"-style answers inside the search
  // result, hugely improving CTR for the queries that match.
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };

  return (
    <Layout>
      <Seo
        title="FAQ · Custom T-Shirt Printing in Atlanta · TShirt Brothers"
        description="Answers to the most common questions about custom t-shirt printing in Atlanta — pricing, minimums, turnaround, screen print vs DTF, file formats, and more."
        path="/faq"
      />

      {/* Hero */}
      <section className="bg-gray-950 text-white py-12 sm:py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-300 mb-3">
            <HelpCircle className="h-3 w-3" /> Frequently Asked
          </div>
          <h1
            className="text-3xl sm:text-5xl md:text-6xl text-white tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            Questions, <span className="text-orange-500">Answered</span>.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Real answers from a working Atlanta print shop. Still have a question? Call us or
            shoot an email — we'll get back to you the same day.
          </p>
        </div>
      </section>

      {/* FAQ list */}
      <section className="py-10 sm:py-14">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="divide-y divide-gray-200 border-t border-gray-200">
            {FAQS.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
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
            Still have a <span className="text-orange-500">question?</span>
          </h2>
          <p className="mt-2 text-gray-300 text-sm sm:text-base max-w-lg mx-auto">
            Call (470) 622-1392, email kevin@tshirtbrothers.com, or just start a quote — we'll
            walk you through it.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
            <Link to="/quote" className="rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3 text-sm shadow-md shadow-orange-500/25 transition-colors inline-flex items-center gap-2">
              <Tag className="h-4 w-4" /> Get a Free Quote
            </Link>
            <Link to="/design" className="rounded-lg border border-white/30 hover:bg-white/10 text-white font-bold px-6 py-3 text-sm transition-colors inline-flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Start Designing
            </Link>
          </div>
        </div>
      </section>

      {/* FAQPage schema — emitted inline so it ships with the SSR HTML
          on first request (after pre-rendering rolls out). Crawlers
          read this verbatim and frequently render the answers as a
          rich accordion under our search listing. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </Layout>
  );
}
