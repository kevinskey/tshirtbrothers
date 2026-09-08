// Landing hero — "Custom Apparel Made Easy." model (2026-09 redesign).
// Matches Kevin's mock exactly on mobile: a COMPACT split hero (text
// left, product collage right, side by side at every width), then three
// action cards in one row, a shop-by-category tile row, and the dark
// trust bar. The old rotating poster no longer lives in the hero.
import { Link } from 'react-router-dom';
import {
  Truck, Tag, ShieldCheck, Clock, MapPin, Users, ChevronRight,
  FileText, Palette, Film,
} from 'lucide-react';

const COLLAGE =
  'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/hero-collage.png';

// Shop-by-category tiles — real product photography (S&S style shots),
// labels match the retail categories the /api/products filter understands.
const SS = 'https://www.ssactivewear.com/Images/Style';
const CATEGORY_TILES = [
  { label: 'T-Shirts',    param: 'T-Shirts',             img: `${SS}/8907_fl.jpg` },
  { label: 'Hoodies',     param: 'Hoodies',              img: `${SS}/395_fl.jpg` },
  { label: 'Hats',        param: 'Headwear',             img: `${SS}/2998_fl.jpg` },
  { label: 'Polos',       param: 'Polos',                img: `${SS}/223_fl.jpg` },
  { label: 'Bags',        param: 'Bags',                 img: `${SS}/15224_fl.jpg` },
  { label: 'Sweatshirts', param: 'Crewneck Sweatshirts', img: `${SS}/372_fl.jpg` },
];

const NAVY = '#1f2a44';

