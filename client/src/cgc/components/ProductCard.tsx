import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import type { CgcProduct } from '../lib/api';
import { money } from '../lib/api';
import { useCgcPath } from '../lib/base';
import { useCgcFavorites } from '../lib/favorites';

export default function ProductCard({ product }: { product: CgcProduct }) {
  const p = useCgcPath();
  const { has, toggle } = useCgcFavorites();
  const fav = has(product.sku);

  return (
    <div className="group relative rounded-xl border border-cgc-cream-deep bg-white overflow-hidden hover:shadow-md transition-shadow">
      <button
        type="button"
        aria-label={fav ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
        aria-pressed={fav}
        onClick={() => toggle(product.sku)}
        className="absolute top-2 right-2 z-10 p-2 rounded-full bg-white/90 shadow-sm hover:scale-105 transition-transform"
      >
        <Heart className={`h-4 w-4 ${fav ? 'fill-cgc-orange text-cgc-orange' : 'text-cgc-charcoal'}`} />
      </button>
      <Link to={p(`/product/${encodeURIComponent(product.sku)}`)} className="block">
        <div className="aspect-square bg-cgc-cream flex items-center justify-center p-4">
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              className="max-h-full max-w-full object-contain mix-blend-multiply"
            />
          ) : (
            <span className="text-xs text-cgc-stone">No image</span>
          )}
        </div>
        <div className="p-3">
          <h3 className="text-sm font-medium text-cgc-ink line-clamp-2 min-h-[2.5rem]">{product.name.trim()}</h3>
          <p className="mt-1 text-sm font-bold text-cgc-ink">{money(product.retail_price_cents)}</p>
        </div>
      </Link>
    </div>
  );
}
