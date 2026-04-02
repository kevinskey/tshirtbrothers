import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import { Search, Loader2 } from 'lucide-react';

interface BrandInfo {
  brand: string;
  count: number;
  image_url: string | null;
}

export default function BrandsPage() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['all-brands'],
    queryFn: async () => {
      const res = await fetch('/api/products/brands');
      if (!res.ok) return [];
      return res.json() as Promise<BrandInfo[]>;
    },
  });

  const brands = data ?? [];
  const filtered = search
    ? brands.filter(b => b.brand.toLowerCase().includes(search.toLowerCase()))
    : brands;

  return (
    <Layout>
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h1 className="font-display text-4xl md:text-5xl font-bold">All Brands</h1>
            <p className="mt-3 text-gray-500 max-w-xl mx-auto">
              Browse {brands.length} brands available for custom printing
            </p>
          </div>

          {/* Search */}
          <div className="relative max-w-md mx-auto mb-10">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search brands..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-500 py-12">No brands found</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filtered.map(b => (
                <Link
                  key={b.brand}
                  to={`/shop?brand=${encodeURIComponent(b.brand)}`}
                  className="group border border-gray-200 rounded-xl overflow-hidden hover:border-orange-400 hover:shadow-md transition-all bg-white"
                >
                  <div className="aspect-square bg-gray-50 flex items-center justify-center p-6">
                    {b.image_url ? (
                      <img
                        src={b.image_url}
                        alt={b.brand}
                        className="max-w-full max-h-full object-contain group-hover:scale-105 transition-transform"
                        loading="lazy"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <span className="text-lg font-bold text-gray-600 text-center">{b.brand}</span>
                    )}
                  </div>
                  <div className="px-3 py-2.5 border-t border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 truncate">{b.brand}</p>
                    <p className="text-xs text-gray-500">{b.count} product{b.count !== 1 ? 's' : ''}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
