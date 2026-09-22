import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight } from 'lucide-react';
import GiftFinder from '../components/GiftFinder';
import { useCgcPath } from '../lib/base';

// Homepage imagery: real JDS product photos for live catalog SKUs, with
// the supplier's sample engraving removed (FLUX Kontext + BiRefNet cutout,
// stored at Spaces cgc/clean/) so hero/tile/banner products read as blank.
// PDPs still show the raw supplier photo. Regenerate via the scripts noted
// in memory if these SKUs change.
const CATEGORY_TILES = [
  { label: 'Personalized Gifts', img: 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/cgc/clean/CE6506.png?v=3' },
  { label: 'Drinkware', img: 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/cgc/clean/SM11CC.png?v=3' },
  { label: 'Awards & Trophies', img: 'https://res.cloudinary.com/business-products/image/upload/q_auto/v1684178262/products/images/large/CRY059M--f3d39835.png' },
  { label: 'Leather & Leatherette', img: 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/cgc/clean/GFT352A.png?v=3' },
  // Best hat-adjacent imagery in the published set (hat clip w/ ball
  // marker) — swap once real JDS hat/patch SKUs are published.
  { label: 'Hats & Patches', img: 'https://res.cloudinary.com/business-products/image/upload/q_auto/v1667530343/products/images/large/GFT207--5dbedfc6.jpg' },
  { label: 'Blanks & Supplies', img: 'https://res.cloudinary.com/business-products/image/upload/q_auto/v1669760690/products/images/large/SM11W--5c0668a1.png' },
];

const BANNER_ITEMS = [
  { img: 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/cgc/clean/LTM7102.png?v=3', alt: 'Black insulated tumbler', cls: 'h-28 sm:h-40' },
  { img: 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/cgc/clean/LZGB11.png?v=3', alt: 'Black gift box', cls: 'h-24 sm:h-36' },
  { img: 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/cgc/clean/LTM852.png?v=3', alt: 'Black stemless wine tumbler', cls: 'h-20 sm:h-28' },
];

export default function HomePage() {
  const p = useCgcPath();
  const shopHref = (category?: string) =>
    category ? `${p('/shop')}?category=${encodeURIComponent(category)}` : p('/shop');

  return (
    <>
      <Helmet>
        <title>Custom Gift Club — Personalized Gifts, Drinkware & Awards</title>
        <meta name="description" content="Turn names, memories, and milestones into gifts worth keeping. Personalized gifts, drinkware, awards, and more from Custom Gift Club." />
      </Helmet>

      {/* Hero */}
      <section className="bg-cgc-cream" aria-labelledby="hero-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 lg:py-20 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.15em] text-cgc-orange">
              Personal gifts. Real connections.
            </p>
            <h1 id="hero-heading" className="mt-3 text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.08] tracking-tight text-cgc-ink">
              Give something<br className="hidden sm:block" />{' '}
              <span className="text-cgc-orange">only you</span> could give<span className="text-cgc-orange">.</span>
            </h1>
            <p className="mt-4 text-base sm:text-lg text-cgc-charcoal max-w-md">
              Turn names, memories, and milestones into gifts worth keeping.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to={p('/shop')}
                className="inline-flex items-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3.5 transition-colors"
              >
                Find My Gift <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                to={p('/shop')}
                className="inline-flex items-center rounded-lg border-2 border-cgc-ink text-cgc-ink font-bold px-6 py-3.5 hover:bg-cgc-ink hover:text-white transition-colors"
              >
                Shop All Products
              </Link>
            </div>
          </div>

          {/* Doc's approved hero photograph (2026-09-22): staged shot of
              the tumbler / board / journal / crystal on pedestals. The
              pictured product types are all live catalog items; the whole
              image shops the assortment. */}
          <Link to={p('/shop')} aria-label="Shop all products">
            <img
              src="/cgc-hero.jpg"
              alt="Personalized gifts: orange tumbler, walnut cutting board, leather journal, and crystal award"
              className="rounded-2xl w-full h-auto shadow-sm"
              fetchPriority="high"
            />
          </Link>
        </div>
      </section>

      {/* Holiday collection strip — campaign headline lives on /holiday */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8" aria-labelledby="holiday-strip-heading">
        <Link
          to={p('/holiday')}
          className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-cgc-orange text-white px-6 sm:px-10 py-6"
        >
          <div>
            <h2 id="holiday-strip-heading" className="text-xl sm:text-2xl font-extrabold tracking-tight">
              The Holiday Collection is coming.
            </h2>
            <p className="mt-1 text-white/90 text-sm sm:text-base">
              Personalized tumblers, cutting boards, ornaments &amp; journals — engraved to order.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 font-bold whitespace-nowrap group-hover:gap-3 transition-all">
            See Holiday Gifts <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </Link>
      </section>

      <GiftFinder />

      {/* Categories */}
      <section className="py-10 sm:py-14" aria-labelledby="categories-heading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between gap-4 mb-6">
            <h2 id="categories-heading" className="text-2xl sm:text-3xl font-extrabold tracking-tight text-cgc-ink">
              A little thought. A lot of possibilities.
            </h2>
            <Link to={p('/shop')} className="hidden sm:inline-flex items-center gap-1.5 text-sm font-bold text-cgc-orange hover:text-cgc-orange-dark whitespace-nowrap">
              Shop all categories <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {CATEGORY_TILES.map((tile) => (
              <Link key={tile.label} to={shopHref(tile.label)} className="group text-center">
                <div className="aspect-square rounded-xl bg-cgc-cream flex items-center justify-center p-6 overflow-hidden group-hover:shadow-md transition-shadow">
                  <img
                    src={tile.img}
                    alt=""
                    loading="lazy"
                    className="max-h-full max-w-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform"
                  />
                </div>
                <span className="mt-2.5 block text-sm font-bold text-cgc-ink group-hover:text-cgc-orange transition-colors">
                  {tile.label}
                </span>
              </Link>
            ))}
          </div>
          <Link to={p('/shop')} className="sm:hidden mt-5 inline-flex items-center gap-1.5 text-sm font-bold text-cgc-orange">
            Shop all categories <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* Business gifting banner */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6" aria-labelledby="business-heading">
        <div className="rounded-2xl bg-cgc-ink text-white overflow-hidden">
          <div className="grid lg:grid-cols-2 items-center gap-6 px-6 sm:px-10 py-10 sm:py-12">
            <div>
              <h2 id="business-heading" className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                Your brand. <span className="text-cgc-orange">Their new favorite.</span>
              </h2>
              <p className="mt-3 text-white/80">
                Custom gifts and recognition for your team, clients, and community.
              </p>
              <Link
                to={p('/business')}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3.5 transition-colors"
              >
                Explore Business Gifting <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <div className="flex items-end justify-between gap-4 min-w-0">
              <div className="flex flex-1 items-end justify-center gap-3 sm:gap-5 min-w-0">
                {BANNER_ITEMS.map((item) => (
                  <img key={item.img} src={item.img} alt={item.alt} loading="lazy"
                    className={`${item.cls} w-auto max-w-[30%] object-contain drop-shadow-2xl`} />
                ))}
              </div>
              <span
                className="hidden xl:block shrink-0 text-cgc-orange text-3xl leading-snug -rotate-6 select-none"
                style={{ fontFamily: 'Caveat, cursive' }}
                aria-hidden
              >
                Custom<br />Creates<br />Connection
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
