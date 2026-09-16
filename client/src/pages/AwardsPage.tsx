import { ArrowRight, ExternalLink } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';

// Awards & trophies landing. Same pattern as DrinkwarePage: JDS retail
// catalogs can't be iframed (their SPA never mounts cross-origin), so each
// line links out in a new tab using our dealer-branded URL with suggested
// retail pricing shown.
const lines = [
  {
    name: 'Sport Awards & Trophies',
    blurb: 'Trophies, medals, resin awards, and plaques for every sport and season',
    url: 'https://premiersportawards.com/?c=7jEC06YOzI1_zcgHFnEXWgAYX&p=YES',
  },
  {
    name: 'Crystal & Glass Awards',
    blurb: 'Engraved crystal and glass recognition pieces for corporate and academic honors',
    url: 'https://premiercrystal.com/?c=7jEC06YOzI1_zcgHFnEXWgAYX&p=YES',
  },
  {
    name: 'Acrylic Awards',
    blurb: 'Modern acrylic awards — full-color printed or laser-engraved',
    url: 'https://premieracrylic.com/?c=7jEC06YOzI1_zcgHFnEXWgAYX&p=YES',
  },
  {
    name: 'Corporate Awards',
    blurb: 'Executive recognition, service awards, and retirement gifts',
    url: 'https://premiercorporateawards.com/?cust=193220&prices=YES',
  },
];

export default function AwardsPage() {
  return (
    <Layout>
      <Seo
        title="Custom Awards & Trophies · Engraved Recognition · TShirt Brothers"
        description="Custom trophies, medals, plaques, crystal, and acrylic awards — engraved and personalized in Atlanta. Browse the catalogs and get a quote for your team, school, or company."
        path="/awards"
      />
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h1 className="font-display text-4xl md:text-5xl font-bold">Custom Awards & Trophies</h1>
          <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
            Trophies, medals, plaques, crystal, and acrylic awards — engraved with your names,
            logos, and artwork. Perfect for teams, schools, churches, and corporate recognition.
          </p>

          <div className="mt-12 grid sm:grid-cols-2 gap-4 text-left">
            {lines.map((l) => (
              <a
                key={l.name}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="group border border-gray-200 rounded-xl p-5 hover:border-orange-400 transition-colors"
              >
                <div className="font-semibold text-gray-900 flex items-center justify-between">
                  {l.name}
                  <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-orange-500 transition-colors" />
                </div>
                <p className="mt-1 text-sm text-gray-500">{l.blurb}</p>
              </a>
            ))}
          </div>
          <p className="mt-3 text-sm text-gray-400">Catalogs open in a new tab.</p>

          <div className="mt-14 bg-gray-50 border border-gray-200 rounded-2xl p-8">
            <h2 className="font-display text-2xl font-bold">Found something you like?</h2>
            <p className="mt-2 text-gray-500">
              Send us the item number from any catalog and we'll quote it engraved with your
              names and artwork — team and bulk pricing available.
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
