// Group storefront at /stores/:slug. Standard ecommerce layout —
// header w/ cart chrome, big hero + Shop CTA, clean product grid.
// The "empty" state still reads as a store: a launch banner with
// email-notify signup and category-preview strip, not a lookbook.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '@/components/Seo';
import { useStoreSlug, storeLink } from '@/lib/storeSubdomain';
import {
  Loader2, ShoppingBag, MapPin, Truck, ShieldCheck, ArrowRight,
  Bell, Target, ChevronRight, Star, Package,
} from 'lucide-react';

interface StoreProfile {
  slug: string;
  name: string;
  brand_json: {
    logo_url?: string;
    primary_color?: string;
    back_url?: string;
    footer_note?: string;
    hero_url?: string;
    tagline?: string;
  };
  store_type: 'franchise' | 'group';
  fulfillment_mode: 'ship_only' | 'pickup_only' | 'both';
  pickup_location_json: {
    name?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    zip?: string;
    hours_note?: string;
  };
  is_fundraiser: boolean;
  fundraiser_json: {
    headline?: string;
    description?: string;
    goal_cents?: number;
    ends_at?: string;
  };
}

interface StoreProduct {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  cover_image: string | null;
  retail_price_cents: number;
  variants_json: { sizes?: string[]; colors?: string[] };
}

function usd(cents: number) { return `$${(cents / 100).toFixed(2)}`; }

