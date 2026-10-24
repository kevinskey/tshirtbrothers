// TSB Pro Business Web Store storefront.
//
// Rendered by GroupStorePage when the store's store_type is 'business'.
// Unlike organization group stores (which get full white-label chrome),
// a business store keeps the normal T-Shirt Brothers global header and
// footer — everything below the header is the business's home: their
// logo, name, address, website link, and ONLY their approved products.
// Primary action: reorder. Secondary: Create a New Design (existing
// Design Studio).
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import StoreMark from '@/components/stores/StoreMark';
import PoweredByFooter from '@/components/stores/PoweredByFooter';
import { storeLink } from '@/lib/storeSubdomain';
import { useStoreContent, slotField } from '@/lib/useStoreContent';
import { MapPin, ExternalLink, ShoppingBag, PenTool, ArrowRight } from 'lucide-react';

interface BusinessStoreProfile {
  slug: string;
  name: string;
  brand_json: {
    logo_url?: string;
    hero_url?: string;
    primary_color?: string;
    tagline?: string;
    footer_note?: string;
    business_address?: string;
    website_url?: string;
    demo?: boolean;
  };
}

interface BusinessStoreProduct {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  retail_price_cents: number;
  variants_json: { sizes?: string[]; colors?: string[] };
}

function usd(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

export default function BusinessStoreFront({
  store, products, slug,
}: {
  store: BusinessStoreProfile;
  products: BusinessStoreProduct[];
  slug: string;
}) {
  const brand = store.brand_json;
  const primary = brand.primary_color || '#1f2a44';

  // Owner-editable banner. Each falls back to exactly what this page
  // rendered before the Storefront tab existed, so a store that has never
  // opened the editor is unchanged.
  const { content } = useStoreContent(slug);
  const eyebrow  = slotField(content, 'hero', 'eyebrow', 'TSB Pro Business Store');
  const headline = slotField(content, 'hero', 'headline', store.name);
  const subcopy  = slotField(content, 'hero', 'subcopy', brand.tagline ?? '');
  const heroImage = slotField(content, 'hero', 'image_url', brand.hero_url ?? '');

  // 10% of the store's colour — enough to read as theirs, light enough to
  // keep near-black body text above the contrast floor. A full-strength
  // brand colour behind gray-900 text is how a store ends up unreadable.
  const tint = `color-mix(in srgb, ${primary} 10%, white)`;
  const website = brand.website_url;
  const websiteLabel = website?.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <Layout>
      <Seo
        title={`${store.name} · Business Store`}
        description={`${store.name}'s company apparel store — approved products, easy reordering. Powered by T-Shirt Brothers.`}
        path={`/stores/${slug}`}
        image={brand.logo_url || undefined}
      />

      {/* ── Identity band ──────────────────────────────────────────────
          Full-bleed and tinted with the store's own colour rather than a
          white strip inside the page gutters. A store's banner is the
          first thing a shopper sees, and the contained version read as a
          row of the TSB site that happened to mention them.

          The headline, eyebrow and tagline come from the Storefront tab
          when the owner has set them. Before this they were saved and
          then ignored here — this page only ever rendered the store's
          name — so an owner could fill the form in and watch nothing
          happen. Every field falls back to what the page showed before.

          A feature image, if there is one, sits on the RIGHT at the same
          full height, masked into the band on its left edge so the copy
          can run under it without a seam. */}
      <section className="relative overflow-hidden border-b border-gray-200"
        style={{ backgroundColor: tint }}>
        {heroImage && (
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] sm:block
                          [mask-image:linear-gradient(to_right,transparent,black_45%)]">
            <img src={heroImage} alt="" className="h-full w-full object-cover object-center" />
          </div>
        )}
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <StoreMark name={store.name} logoUrl={brand.logo_url} color={primary} size="lg"
              className={brand.logo_url ? 'border border-gray-100 shadow-sm p-2' : 'shadow-sm'} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600">
                {eyebrow}
              </p>
              <h1 className="mt-1 text-3xl sm:text-5xl font-black tracking-tight text-gray-900">
                {headline}
              </h1>
              {subcopy && (
                <p className="mt-2 max-w-xl text-gray-600">{subcopy}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                {brand.business_address && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-gray-400" /> {brand.business_address}
                  </span>
                )}
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-orange-700 hover:text-orange-800 font-medium"
                  >
                    <ExternalLink className="w-4 h-4" /> {websiteLabel}
                  </a>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400 sm:self-end whitespace-nowrap">
              Powered by <span className="font-semibold text-gray-500">T-Shirt Brothers</span>
            </p>
          </div>
        </div>
      </section>

      {/* ── Products ───────────────────────────────────────────────────── */}
      <section className="bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900">Your company&rsquo;s apparel</h2>
              <p className="mt-1 text-sm text-gray-500">
                Approved products, ready to reorder. Pick a size and quantity — artwork is already on file.
              </p>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-gray-300 bg-white p-12 text-center">
              <ShoppingBag className="w-10 h-10 mx-auto text-gray-300" />
              <p className="mt-4 font-semibold text-gray-900">Your products are being set up.</p>
              <p className="mt-1 text-sm text-gray-500">
                We&rsquo;re loading your approved apparel now. Questions? Call or text (470) 622-1392.
              </p>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              {products.map((p) => (
                <Link
                  key={p.id}
                  to={storeLink(slug, `/product/${p.slug}`)}
                  className="group bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all"
                >
                  <div className="aspect-square bg-gray-100">
                    {p.cover_image ? (
                      <img
                        src={p.cover_image}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ShoppingBag className="w-12 h-12 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 leading-snug line-clamp-2">{p.title}</h3>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-bold" style={{ color: primary }}>{usd(p.retail_price_cents)}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700">
                        Reorder <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Secondary action: new design ───────────────────────────────── */}
      <section className="bg-white border-t border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="rounded-2xl bg-gray-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="flex-1">
              <h3 className="text-lg sm:text-xl font-bold">Need something new?</h3>
              <p className="mt-1 text-sm text-white/70 max-w-xl">
                Create a new design in the T-Shirt Brothers Design Studio — we&rsquo;ll add the
                approved product to your store so it&rsquo;s here next time.
              </p>
            </div>
            <Link
              to="/design"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-colors"
            >
              <PenTool className="w-4 h-4" /> Create a New Design
            </Link>
          </div>
        </div>
      </section>
      <PoweredByFooter storeName={store.name} logoUrl={brand.logo_url} color={primary} note={brand.footer_note} />
    </Layout>
  );
}
