// Holiday Cards landing page — route: /holiday-cards.
//
// The destination for the holiday-cards email campaigns ("Shop Holiday
// Cards"). Shows the 2026 card collection (six designs cropped from Doc's
// collection sheet, hosted in Spaces), the 3-step pitch, and funnels every
// CTA into the Easy Quote wizard. Same visual language as /pro: white
// ground, navy headlines, orange accents — with holiday green/red trim.
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import {
  ArrowRight, Gift, Heart, Star, Printer, PenTool, Package, Truck, Mail,
} from 'lucide-react';

const NAVY = '#1f2a44';
const CDN = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/marketing/campaigns';

type CardDesign = {
  slug: string; name: string; img: string;
  format: string; photos: string; blurb: string; badge?: string;
};

const DESIGNS: CardDesign[] = [
  {
    slug: 'evergreen-wishes', name: 'Evergreen Wishes',
    img: `${CDN}/1790356356286-holiday-card-evergreen-wishes.jpg`,
    format: 'Flat · 5" × 7"', photos: 'No photos',
    blurb: 'Classic pine and gold on deep evergreen — timeless and warm.',
  },
  {
    slug: 'botanical-joy', name: 'Botanical Joy',
    img: `${CDN}/1790356354790-holiday-card-botanical-joy.jpg`,
    format: 'Flat · 5" × 7"', photos: 'No photos',
    blurb: 'Watercolor holly on cream — bright, joyful, and elegant.',
  },
  {
    slug: 'cranberry-classic', name: 'Cranberry Classic',
    img: `${CDN}/1790356355819-holiday-card-cranberry-classic.jpg`,
    format: 'Flat · 5" × 7"', photos: 'No photos',
    blurb: 'Merry & Bright in gold script over rich cranberry red.',
  },
  {
    slug: 'two-photo-memories', name: 'Two-Photo Memories',
    img: `${CDN}/1790356357187-holiday-card-two-photo-memories.jpg`,
    format: 'Flat · 5" × 7"', photos: '2 photos', badge: 'Most Popular',
    blurb: 'Home for the Holidays — share two favorite moments side by side.',
  },
  {
    slug: 'three-photo-cheer', name: 'Three-Photo Cheer',
    img: `${CDN}/1790356356741-holiday-card-three-photo-cheer.jpg`,
    format: 'Flat · 5" × 7"', photos: '3 photos',
    blurb: 'Three photos, one big Merry Christmas — the whole year in a card.',
  },
  {
    slug: 'business-gratitude', name: 'Business Gratitude',
    img: `${CDN}/1790356355350-holiday-card-business-gratitude.jpg`,
    format: 'Flat · 5" × 7"', photos: 'No photos', badge: 'For Business',
    blurb: 'Thank clients and your team for being part of your year.',
  },
];

const STEPS = [
  {
    n: 1, icon: PenTool, title: 'Choose your card style',
    body: 'Pick a design you love — add your family name, company logo, or photos and we handle the layout.',
  },
  {
    n: 2, icon: Mail, title: 'Match your envelope',
    body: 'Pair your card with a festive envelope in classic holiday colors, plus return-address labels and seals.',
  },
  {
    n: 3, icon: Package, title: 'We print, you celebrate',
    body: 'Fast local turnaround — pick up in Fairburn or have them shipped, ready to sign and send.',
  },
];

const FEATURES = [
  { icon: Printer, title: 'Premium print quality', body: 'Vibrant colors and heavyweight cardstock make your greetings feel extra special.' },
  { icon: PenTool, title: 'Easy customization', body: 'Send us your photos, names, and message — we set it up and send you a proof.' },
  { icon: Gift, title: 'Coordinated accessories', body: 'Envelopes, address labels, and seals that perfectly complete your cards.' },
  { icon: Truck, title: 'Fast turnaround', body: 'Get your cards printed and on their way quickly, in time for the holidays.' },
];