// Lighten a hex color for gradient backgrounds
function tint(hex: string, alpha = 0.08) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function GroupStorePage() {
  const slug = useStoreSlug();
  const [store, setStore]       = useState<StoreProfile | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [sRes, pRes] = await Promise.all([
          fetch(`/api/store-shop/${encodeURIComponent(slug)}`),
          fetch(`/api/store-shop/${encodeURIComponent(slug)}/products`),
        ]);
        if (sRes.status === 404) { if (!cancelled) setNotFound(true); return; }
        if (!sRes.ok) throw new Error(`store ${sRes.status}`);
        if (!pRes.ok) throw new Error(`products ${pRes.status}`);
        const s = await sRes.json() as StoreProfile;
        const p = await pRes.json() as { products: StoreProduct[] };
        if (cancelled) return;
        setStore(s);
        setProducts(p.products || []);
      } catch (err) {
        console.error('[GroupStorePage] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (notFound || !store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center">
          <ShoppingBag className="w-12 h-12 mx-auto text-gray-300" />
          <h1 className="text-xl font-semibold mt-4">Store not found</h1>
          <p className="text-sm text-gray-500 mt-1">The store <code>{slug}</code> is not available.</p>
          <Link to="/stores" className="mt-4 inline-block text-sm text-gray-500 hover:text-gray-900">← All stores</Link>
        </div>
      </div>
    );
  }

  const primary = store.brand_json.primary_color || '#111827';
  const isEmpty = products.length === 0;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Seo
        title={`${store.name} · Shop`}
        description={`Shop official ${store.name} merchandise. Designed and printed by TShirt Brothers in Fairburn, GA.`}
        path={`/stores/${slug}`}
      />

      {/* ── Announcement bar ──────────────────────────────────────────── */}
      <div style={{ background: primary }} className="text-white text-center text-xs sm:text-sm py-2 px-4">
        <span className="font-medium">Free local pickup available</span>
        <span className="mx-2 opacity-60">·</span>
        <span>Every order ships from Fairburn, GA within 5 business days</span>
      </div>

      {/* ── Header (real store chrome) ────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link to={storeLink(slug, '/')} className="flex items-center gap-2 min-w-0">
            {store.brand_json.logo_url && (
              <img src={store.brand_json.logo_url} alt="" className="h-9 w-9 object-contain" />
            )}
            <span className="font-bold text-lg truncate" style={{ color: primary }}>{store.name}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 ml-6 text-sm font-medium text-gray-700">
            <a href="#shop" className="hover:text-black">Shop</a>
            {store.is_fundraiser && <a href="#fundraiser" className="hover:text-black">Fundraiser</a>}
            <a href="#about" className="hover:text-black">About</a>
          </nav>
          <div className="flex-1" />
          <Link to={storeLink(slug, '/admin')}
            className="hidden sm:inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-black">
            <Package className="w-4 h-4" /> Admin
          </Link>
          <button
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-white text-sm font-semibold shadow-sm hover:opacity-90"
            style={{ background: primary }}
          >
            <ShoppingBag className="w-4 h-4" />
            <span className="hidden sm:inline">Cart</span>
            <span className="ml-1 bg-white/20 rounded-full px-1.5 py-0.5 text-xs">0</span>
          </button>
        </div>
      </header>

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden border-b border-gray-100"
        style={{ background: `linear-gradient(180deg, ${tint(primary, 0.10)} 0%, #ffffff 100%)` }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            {isEmpty && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
                style={{ background: tint(primary, 0.18), color: primary }}
              >
                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: primary }} />
                Store launching soon
              </span>
            )}
            {store.is_fundraiser && !isEmpty && (
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
                style={{ background: tint(primary, 0.18), color: primary }}
              >
                <Target className="w-3.5 h-3.5" /> Fundraiser
              </span>
            )}

            <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
              {isEmpty ? 'The first drop is on the way.' : `Shop official ${store.name} merch.`}
            </h1>
            <p className="mt-5 text-lg text-gray-600 max-w-xl">
              {isEmpty
                ? `We're printing the first collection right now. Drop your email and be the first to know when it goes live.`
                : store.brand_json.tagline
                  || `Official merchandise for ${store.name}. Designed and screenprinted by TShirt Brothers in Fairburn, GA.`}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              {isEmpty ? (
                <NotifyForm primary={primary} storeSlug={store.slug} />
              ) : (
                <>
                  <a href="#shop"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-white font-semibold shadow-sm hover:opacity-90"
                    style={{ background: primary }}
                  >
                    Shop the collection <ArrowRight className="w-4 h-4" />
                  </a>
                  <a href="#about"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-gray-300 font-semibold hover:border-gray-900">
                    Learn more
                  </a>
                </>
              )}
            </div>

            {/* Trust icons */}
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Secure Stripe checkout</span>
              <span className="inline-flex items-center gap-1.5"><Truck className="w-3.5 h-3.5" /> Ships in 3–5 days</span>
              {(store.fulfillment_mode === 'pickup_only' || store.fulfillment_mode === 'both') && (
                <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> Local pickup available</span>
              )}
              <span className="inline-flex items-center gap-1.5"><Star className="w-3.5 h-3.5" /> Family-owned print shop</span>
            </div>
          </div>

          {/* Hero visual */}
          <div className="relative">
            {store.brand_json.hero_url ? (
              <div className="aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl">
                <img src={store.brand_json.hero_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div
                className="aspect-[4/5] rounded-2xl shadow-2xl flex items-center justify-center relative overflow-hidden"
                style={{ background: primary }}
              >
                {store.brand_json.logo_url ? (
                  <img src={store.brand_json.logo_url} alt="" className="max-w-[60%] max-h-[60%] object-contain" />
                ) : (
                  <span className="text-white text-8xl font-black opacity-90">
                    {store.name.split(' ').map((w) => w[0]).slice(0, 3).join('')}
                  </span>
                )}
                <div
                  className="absolute inset-0 opacity-20"
                  style={{ background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.4), transparent 60%)' }}
                />
              </div>
            )}
            {isEmpty && (
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-lg px-5 py-2 text-sm font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: primary }} />
                Coming soon
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Feature bar ──────────────────────────────────────────────── */}
      <section className="border-b border-gray-100 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Feature icon={<Truck className="w-5 h-5" />}       title="Ships nationwide" body="From our shop in Fairburn, GA" />
          <Feature icon={<ShieldCheck className="w-5 h-5" />} title="Secure checkout" body="Powered by Stripe" />
          <Feature icon={<Star className="w-5 h-5" />}        title="Print-shop quality" body="Screenprinted, not iron-on" />
          <Feature icon={<Package className="w-5 h-5" />}     title="Easy returns" body="30-day satisfaction guarantee" />
        </div>
      </section>

      {/* ── FUNDRAISER (if applicable) ───────────────────────────────── */}
      {store.is_fundraiser && (
        <section id="fundraiser" className="max-w-7xl mx-auto px-4 sm:px-6 pt-16">
          <div
            className="rounded-2xl p-8 md:p-10 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-6 items-center"
            style={{ background: tint(primary, 0.08), border: `1px solid ${tint(primary, 0.25)}` }}
          >
            <div className="rounded-full p-3" style={{ background: primary, color: 'white' }}>
              <Target className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: primary }}>Fundraiser</p>
              <h2 className="text-2xl md:text-3xl font-bold mt-1">
                {store.fundraiser_json.headline || `Every purchase supports ${store.name}.`}
              </h2>
              {store.fundraiser_json.description && (
                <p className="mt-2 text-gray-700">{store.fundraiser_json.description}</p>
              )}
            </div>
            {store.fundraiser_json.ends_at && (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-gray-500">Ends</p>
                <p className="text-xl font-bold mt-1">
                  {new Date(store.fundraiser_json.ends_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── SHOP ─────────────────────────────────────────────────────── */}
      <section id="shop" className="max-w-7xl mx-auto px-4 sm:px-6 py-16">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Shop</p>
            <h2 className="text-3xl font-bold mt-1">{isEmpty ? 'The first collection is coming' : 'The collection'}</h2>
          </div>
          {!isEmpty && (
            <span className="text-sm text-gray-500">{products.length} {products.length === 1 ? 'item' : 'items'}</span>
          )}
        </div>

        {isEmpty ? (
          <EmptyShopStrip primary={primary} storeSlug={store.slug} />
        ) : (
          <ProductGrid products={products} slug={slug} primary={primary} />
        )}
      </section>

      {/* ── About / Why ──────────────────────────────────────────────── */}
      <section id="about" className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-16 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div>
            <h3 className="text-2xl font-bold">Why shop this store?</h3>
            <p className="mt-3 text-gray-600">
              Every item is designed, printed, and shipped by TShirt Brothers — a family-owned print
              shop in Fairburn, Georgia. When you buy from {store.name}, you support both a local
              business and the {store.name} community.
            </p>
          </div>
          <WhyCard icon="🎨" title="Curated designs" body={`Every product is picked and designed with the ${store.name} community in mind.`} />
          <WhyCard icon="🏭" title="Printed local" body="Screenprinted in our Fairburn shop by real people with real presses — never drop-shipped." />
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2">
              {store.brand_json.logo_url && <img src={store.brand_json.logo_url} alt="" className="h-8 w-8 object-contain" />}
              <span className="font-bold text-lg" style={{ color: primary }}>{store.name}</span>
            </div>
            <p className="mt-3 text-sm text-gray-600">
              {store.brand_json.footer_note || `Designed & fulfilled by TShirt Brothers in partnership with ${store.name}.`}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Shop</p>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-700">
              <li><a href="#shop" className="hover:text-black">All products</a></li>
              {store.is_fundraiser && <li><a href="#fundraiser" className="hover:text-black">Fundraiser</a></li>}
              <li><a href="#about" className="hover:text-black">About the store</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Fulfilled by</p>
            <p className="mt-3 text-sm text-gray-700 font-semibold">TShirt Brothers</p>
            <p className="text-sm text-gray-600">6010 Renaissance Parkway<br />Fairburn, GA 30213</p>
            <p className="text-sm text-gray-500 mt-2">
              <a href="mailto:info@tshirtbrothers.com" className="hover:text-black">info@tshirtbrothers.com</a>
            </p>
          </div>
        </div>
        <div className="border-t border-gray-100 py-4 text-center text-xs text-gray-400">
          © {new Date().getFullYear()} {store.name} · Store powered by TShirt Brothers
        </div>
      </footer>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-gray-700 mt-0.5">{icon}</div>
      <div>
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-gray-500 text-xs">{body}</p>
      </div>
    </div>
  );
}

function WhyCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <div className="text-3xl">{icon}</div>
      <h4 className="mt-3 font-bold">{title}</h4>
      <p className="mt-1 text-sm text-gray-600">{body}</p>
    </div>
  );
}

