// Public directory of all active TSB group stores — the "/stores" URL.
// Simple grid of storefront cards. Each links into /stores/:slug.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '@/components/Seo';
import { Loader2, ShoppingBag, Target } from 'lucide-react';

interface DirStore {
  slug: string;
  name: string;
  brand_json: {
    logo_url?: string;
    primary_color?: string;
    hero_url?: string;
    tagline?: string;
  };
  is_fundraiser: boolean;
  fundraiser_json: {
    headline?: string;
    goal_cents?: number;
    ends_at?: string;
  };
}

export default function StoresDirectoryPage() {
  const [stores, setStores] = useState<DirStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/store-shop');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as { stores: DirStore[] };
        if (!cancelled) setStores(data.stores || []);
      } catch (err) {
        console.error('[StoresDirectoryPage] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <Seo
        title="Group Stores · TShirt Brothers"
        description="Shop official merchandise from schools, choirs, teams, and organizations. Powered by TShirt Brothers."
        path="/stores"
      />

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <Link to="/" className="text-xs text-gray-500 hover:text-gray-900">← TShirt Brothers</Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Group Stores</h1>
          <p className="mt-1 text-sm text-gray-500">
            Official merchandise for schools, choirs, teams, and organizations. Every store designed and fulfilled by TShirt Brothers.
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : stores.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-16 text-center">
            <ShoppingBag className="w-12 h-12 mx-auto text-gray-300" />
            <p className="mt-4 text-gray-600">No stores are open right now. Check back soon.</p>
            <p className="mt-6 text-sm text-gray-500">
              Want a store for your group?{' '}
              <a href="mailto:info@tshirtbrothers.com" className="underline">Get in touch.</a>
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((s) => {
              const primary = s.brand_json.primary_color || '#111827';
              return (
                <Link
                  key={s.slug}
                  to={`/stores/${s.slug}`}
                  className="group bg-white rounded-lg overflow-hidden border border-gray-200 hover:shadow-lg transition-shadow"
                >
                  <div className="aspect-[16/9] bg-gray-100 relative">
                    {s.brand_json.hero_url ? (
                      <img src={s.brand_json.hero_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : s.brand_json.logo_url ? (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: primary }}>
                        <img src={s.brand_json.logo_url} alt="" className="max-h-24 max-w-[60%] object-contain" />
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: primary }}>
                        <span className="text-white text-2xl font-bold">{s.name.slice(0, 2).toUpperCase()}</span>
                      </div>
                    )}
                    {s.is_fundraiser && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 bg-white/90 backdrop-blur rounded text-xs font-semibold text-gray-900">
                        <Target className="w-3 h-3" /> Fundraiser
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 line-clamp-1">{s.name}</h3>
                    {s.brand_json.tagline && (
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">{s.brand_json.tagline}</p>
                    )}
                    {s.is_fundraiser && s.fundraiser_json.headline && (
                      <p className="text-xs text-gray-500 mt-2 line-clamp-1">{s.fundraiser_json.headline}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
