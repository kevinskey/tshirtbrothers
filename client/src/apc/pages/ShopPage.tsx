import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { fetchConfig, fetchProducts } from '../lib/api';
import { useApcPath } from '../lib/base';
import ProductCard from '../components/ProductCard';

export default function ShopPage() {
  const p = useApcPath();
  const [params] = useSearchParams();
  const category = params.get('category') || undefined;
  const search = params.get('search') || undefined;

  const { data: config } = useQuery({ queryKey: ['apc-config'], queryFn: fetchConfig });
  const { data, isLoading } = useQuery({
    queryKey: ['apc-products', category ?? '', search ?? ''],
    queryFn: () => fetchProducts({ category, q: search }),
  });
  const products = data?.products ?? [];

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-8">
      <Helmet><title>{category ? `${category} — All Print Club` : 'Shop All — All Print Club'}</title></Helmet>

      <h1 className="font-display text-2xl sm:text-3xl font-bold text-apc-ink">
        {search ? `Results for “${search}”` : category || 'All Products'}
      </h1>

      {/* Category pills */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={p('/shop')}
          className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
            !category ? 'bg-apc-ink text-white border-apc-ink' : 'border-apc-paper-deep text-apc-charcoal hover:border-apc-blue'
          }`}
        >
          All
        </Link>
        {(config?.categories ?? []).map((c) => (
          <Link
            key={c.name}
            to={`${p('/shop')}?category=${encodeURIComponent(c.name)}`}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
              category === c.name ? 'bg-apc-ink text-white border-apc-ink' : 'border-apc-paper-deep text-apc-charcoal hover:border-apc-blue'
            }`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {isLoading ? (
        <p className="mt-10 text-apc-slate">Loading products…</p>
      ) : products.length ? (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product) => <ProductCard key={product.code} product={product} />)}
        </div>
      ) : (
        <p className="mt-10 text-apc-slate">
          No products found{search ? ` for “${search}”` : ''}. Try another search or category.
        </p>
      )}
    </div>
  );
}
