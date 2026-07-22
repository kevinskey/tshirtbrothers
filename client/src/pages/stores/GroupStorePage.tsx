// Group storefront at /stores/:slug. White-label by store brand_json.
// Design direction: "Varsity Editorial" — chunky serif italic hero,
// kraft accent tones, marquee ticker, printed-poster feel. The empty
// state is treated as a "coming soon" launch page (email capture) so
// stores look polished even before products are added.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '@/components/Seo';
import { Loader2, Target, MapPin, Truck, ArrowRight, Mail } from 'lucide-react';

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

const CREAM = '#faf7f0';
const INK   = '#111111';

export default function GroupStorePage() {
  const { slug = '' } = useParams<{ slug: string }>();
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: CREAM }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: INK }} />
      </div>
    );
  }
  if (notFound || !store) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: CREAM }}>
        <div className="text-center">
          <p className="tsb-font-mono text-xs uppercase tracking-[0.3em] text-neutral-500">Not found</p>
          <h1 className="tsb-font-display italic text-5xl mt-3" style={{ color: INK }}>Store not found.</h1>
          <p className="text-sm text-neutral-500 mt-2 tsb-font-mono">/{slug}</p>
          <Link to="/stores" className="mt-6 inline-block text-sm underline underline-offset-4 hover:no-underline">All stores</Link>
        </div>
      </div>
    );
  }

  const primary = store.brand_json.primary_color || INK;
  const isEmpty = products.length === 0;

  return (
    <div style={{ background: CREAM, color: INK }} className="min-h-screen">
      <Seo
        title={`${store.name} · Store`}
        description={`Official merchandise for ${store.name}. Designed and printed by TShirt Brothers in Fairburn, GA.`}
        path={`/stores/${slug}`}
      />

      {/* ── Sticky top bar ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 backdrop-blur-sm" style={{ background: `${CREAM}ee`, borderBottom: `1px solid ${INK}10` }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-4">
          <Link to="/stores" className="tsb-font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500 hover:text-black">
            ← Stores
          </Link>
          <div className="flex-1 flex items-center gap-2 justify-center">
            {store.brand_json.logo_url && (
              <img src={store.brand_json.logo_url} alt="" className="h-6 w-6 object-contain" />
            )}
            <span className="tsb-font-display italic text-lg leading-none" style={{ color: primary }}>{store.name}</span>
          </div>
          <Link
            to={`/stores/${slug}/admin`}
            className="tsb-font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500 hover:text-black"
          >
            Admin →
          </Link>
        </div>
      </div>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ background: primary, color: 'white' }}>
        <div className="tsb-grain" />

        {/* Big issue-number / edition mark, top corner — editorial touch */}
        <div className="absolute top-6 right-6 tsb-font-mono text-[10px] uppercase tracking-[0.25em] opacity-70">
          Edition N°01 · Est. {new Date().getFullYear()}
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-16 pb-24 md:pt-24 md:pb-32 relative">
          <p className="tsb-font-mono text-[11px] uppercase tracking-[0.35em] opacity-80">
            {store.is_fundraiser ? 'Fundraiser · Limited run' : 'Official Merchandise'}
          </p>

          <h1 className="tsb-font-display italic mt-6 leading-[0.88] tracking-tight" style={{ fontWeight: 400 }}>
            <span className="block text-5xl sm:text-7xl md:text-8xl lg:text-[9.5rem]">
              {store.name}
            </span>
          </h1>

          {store.brand_json.tagline && (
            <p className="mt-8 max-w-xl text-lg md:text-xl leading-snug opacity-90 tsb-font-display italic">
              {store.brand_json.tagline}
            </p>
          )}

          <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 tsb-font-mono text-[10px] uppercase tracking-[0.25em] opacity-90">
            <span>Printed in Fairburn, GA</span>
            <span className="opacity-40">·</span>
            <span>Fulfilled by TShirt Brothers</span>
            <span className="opacity-40">·</span>
            <span>Ships in 3–5 days</span>
          </div>
        </div>

        {/* Marquee ticker at the bottom of the hero */}
        <div className="border-y overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.25)' }}>
          <div className="tsb-marquee-track flex whitespace-nowrap py-3">
            {[...Array(2)].map((_, dupe) => (
              <div key={dupe} className="flex items-center shrink-0 tsb-font-mono text-[11px] uppercase tracking-[0.35em] opacity-80">
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} className="flex items-center shrink-0">
                    <span className="px-6">{store.name}</span>
                    <span className="opacity-40">✦</span>
                    <span className="px-6">Est. {new Date().getFullYear()}</span>
                    <span className="opacity-40">✦</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust strip (kraft tone) ───────────────────────────────────── */}
      <section style={{ background: '#efe7d6', color: INK }} className="border-y" >
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-4 tsb-font-mono text-[10px] uppercase tracking-[0.3em]">
          {(store.fulfillment_mode === 'ship_only' || store.fulfillment_mode === 'both') && (
            <span className="inline-flex items-center gap-2"><Truck className="w-3.5 h-3.5" /> Ships to you</span>
          )}
          {(store.fulfillment_mode === 'pickup_only' || store.fulfillment_mode === 'both') && (
            <span className="inline-flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5" />
              Pickup {store.pickup_location_json.name ? `· ${store.pickup_location_json.name}` : ''}
            </span>
          )}
          <span className="inline-flex items-center gap-2">Secure checkout · Stripe</span>
          <span className="inline-flex items-center gap-2">Family-owned printshop · Since 2013</span>
        </div>
      </section>

      {/* ── FUNDRAISER (if applicable) ─────────────────────────────────── */}
      {store.is_fundraiser && (
        <section className="max-w-6xl mx-auto px-6 pt-14">
          <div
            className="p-8 md:p-10 border-2 grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-6 items-center"
            style={{ borderColor: INK, background: CREAM }}
          >
            <div className="tsb-font-mono text-[10px] uppercase tracking-[0.3em] flex items-center gap-2">
              <Target className="w-4 h-4" style={{ color: primary }} /> Fundraiser
            </div>
            <div>
              <h2 className="tsb-font-display italic text-3xl md:text-4xl leading-tight">
                {store.fundraiser_json.headline || `Every shirt supports ${store.name}.`}
              </h2>
              {store.fundraiser_json.description && (
                <p className="mt-2 text-neutral-700">{store.fundraiser_json.description}</p>
              )}
            </div>
            {store.fundraiser_json.ends_at && (
              <div className="tsb-font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-600">
                Ends<br />
                <span className="text-base tsb-font-display italic tracking-normal">
                  {new Date(store.fundraiser_json.ends_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── MAIN ───────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-14">
        {/* Section label */}
        <div className="flex items-baseline justify-between border-b-2 pb-4 mb-10" style={{ borderColor: INK }}>
          <h2 className="tsb-font-display italic text-3xl md:text-4xl">
            {isEmpty ? 'Store opens soon.' : 'The Collection.'}
          </h2>
          <span className="tsb-font-mono text-[11px] uppercase tracking-[0.3em] text-neutral-500">
            {isEmpty ? 'N°01' : `${products.length} piece${products.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {isEmpty ? <EmptyState primary={primary} store={store} /> : <ProductGrid products={products} slug={slug} primary={primary} />}
      </main>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer className="border-t" style={{ borderColor: `${INK}22` }}>
        <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
          <div>
            <p className="tsb-font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500">Colophon</p>
            <p className="mt-2 tsb-font-display italic text-lg">
              This store is a collaboration between{' '}
              <strong className="not-italic font-semibold">{store.name}</strong> and{' '}
              <strong className="not-italic font-semibold">TShirt Brothers</strong> of Fairburn, Georgia.
            </p>
            {store.brand_json.footer_note && (
              <p className="mt-2 text-sm text-neutral-600">{store.brand_json.footer_note}</p>
            )}
          </div>
          <div className="tsb-font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500 md:text-right">
            <p>6010 Renaissance Parkway</p>
            <p>Fairburn, GA 30213</p>
            <p className="mt-2 opacity-60">© {new Date().getFullYear()} · All rights reserved</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Empty state: "coming soon" as a designed moment ────────────────────
function EmptyState({ primary, store }: { primary: string; store: StoreProfile }) {
  const [email, setEmail]   = useState('');
  const [busy, setBusy]     = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email) return;
    setBusy(true); setError(null);
    try {
      // Reuse the existing newsletter endpoint; tag with store slug so we
      // know who to notify at launch.
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: `group-store:${store.slug}` }),
      });
      if (!res.ok && res.status !== 409) throw new Error(`HTTP ${res.status}`);
      setSigned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16 items-start">
      <div>
        <p className="tsb-font-display italic text-2xl md:text-3xl leading-snug text-neutral-800">
          The first drop is being screenprinted right now. Leave your email and we'll ping you the moment it goes live.
        </p>

        <form onSubmit={submit} className="mt-10 max-w-md">
          {signed ? (
            <div className="border-2 p-5" style={{ borderColor: INK }}>
              <p className="tsb-font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500">Confirmed</p>
              <p className="mt-2 tsb-font-display italic text-2xl">You're on the list.</p>
            </div>
          ) : (
            <>
              <label className="tsb-font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500 flex items-center gap-2">
                <Mail className="w-3.5 h-3.5" /> Get the first look
              </label>
              <div className="mt-3 flex items-center border-b-2 focus-within:border-black" style={{ borderColor: INK }}>
                <input
                  type="email" required autoFocus value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 tsb-font-display italic text-2xl md:text-3xl bg-transparent py-3 focus:outline-none placeholder:text-neutral-300"
                />
                <button
                  type="submit" disabled={busy}
                  className="p-3 disabled:opacity-40"
                  style={{ color: primary }}
                  aria-label="Notify me"
                >
                  <ArrowRight className="w-6 h-6" />
                </button>
              </div>
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
              <p className="mt-3 tsb-font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-400">
                One email, one time. No spam.
              </p>
            </>
          )}
        </form>
      </div>

      {/* Dotted-slot grid — hints at what's coming */}
      <div>
        <p className="tsb-font-mono text-[10px] uppercase tracking-[0.3em] text-neutral-500 mb-4">In the queue</p>
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square border-2 border-dashed flex items-center justify-center"
              style={{
                borderColor: `${INK}22`,
                background: `repeating-linear-gradient(45deg, transparent 0 8px, ${INK}05 8px 9px)`,
              }}
            >
              <span className="tsb-font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-400">
                N°{String(i + 1).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Product grid ───────────────────────────────────────────────────────
function ProductGrid({ products, slug, primary }: { products: StoreProduct[]; slug: string; primary: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
      {products.map((p, idx) => (
        <Link
          key={p.id}
          to={`/stores/${slug}/product/${p.slug}`}
          className="group block"
        >
          <div className="relative overflow-hidden" style={{ background: '#efe7d6' }}>
            <div className="aspect-[4/5]">
              {p.cover_image ? (
                <img
                  src={p.cover_image}
                  alt={p.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center tsb-font-display italic text-6xl text-neutral-300">
                  {p.title.slice(0, 1)}
                </div>
              )}
            </div>
            <span
              className="absolute top-3 left-3 tsb-font-mono text-[10px] uppercase tracking-[0.25em] px-2 py-1"
              style={{ background: 'white', color: INK }}
            >
              N°{String(idx + 1).padStart(2, '0')}
            </span>
          </div>
          <div className="mt-4 pb-4 border-b-2 flex items-baseline justify-between gap-3" style={{ borderColor: primary }}>
            <h3 className="tsb-font-display italic text-2xl leading-tight">{p.title}</h3>
            <p className="tsb-font-mono text-sm shrink-0">${(p.retail_price_cents / 100).toFixed(2)}</p>
          </div>
          <p className="mt-2 tsb-font-mono text-[10px] uppercase tracking-[0.25em] text-neutral-500 group-hover:text-black">
            View → Buy
          </p>
        </Link>
      ))}
    </div>
  );
}