export default function HeroSection() {
  return (
    <section className="bg-white">
      {/* ── Split hero: text LEFT, collage RIGHT — at every width ─────── */}
      <div className="bg-gray-100">
        <div className="mx-auto max-w-7xl pl-4 sm:pl-6 lg:pl-8 grid grid-cols-[1.1fr_1fr] sm:grid-cols-2 items-center gap-2 sm:gap-6">
          <div className="py-6 sm:py-10 lg:py-14">
            <h1
              className="text-[26px] leading-[1.05] sm:text-5xl lg:text-[52px] tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900, color: NAVY }}
            >
              Custom Apparel<br />
              <span className="text-orange-600">Made Easy.</span>
            </h1>
            <p className="mt-2 sm:mt-3 text-sm sm:text-lg lg:text-xl text-gray-700">
              Quality printing. Fast turnaround.<br className="hidden sm:block" /> No minimums.
            </p>

            {/* Trust row lives in the left column on sm+ only — on phones the
                column is ~200px wide and the three labels collide, so a
                full-width copy renders below the split instead. */}
            <div className="mt-6 hidden sm:grid grid-cols-3 max-w-md divide-x divide-gray-300 text-center">
              <div className="px-1.5 sm:px-2">
                <Truck className="h-5 w-5 sm:h-7 sm:w-7 mx-auto text-gray-800" />
                <p className="mt-1 text-[10px] sm:text-sm text-gray-600 leading-tight">1–10 Day<br />Turnaround</p>
              </div>
              <div className="px-1.5 sm:px-2">
                <Tag className="h-5 w-5 sm:h-7 sm:w-7 mx-auto text-gray-800" />
                <p className="mt-1 text-[10px] sm:text-sm text-gray-600 leading-tight">Competitive<br />Pricing</p>
              </div>
              <div className="px-1.5 sm:px-2">
                <ShieldCheck className="h-5 w-5 sm:h-7 sm:w-7 mx-auto text-gray-800" />
                <p className="mt-1 text-[10px] sm:text-sm text-gray-600 leading-tight">Nationwide<br />Shipping</p>
              </div>
            </div>

            {/* Per the layout spec: no CTA buttons in the hero — the three
                ordering cards below are the primary actions. */}
          </div>

          {/* Collage — bleeds to the right edge like the mock */}
          <div className="self-end">
            <img
              src={COLLAGE}
              alt="Custom printed t-shirt, hoodie, and cap by TShirt Brothers"
              width={424}
              height={476}
              className="w-full max-w-[420px] ml-auto object-contain object-bottom"
              loading="eager"
              decoding="sync"
            />
          </div>
        </div>

        {/* Mobile-only trust row — full width so the labels never collide */}
        <div className="sm:hidden mx-auto max-w-7xl px-4 pb-4 grid grid-cols-3 divide-x divide-gray-300 text-center">
          <div className="px-2">
            <Truck className="h-5 w-5 mx-auto text-gray-800" />
            <p className="mt-1 text-[11px] text-gray-600 leading-tight">1–10 Day<br />Turnaround</p>
          </div>
          <div className="px-2">
            <Tag className="h-5 w-5 mx-auto text-gray-800" />
            <p className="mt-1 text-[11px] text-gray-600 leading-tight">Competitive<br />Pricing</p>
          </div>
          <div className="px-2">
            <ShieldCheck className="h-5 w-5 mx-auto text-gray-800" />
            <p className="mt-1 text-[11px] text-gray-600 leading-tight">Nationwide<br />Shipping</p>
          </div>
        </div>
      </div>

      {/* ── Action cards — one row at every width, like the mock ──────── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 mt-4">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <Link to="/quote"
            className="group rounded-2xl bg-orange-600 text-white p-3.5 sm:p-5 flex flex-col shadow-sm transition hover:shadow-lg hover:-translate-y-0.5">
            <FileText className="h-7 w-7 sm:h-9 sm:w-9" />
            <p className="mt-2.5 sm:mt-4 text-sm sm:text-xl font-black leading-tight">Quick Quote</p>
            <p className="mt-1 text-[11px] sm:text-sm text-orange-100 leading-snug flex-1">Choose a product and quantity to see pricing.</p>
            <ChevronRight className="h-4 w-4 sm:h-6 sm:w-6 mt-1.5 self-end transition-transform group-hover:translate-x-1" />
          </Link>

          <Link to="/design"
            className="group rounded-2xl text-white p-3.5 sm:p-5 flex flex-col shadow-sm transition hover:shadow-lg hover:-translate-y-0.5"
            style={{ background: NAVY }}>
            <Palette className="h-7 w-7 sm:h-9 sm:w-9" />
            <p className="mt-2.5 sm:mt-4 text-sm sm:text-xl font-black leading-tight">Design Studio</p>
            <p className="mt-1 text-[11px] sm:text-sm text-gray-300 leading-snug flex-1">Create or upload your design.</p>
            <ChevronRight className="h-4 w-4 sm:h-6 sm:w-6 mt-1.5 self-end transition-transform group-hover:translate-x-1" />
          </Link>

          {/* DTF path: build a gang sheet from individual images (auto-
              nested with a visual proof) or upload a prepared sheet priced
              by the foot at 22" width — both pay in full before production. */}
          <Link to="/dtf"
            className="group rounded-2xl bg-gray-100 text-gray-900 p-3.5 sm:p-5 flex flex-col shadow-sm transition hover:shadow-lg hover:-translate-y-0.5">
            <Film className="h-7 w-7 sm:h-9 sm:w-9" />
            <p className="mt-2.5 sm:mt-4 text-sm sm:text-xl font-black leading-tight">Create a DTF</p>
            <p className="mt-1 text-[11px] sm:text-sm text-gray-600 leading-snug flex-1">Build a gang sheet from your images, or upload one ready to print.</p>
            <ChevronRight className="h-4 w-4 sm:h-6 sm:w-6 mt-1.5 self-end transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* ── Shop by category ────────────────────────────────────────── */}
        <div className="mt-3 sm:mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2.5 sm:gap-3">
          {CATEGORY_TILES.map((c) => (
            <Link key={c.label} to={`/shop?category=${encodeURIComponent(c.param)}`}
              className="rounded-2xl bg-gray-50 border border-gray-100 p-2.5 sm:p-3 text-center transition hover:border-orange-300 hover:bg-orange-50">
              <div className="aspect-square rounded-xl bg-white overflow-hidden flex items-center justify-center">
                <img src={c.img} alt={c.label} loading="lazy"
                  className="w-full h-full object-contain mix-blend-multiply" />
              </div>
              <p className="mt-1.5 sm:mt-2 text-[11px] sm:text-sm font-semibold text-gray-800">{c.label}</p>
            </Link>
          ))}
        </div>

        {/* ── Trust bar ───────────────────────────────────────────────── */}
        <div className="mt-3 sm:mt-4 rounded-2xl text-white px-4 py-3.5 sm:py-4 flex flex-wrap items-center justify-center gap-x-6 sm:gap-x-8 gap-y-1.5 text-xs sm:text-sm"
          style={{ background: NAVY }}>
          <span className="flex items-center gap-2"><Users className="h-4 w-4" /> No Minimums</span>
          <span className="flex items-center gap-2"><Truck className="h-4 w-4" /> Nationwide Shipping</span>
          <span className="flex items-center gap-2"><Clock className="h-4 w-4" /> 1–10 Day Turnaround</span>
        </div>

        <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-gray-600">
          <MapPin className="h-4 w-4 text-orange-500" /> Fairburn, GA
        </p>
        <p className="mt-1 pb-2 text-center text-sm">
          <a href="/es" className="font-bold text-orange-700 hover:underline">
            ¿Hablas español? Ver en español →
          </a>
        </p>
      </div>
    </section>
  );
}
