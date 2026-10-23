import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { fetchProducts, postLead } from '../lib/api';
import { JOGGERS_SLUG, STORE_SLUG, colorsFor, photoFor, usd } from '../lib/catalog';
import { useLhtPath } from '../lib/base';
import { useStoreContent, slotField } from '@/lib/useStoreContent';
import ProductCard from '../components/ProductCard';

const VALUES = [
  { title: 'Integrity', line: 'We say what we mean and stand behind it.' },
  { title: 'Respect', line: 'Honest words delivered with care.' },
  { title: 'Accountability', line: 'Own it, correct it, keep moving.' },
  { title: 'Courage', line: 'Truth takes a spine. Wear one.' },
];

const MISSION = ['Explain the truth', 'Be the truth', 'Speak the truth', 'Wear the truth', 'Live the truth'];

const FILTERS: { key: string; label: string; match: (slug: string) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'sets', label: 'Sets', match: (s) => s.includes('joggers') },
  { key: 'journals', label: 'Journals', match: (s) => s.includes('journal') },
  { key: 'mugs', label: 'Mugs', match: (s) => s.includes('mug') },
  { key: 'hats', label: 'Hats', match: (s) => s.includes('hat') },
];

export default function HomePage() {
  const p = useLhtPath();
  const location = useLocation();
  const { content } = useStoreContent(STORE_SLUG);
  const { data } = useQuery({ queryKey: ['lht-products'], queryFn: fetchProducts });
  const products = useMemo(() => data?.products ?? [], [data]);

  const joggers = products.find((x) => x.slug === JOGGERS_SLUG);
  const setColors = colorsFor(JOGGERS_SLUG);
  const params = new URLSearchParams(location.search);
  const deepColor = params.get('truthColor');
  const [selectedColor, setSelectedColor] = useState(
    setColors.find((c) => c.key === deepColor?.toLowerCase())?.label ?? 'Espresso',
  );
  const [filter, setFilter] = useState('all');

  // SPA hash navigation (/#shop, /#about …): scroll once content exists.
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, [location.hash, products.length]);

  // Newsletter
  const [email, setEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);
  const subscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubscribing(true);
    try {
      await postLead({ email: email.trim(), consent: true, source: 'newsletter' });
      toast.success('You’re on the list. Drops land in your inbox first.');
      setEmail('');
    } catch {
      toast.error('Could not subscribe — please try again.');
    } finally {
      setSubscribing(false);
    }
  };

  const activeFilter = FILTERS.find((f) => f.key === filter);
  const shown = activeFilter ? products.filter((x) => activeFilter.match(x.slug)) : products;
  const heroPhoto = photoFor(JOGGERS_SLUG, selectedColor, joggers?.cover_image ?? '/lht/set-espresso.jpg');

  // Every string below is the fallback the page shipped with, so clearing a
  // field in the back office restores this wording rather than blanking the
  // banner.
  const hero = {
    eyebrow: slotField(content, 'hero', 'eyebrow', 'Fall 2026 · Now shipping'),
    headline: slotField(content, 'hero', 'headline', 'Live Hard Truth'),
    subcopy: slotField(content, 'hero', 'subcopy',
      'Truth looks good on you. The heavyweight hoodie and jogger collection, '
      + 'photographed exactly as it is and built to be worn loud.'),
    ctaLabel: slotField(content, 'hero', 'cta_label', 'Shop the drop'),
    ctaHref: slotField(content, 'hero', 'cta_href', '#shop'),
    imageUrl: slotField(content, 'hero', 'image_url', '/lht/campaign.jpg'),
  };

  return (
    <div className="bg-lht-ink text-lht-cream font-lht-sans">
      <Helmet>
        <title>Live Hard Truth — Streetwear Worn Loud</title>
        <meta name="description" content="Live Hard Truth luxury streetwear. Shop the Fall 2026 heavyweight hoodie and jogger collection in eleven colors, and find your Truth Color." />
      </Helmet>

      {/* Hero — copy and image come from the back office when the owner has
          set them, otherwise from the defaults below. */}
      <section id="top" className="relative overflow-hidden">
        <img
          src={hero.imageUrl}
          alt="Live Hard Truth hoodie and classic joggers in chestnut brown"
          className="absolute inset-0 h-full w-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-lht-ink via-lht-ink/60 to-transparent" />
        <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-28 sm:py-40 lg:py-52">
          <p className="text-xs sm:text-sm font-bold uppercase tracking-[0.3em] text-lht-cyan">
            {hero.eyebrow}
          </p>
          <h1 className="mt-4 font-lht-display uppercase leading-[0.95] text-5xl sm:text-7xl lg:text-8xl max-w-4xl">
            {hero.headline}
          </h1>
          <p className="mt-6 max-w-xl text-base sm:text-lg text-lht-cream/85">
            {hero.subcopy}
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href={hero.ctaHref.startsWith('#') ? p(`/${hero.ctaHref}`) : hero.ctaHref}
              className="inline-flex items-center gap-2 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors">
              {hero.ctaLabel} <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <Link to={p('/truth')} className="inline-flex items-center gap-2 border border-lht-cream/40 text-lht-cream font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:border-lht-cyan hover:text-lht-cyan transition-colors">
              Start your Truth Session
            </Link>
          </div>
        </div>
      </section>

      {/* Showroom — the set in eleven colors */}
      <section id="fall" className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-20">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-lht-cyan">Digital showroom · Fall Edition 2026</p>
        <h2 className="mt-3 font-lht-display uppercase text-3xl sm:text-5xl">The collection</h2>
        <p className="mt-3 max-w-2xl text-lht-stone">
          The classic joggers set in eleven colors. Select a color to view the
          matching photograph.
        </p>
        <div className="mt-10 grid gap-10 lg:grid-cols-2 items-start">
          <div className="aspect-square bg-lht-ink-soft border border-lht-cream/10 overflow-hidden">
            {heroPhoto && (
              <img src={heroPhoto} alt={`LIVE HARD TRUTH Joggers Set in ${selectedColor}`} className="h-full w-full object-cover" />
            )}
          </div>
          <div>
            <h3 className="font-lht-display uppercase text-xl sm:text-2xl">LIVE HARD TRUTH Joggers Set</h3>
            <p className="mt-2 text-lht-stone">
              Heavyweight hoodie with matching classic tapered joggers and side pockets.
            </p>
            {joggers && <p className="mt-4 text-2xl font-semibold">{usd(joggers.retail_price_cents)}</p>}
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Color — {selectedColor}</p>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {setColors.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  aria-pressed={selectedColor === c.label}
                  onClick={() => setSelectedColor(c.label)}
                  className={`h-9 w-9 rounded-full border-2 transition-all ${selectedColor === c.label ? 'border-lht-cyan scale-110' : 'border-lht-cream/25 hover:border-lht-cream/60'}`}
                  style={{ backgroundColor: c.swatch }}
                />
              ))}
            </div>
            <Link
              to={`${p(`/product/${JOGGERS_SLUG}`)}?color=${encodeURIComponent(selectedColor)}`}
              className="mt-10 inline-flex items-center gap-2 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors"
            >
              Shop this set <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Shop grid */}
      <section id="shop" className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 pb-20">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-lht-cyan">The shop</p>
        <h2 className="mt-3 font-lht-display uppercase text-3xl sm:text-4xl">The collection — Live Hard Truth</h2>
        <div className="mt-6 flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-5 py-2 text-sm font-semibold uppercase tracking-[0.12em] border transition-colors ${filter === f.key ? 'bg-lht-cream text-lht-ink border-lht-cream' : 'border-lht-cream/25 text-lht-cream/80 hover:border-lht-cream/60'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
        {products.length === 0 && (
          <p className="mt-10 text-lht-stone">The collection is loading…</p>
        )}
      </section>

      {/* About */}
      <section id="about" className="border-t border-lht-cream/10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-20 grid gap-12 lg:grid-cols-2 items-center">
          <div className="aspect-[4/5] overflow-hidden bg-lht-ink-soft">
            <img src="/lht/set-olive.jpg" alt="Live Hard Truth olive hoodie and classic jogger set" className="h-full w-full object-cover" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-lht-cyan">About the brand</p>
            <h2 className="mt-3 font-lht-display uppercase text-3xl sm:text-4xl">About Hard Truth</h2>
            <p className="mt-5 text-lht-cream/85 leading-relaxed">
              Hard Truth was built for people who lead with honesty. Every
              piece carries the signature LIVE HARD TRUTH mark — embossed
              tone-on-tone, cut heavyweight, made to be worn hard.
            </p>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Our mission is simple</p>
            <ul className="mt-4 space-y-2">
              {MISSION.map((m) => (
                <li key={m} className="font-lht-display uppercase text-lg sm:text-xl text-lht-cream/90">{m}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Guide promo */}
      <section className="border-t border-lht-cream/10 bg-lht-ink-soft">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-20 grid gap-12 lg:grid-cols-[320px,1fr] items-center">
          <Link to={p('/guide')} className="block max-w-[320px] mx-auto lg:mx-0">
            <img src="/lht/guide-cover.png" alt="The Other Side of Fourteen guide cover" className="w-full border border-lht-cream/15 hover:border-lht-cyan/60 transition-colors" />
          </Link>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-lht-cyan">A free guide from Leora Johnson</p>
            <h2 className="mt-3 font-lht-display uppercase text-2xl sm:text-4xl leading-tight">
              The Other Side of Fourteen: 5 Tips to Living Your Hard Truth
            </h2>
            <p className="mt-5 text-lht-cream/85 max-w-xl">
              What 14 years taught Leora about losing a life, and finding her own.
            </p>
            <Link to={p('/guide')} className="mt-8 inline-flex items-center gap-2 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors">
              Get the free guide <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* The movement */}
      <section id="community" className="relative overflow-hidden border-t border-lht-cream/10">
        <img src="/lht/movement.jpg" alt="The Hard Truth community" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="relative max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-24">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-lht-cyan">The movement</p>
          <h2 className="mt-3 font-lht-display uppercase text-3xl sm:text-5xl max-w-2xl">This isn't just clothing</h2>
          <p className="mt-5 max-w-xl text-lht-cream/85">
            It's a commitment to showing up honestly. Wear the truth wherever
            life takes you.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map((v) => (
              <div key={v.title} className="border border-lht-cream/20 bg-lht-ink/70 backdrop-blur p-6">
                <h3 className="font-lht-display uppercase text-lht-cyan">{v.title}</h3>
                <p className="mt-2 text-sm text-lht-cream/80">{v.line}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="border-t border-lht-cream/10">
        <div className="max-w-screen-md mx-auto px-4 sm:px-6 py-20 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-lht-cyan">Join the movement</p>
          <h2 className="mt-3 font-lht-display uppercase text-3xl sm:text-4xl">Get the drops first</h2>
          <p className="mt-4 text-lht-stone">
            New drops, limited colorways and community stories — straight to your inbox.
          </p>
          <form onSubmit={subscribe} className="mt-8 flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <label htmlFor="lht-newsletter-email" className="sr-only">Email</label>
            <input
              id="lht-newsletter-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="flex-1 bg-transparent border border-lht-cream/30 px-5 py-3.5 text-lht-cream placeholder:text-lht-cream/40 focus:border-lht-cyan focus:outline-none"
            />
            <button
              type="submit"
              disabled={subscribing}
              className="bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-3.5 hover:bg-lht-cyan-dark transition-colors disabled:opacity-60"
            >
              {subscribing ? 'Subscribing…' : 'Subscribe'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
