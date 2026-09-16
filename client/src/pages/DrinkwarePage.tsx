import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

// Laser-engraved drinkware catalog — JDS's Polar Camel retail site embedded
// with our dealer account (cust=193220), so it shows TSB contact info and
// suggested retail pricing. Customers browse there, then order through us.
const CATALOG_URL = 'https://polarcamels.com/?cust=193220&prices=YES';

export default function DrinkwarePage() {
  return (
    <Layout>
      <Seo
        title="Custom Engraved Drinkware · Polar Camel Tumblers · TShirt Brothers"
        description="Browse our full Polar Camel catalog — laser-engraved tumblers, water bottles, can coolers, and barware. Personalized with your logo or design in Atlanta."
        path="/drinkware"
      />
      <section className="py-10">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h1 className="font-display text-4xl md:text-5xl font-bold">Custom Engraved Drinkware</h1>
            <p className="mt-3 text-gray-500 max-w-2xl mx-auto">
              Browse the full Polar Camel line below — tumblers, water bottles, can coolers, and barware,
              all laser-engraved with your logo or design. Found something you like?{' '}
              <a href="/quote" className="text-orange-600 font-medium hover:underline">Request a quote</a>{' '}
              with the item number and we'll take it from there.
            </p>
          </div>
        </div>
        <iframe
          src={CATALOG_URL}
          title="Polar Camel drinkware catalog"
          className="w-full border-0"
          style={{ height: 'calc(100vh - 4rem)' }}
        />
      </section>
    </Layout>
  );
}