function NotifyForm({ primary, storeSlug }: { primary: string; storeSlug: string }) {
  const [email, setEmail]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: `group-store:${storeSlug}` }),
      });
      if (!res.ok && res.status !== 409) throw new Error(`HTTP ${res.status}`);
      setSigned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  if (signed) {
    return (
      <div className="inline-flex items-center gap-3 rounded-full px-5 py-3 text-sm font-semibold"
        style={{ background: 'rgba(16,185,129,0.10)', color: '#047857' }}>
        <Bell className="w-4 h-4" /> You're on the list — we'll email you at launch.
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="w-full max-w-md">
      <div className="flex items-center gap-2 bg-white rounded-full border border-gray-300 focus-within:border-gray-900 shadow-sm p-1.5">
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          className="flex-1 bg-transparent px-4 py-2 text-sm focus:outline-none"
        />
        <button
          type="submit" disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: primary }}
        >
          <Bell className="w-4 h-4" />
          {busy ? 'Signing up…' : 'Notify me'}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-gray-400">We'll only email you when the store goes live.</p>
    </form>
  );
}

function EmptyShopStrip({ primary, storeSlug }: { primary: string; storeSlug: string }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {['Tees', 'Hoodies', 'Accessories'].map((label, i) => (
          <div key={label}
            className="relative rounded-2xl border border-gray-200 bg-white overflow-hidden p-6 flex flex-col justify-end aspect-[4/5]"
          >
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(180deg, ${tint(primary, 0.05)} 0%, ${tint(primary, 0.14)} 100%)` }}
            />
            <div className="relative">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Category {i + 1} · Coming soon</span>
              <p className="mt-2 text-2xl font-bold">{label}</p>
              <p className="mt-1 text-sm text-gray-500">Restock alert available at launch.</p>
              <button
                type="button"
                onClick={() => {
                  document.getElementById('shop-notify')?.scrollIntoView({ behavior: 'smooth' });
                  document.getElementById('shop-notify-input')?.focus();
                }}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
                style={{ color: primary }}
              >
                Get notified <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div id="shop-notify"
        className="mt-8 rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-4 md:gap-8"
        style={{ background: tint(primary, 0.08), border: `1px solid ${tint(primary, 0.25)}` }}
      >
        <div className="flex-1">
          <h3 className="text-xl font-bold">Be first to shop the drop.</h3>
          <p className="text-sm text-gray-600 mt-1">We'll email you the moment the first products go live. No spam, one message.</p>
        </div>
        <NotifyForm primary={primary} storeSlug={storeSlug} />
      </div>
    </div>
  );
}

function ProductGrid({ products, slug, primary }: { products: StoreProduct[]; slug: string; primary: string }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
      {products.map((p) => (
        <Link
          key={p.id}
          to={storeLink(slug, `/product/${p.slug}`)}
          className="group block"
        >
          <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-100">
            {p.cover_image ? (
              <img
                src={p.cover_image}
                alt={p.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ShoppingBag className="w-10 h-10 text-gray-300" />
              </div>
            )}
          </div>
          <div className="mt-3 flex items-start justify-between gap-3">
            <h3 className="font-semibold text-gray-900 line-clamp-2 leading-tight">{p.title}</h3>
            <p className="font-bold text-gray-900 shrink-0">{usd(p.retail_price_cents)}</p>
          </div>
          <p className="mt-1 text-xs font-semibold hover:underline" style={{ color: primary }}>
            Shop now →
          </p>
        </Link>
      ))}
    </div>
  );
}
