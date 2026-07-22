// Group storefront at /stores/:slug. White-label by store brand_json.
// Shows a fundraiser banner when the store is running a campaign, and
// exposes fulfillment options (ship, pickup) in the buyer chrome.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '@/components/Seo';
import { Loader2, ShoppingBag, Target, MapPin, Truck, ShieldCheck } from 'lucide-react';

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }
  if (notFound || !store) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title={`${store.name} · Store`}
        description={`Official merchandise for ${store.name}. Designed and fulfilled by TShirt Brothers.`}
        path={`/stores/${slug}`}
      />

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          {store.brand_json.logo_url && (
            <img src={store.brand_json.logo_url} alt="" className="h-10 w-10 object-contain" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate" style={{ color: primary }}>{store.name}</h1>
            <p className="text-xs text-gray-500">Designed & fulfilled by TShirt Brothers</p>
          </div>
          <Link to={`/stores/${slug}/admin`} className="text-xs text-gray-400 hover:text-gray-900">
            Admin
          </Link>
        </div>
      </header>

      {store.brand_json.hero_url && (
        <div className="max-w-6xl mx-auto px-4 pt-6">
          <div className="rounded-lg overflow-hidden aspect-[21/9] bg-gray-200">
            <img src={store.brand_json.hero_url} alt="" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {store.is_fundraiser && (
        <div className="max-w-6xl mx-auto px-4 pt-6">
          <div
            className="rounded-lg p-5 text-white flex items-start gap-4"
            style={{ backgroundColor: primary }}
          >
            <Target className="w-6 h-6 flex-none mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs uppercase tracking-wider opacity-80">Fundraiser</p>
              <h2 className="text-xl font-bold">
                {store.fundraiser_json.headline || `Support ${store.name}`}
              </h2>
              {store.fundraiser_json.description && (
                <p className="mt-1 text-sm opacity-90">{store.fundraiser_json.description}</p>
              )}
              {store.fundraiser_json.ends_at && (
                <p className="mt-2 text-xs opacity-80">
                  Ends {new Date(store.fundraiser_json.ends_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="flex flex-wrap gap-3 text-xs text-gray-600">
          {(store.fulfillment_mode === 'ship_only' || store.fulfillment_mode === 'both') && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full">
              <Truck className="w-3.5 h-3.5" /> Ships to you
            </span>
          )}
          {(store.fulfillment_mode === 'pickup_only' || store.fulfillment_mode === 'both') && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full">
              <MapPin className="w-3.5 h-3.5" />
              Pickup at {store.pickup_location_json.name || store.name}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" /> Secure checkout by Stripe
          </span>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {products.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-16 text-center">
            <ShoppingBag className="w-12 h-12 mx-auto text-gray-300" />
            <p className="mt-4 text-gray-600">No products for sale right now. Check back soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((p) => (
              <Link
                key={p.id}
                to={`/stores/${slug}/product/${p.slug}`}
                className="group bg-white rounded-lg overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow"
              >
                <div className="aspect-square bg-gray-100">
                  {p.cover_image ? (
                    <img
                      src={p.cover_image}
                      alt={p.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag className="w-10 h-10 text-gray-300" />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 line-clamp-2">{p.title}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    ${(p.retail_price_cents / 100).toFixed(2)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-8 text-center text-xs text-gray-500">
        {store.brand_json.footer_note || 'Designed, printed, and shipped by TShirt Brothers · Fairburn, GA'}
      </footer>
    </div>
  );
}