export default function HolidayCardsPage() {
  return (
    <Layout>
      <Seo
        title="Holiday Cards Made Personal — T-Shirt Brothers"
        description="Custom holiday cards from T-Shirt Brothers: photo cards, classic designs, and business thank-yous with matching envelopes, labels, and seals. Printed fast in Fairburn, GA."
        path="/holiday-cards"
      />

      {/* Hero */}
      <section style={{ backgroundColor: NAVY }}>
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20 grid gap-10 lg:grid-cols-2 items-center">
          <div>
            <p className="font-black uppercase tracking-[0.3em] text-orange-400 text-xs sm:text-sm">
              — Make the season brighter —
            </p>
            <h1 className="mt-3 font-black text-4xl sm:text-6xl leading-tight text-white">
              Holiday Cards<br />Made <span className="italic text-amber-300">Personal</span>
            </h1>
            <p className="mt-4 text-slate-300 text-base sm:text-lg max-w-md">
              Create beautiful photo and classic Christmas cards that share what
              matters most — your family, your story, your holiday cheer.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <a
                href="#designs"
                className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-7 py-3.5 rounded-lg text-sm sm:text-base transition-colors"
              >
                Shop Holiday Cards <ArrowRight className="w-4 h-4" />
              </a>
              <Link to="/quote" className="text-slate-300 hover:text-white text-sm font-medium underline underline-offset-4">
                or start a custom quote
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-slate-300 text-xs sm:text-sm">
              <span className="inline-flex items-center gap-2"><Gift className="w-4 h-4 text-orange-400" /> Custom designs</span>
              <span className="inline-flex items-center gap-2"><Heart className="w-4 h-4 text-orange-400" /> Family owned</span>
              <span className="inline-flex items-center gap-2"><Star className="w-4 h-4 text-orange-400" /> Printed in Fairburn, GA</span>
            </div>
          </div>
          <div className="hidden lg:block">
            <img
              src={`${CDN}/1790356357187-holiday-card-two-photo-memories.jpg`}
              alt="Home for the Holidays two-photo card"
              className="rounded-2xl shadow-2xl rotate-2 border-4 border-white/10"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* Collection */}
      <section id="designs" className="bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
          <p className="text-center font-semibold uppercase tracking-[0.25em] text-emerald-700 text-xs">
            🎄 Create cards as unique as your family 🎄
          </p>
          <h2 className="mt-2 text-center font-black text-3xl sm:text-4xl" style={{ color: NAVY }}>
            The 2026 Holiday Card Collection
          </h2>
          <div className="mx-auto mt-3 h-1 w-12 rounded bg-orange-500" />

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {DESIGNS.map((d) => (
              <div key={d.slug} className="group border border-gray-200 rounded-2xl overflow-hidden bg-white hover:shadow-lg hover:border-orange-300 transition-all">
                <div className="relative bg-gray-50">
                  <img src={d.img} alt={`${d.name} holiday card design`} className="w-full h-auto" loading="lazy" />
                  {d.badge && (
                    <span className="absolute top-3 left-3 bg-orange-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow">
                      {d.badge}
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-bold text-gray-900">{d.name}</h3>
                    <span className="text-[11px] text-gray-500 whitespace-nowrap">{d.format} · {d.photos}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{d.blurb}</p>
                  <Link
                    to={`/quote?ref=holiday-card-${d.slug}`}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-orange-600 group-hover:text-orange-700"
                  >
                    Start with this design <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-gray-500">
            Every card comes with matching envelopes, return-address labels, and envelope seals.
            Want something different? <Link to="/quote" className="text-orange-600 font-semibold underline underline-offset-2">We design custom cards too.</Link>
          </p>
        </div>
      </section>

      {/* 3 steps */}
      <section className="bg-orange-50/60 border-y border-orange-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
          <h2 className="text-center font-black text-2xl sm:text-3xl" style={{ color: NAVY }}>
            3 Simple Steps to Your Perfect Holiday Cards
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-orange-500 text-white font-black text-lg flex items-center justify-center">{s.n}</div>
                <h3 className="mt-4 font-bold text-gray-900">{s.title}</h3>
                <p className="mt-2 text-sm text-gray-600 max-w-xs mx-auto">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="text-center">
              <f.icon className="mx-auto w-8 h-8" style={{ color: NAVY }} />
              <h3 className="mt-3 font-bold text-gray-900 text-sm">{f.title}</h3>
              <p className="mt-1.5 text-sm text-gray-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-emerald-900">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center">
          <h2 className="font-black text-3xl text-white">Spread More Merry</h2>
          <p className="mt-2 text-emerald-100 text-sm uppercase tracking-[0.25em]">
            Custom holiday cards from T-Shirt Brothers
          </p>
          <Link
            to="/quote?ref=holiday-cards"
            className="mt-6 inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3.5 rounded-lg transition-colors"
          >
            Shop Holiday Cards <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-6 text-emerald-200/80 text-sm italic">Good people make great holidays.</p>
        </div>
      </section>
    </Layout>
  );
}
