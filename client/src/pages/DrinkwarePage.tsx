import { ArrowRight, BookOpen, ExternalLink } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

// Laser-engraved drinkware landing. JDS's Polar Camel retail sites break
// when embedded in a cross-origin iframe (their SPA never mounts), so this
// page links out to the dealer-branded catalog (cust=193220 shows our
// contact info + suggested retail pricing) instead of framing it.
const CATALOG_URL = 'https://polarcamels.com/?cust=193220&prices=YES';
const FLIPBOOK_URL = 'https://online.flippingbook.com/view/958086163/';

const categories = [
  { name: 'Tumblers & Travel Mugs', blurb: '12–40 oz, powder-coated in 25+ colors' },
  { name: 'Water Bottles', blurb: 'Vacuum-insulated, keeps drinks cold 24 hrs' },
  { name: 'Can Coolers', blurb: 'Slim and standard, great for events' },
  { name: 'Barware & Glassware', blurb: 'Pints, wine tumblers, flasks, and more' },
];

export default function DrinkwarePage() {
  return (
    <Layout>
      <Seo
        title="Custom Engraved Drinkware · Polar Camel Tumblers · TShirt Brothers"
        description="Laser-engraved Polar Camel tumblers, water bottles, can coolers, and barware — personalized with your logo or design in Atlanta. Browse the full catalog and get a quote."
        path="/drinkware"
      />
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h1 className="font-display text-4xl md:text-5xl font-bold">Custom Engraved Drinkware</h1>
          <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
            Polar Camel high-endurance drinkware — double-wall, vacuum-insulated tumblers, bottles,
            and barware, laser-engraved with your logo or design. Team orders, corporate gifts,
            weddings, and events.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={CATALOG_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg"
            >
              Browse the Full Catalog <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={FLIPBOOK_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 border border-gray-300 hover:border-gray-400 text-gray-800 font-semibold px-6 py-3 rounded-lg"
            >
              <BookOpen className="w-4 h-4" /> View the Digital Catalog
            </a>
          </div>
          <p className="mt-3 text-sm text-gray-400">Catalogs open in a new tab.</p>

          <div className="mt-14 grid sm:grid-cols-2 gap-4 text-left">
            {categories.map((c) => (
              <a
                key={c.name}
                href={CATALOG_URL}
                target="_blank"
                rel="noreferrer"
                className="group border border-gray-200 rounded-xl p-5 hover:border-orange-400 transition-colors"
              >
                <div className="font-semibold text-gray-900 flex items-center justify-between">
                  {c.name}
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-orange-500 transition-colors" />
                </div>
                <p className="mt-1 text-sm text-gray-500">{c.blurb}</p>
              </a>
            ))}
          </div>

          <div className="mt-14 bg-gray-50 border border-gray-200 rounded-2xl p-8">
            <h2 className="font-display text-2xl font-bold">Found something you like?</h2>
            <p className="mt-2 text-gray-500">
              Send us the item number from the catalog and we'll quote it engraved with your art —
              typically ready in 5–7 business days.
            </p>
            <a
              href="/quote"
              className="mt-5 inline-flex items-center gap-2 bg-gray-900 hover:bg-black text-white font-semibold px-6 py-3 rounded-lg"
            >
              Get a Quote <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
}
