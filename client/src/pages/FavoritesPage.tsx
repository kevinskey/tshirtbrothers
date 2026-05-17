import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Heart, Loader2 } from 'lucide-react';
import Layout from '@/components/layout/Layout';

type Product = {
  id: number;
  ss_id?: string;
  name: string;
  brand?: string;
  category?: string;
  image_url?: string;
  base_price?: number | string | null;
  custom_price?: number | string | null;
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function FavoritesPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery<{ products: Product[] }>({
    queryKey: ['favorites'],
    queryFn: async () => {
      const r = await fetch('/api/favorites', { headers: authHeaders() });
      if (r.status === 401) {
        window.location.href = '/auth';
        return { products: [] };
      }
      if (!r.ok) throw new Error('Failed to load favorites');
      return r.json();
    },
  });

  const removeMut = useMutation({
    mutationFn: async (productId: number) => {
      const r = await fetch(`/api/favorites/${productId}`, { method: 'DELETE', headers: authHeaders() });
      if (!r.ok) throw new Error('Failed to remove');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['favorites'] });
      qc.invalidateQueries({ queryKey: ['favorite-ids'] });
    },
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      </Layout>
    );
  }
  if (isError) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center text-red-600">Failed to load favorites.</div>
      </Layout>
    );
  }

  const products = data?.products || [];

  return (
    <Layout>
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex items-center gap-2 mb-6">
          <Heart className="h-5 w-5 text-orange-500 fill-orange-500" />
          <h1 className="font-display text-2xl font-bold text-gray-900">Your Favorites</h1>
          <span className="text-sm text-gray-500">({products.length})</span>
        </div>

        {products.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
            <Heart className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600">You haven't saved any products yet.</p>
            <Link to="/shop" className="mt-4 inline-block text-orange-600 font-semibold hover:underline">Browse the catalog</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => {
              const wholesale = Number(p.base_price || 0);
              const yourPrice = p.custom_price != null && Number(p.custom_price) > 0
                ? Number(p.custom_price)
                : wholesale > 0 ? wholesale * 2 : null;
              return (
                <div key={p.id} className="relative border border-gray-100 rounded-xl overflow-hidden bg-white hover:shadow-lg transition-shadow">
                  <button
                    type="button"
                    onClick={() => removeMut.mutate(p.id)}
                    aria-label="Remove from favorites"
                    className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-white/90 hover:bg-white shadow-sm"
                  >
                    <Heart className="h-4 w-4 text-orange-500 fill-orange-500" />
                  </button>
                  <Link to={`/quote?product=${encodeURIComponent(p.ss_id || String(p.id))}`} className="block">
                    <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} className="w-full h-full object-contain p-4" loading="lazy" />
                      ) : (
                        <span className="text-gray-400 text-xs">{p.category}</span>
                      )}
                    </div>
                    <div className="p-3">
                      <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">{p.brand}</span>
                      <h3 className="font-display font-semibold text-sm mt-0.5 leading-tight line-clamp-2">{p.name}</h3>
                      {yourPrice != null && (
                        <p className="mt-2 text-sm">
                          <span className="text-gray-500">Your price: </span>
                          <span className="font-semibold text-gray-900">${yourPrice.toFixed(2)}</span>
                        </p>
                      )}
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </Layout>
  );
}
