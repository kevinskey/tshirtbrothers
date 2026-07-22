// Public storefront for a franchise store. Lists all active, in-window
// products for the store identified by :slug. Reads /api/store-shop/:slug
// (brand) + /api/store-shop/:slug/products (list) — no auth.
//
// Whitelabeled: header logo/name/color come from the store's brand_json
// instead of hardcoded TSB chrome. Falls back to TSB defaults on brand
// fetch failure so a bad store slug still renders something.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '@/components/Seo';
import { Loader2, ShoppingBag } from 'lucide-react';

interface StoreProfile {
  slug: string;
  name: string;
  brand_json: {
    logo_url?: string;
    primary_color?: string;
    back_url?: string;
    footer_note?: string;
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
  campaign_ref: string | null;
  opens_at: string | null;
  closes_at: string | null;
}

export default function StoreFrontPage() {
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
        console.error('[StoreFrontPage] load failed:', err);
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
        </div>
      </div>
    );
  }

  const primary = store.brand_json.primary_color || '#111827';

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title={`${store.name} · Store`}
        description={`Merchandise for ${store.name}. Fulfilled by TShirt Brothers.`}
        path={`/store/${slug}`}
      />

      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          {store.brand_json.logo_url && (
            <img src={store.brand_json.logo_url} alt="" className="h-10 w-10 object-contain" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate" style={{ color: primary }}>{store.name}</h1>
            <p className="text-xs text-gray-500">Fulfilled by TShirt Brothers</p>
          </div>
          {store.brand_json.back_url && (
            <a href={store.brand_json.back_url} className="text-sm text-gray-500 hover:text-gray-900">
              ← Back
            </a>
          )}
        </div>
      </header>

      {/* Product grid */}
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
                to={`/store/${slug}/product/${p.slug}`}
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

      {store.brand_json.footer_note && (
        <footer className="max-w-6xl mx-auto px-4 py-8 text-center text-xs text-gray-500">
          {store.brand_json.footer_note}
        </footer>
      )}
    </div>
  );
}
