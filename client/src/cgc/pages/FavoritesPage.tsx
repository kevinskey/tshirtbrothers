import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight, Heart } from 'lucide-react';
import { fetchProduct } from '../lib/api';
import ProductCard from '../components/ProductCard';
import { useCgcPath } from '../lib/base';
import { useCgcFavorites } from '../lib/favorites';

export default function FavoritesPage() {
  const p = useCgcPath();
  const { favorites } = useCgcFavorites();

  const results = useQueries({
    queries: favorites.map((sku) => ({
      queryKey: ['cgc-product', sku],
      queryFn: () => fetchProduct(sku),
    })),
  });
  const products = results.map((r) => r.data?.product).filter(Boolean);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <Helmet><title>Favorites — Custom Gift Club</title></Helmet>
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-cgc-ink mb-6">Favorites</h1>
      {favorites.length === 0 ? (
        <div className="py-16 text-center">
          <Heart className="h-12 w-12 mx-auto text-cgc-stone" aria-hidden />
          <p className="mt-4 text-lg font-semibold text-cgc-ink">Nothing saved yet</p>
          <p className="mt-1 text-sm text-cgc-stone">Tap the heart on any product to keep it here.</p>
          <Link to={p('/shop')} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-6 py-3.5">
            Shop All Products <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product) => product && <ProductCard key={product.sku} product={product} />)}
        </div>
      )}
    </div>
  );
}
