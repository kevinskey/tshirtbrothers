import { Link } from 'react-router-dom';
import { Printer } from 'lucide-react';
import type { ApcProduct } from '../lib/api';
import { money } from '../lib/api';
import { useApcPath } from '../lib/base';

export default function ProductCard({ product }: { product: ApcProduct }) {
  const p = useApcPath();
  return (
    <Link
      to={p(`/product/${encodeURIComponent(product.code)}`)}
      className="group rounded-xl border border-apc-paper-deep bg-white overflow-hidden hover:shadow-md hover:border-apc-blue/40 transition-all block"
    >
      <div className="aspect-[4/3] bg-apc-paper flex items-center justify-center p-4">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <Printer className="h-10 w-10 text-apc-slate/60" aria-hidden />
        )}
      </div>
      <div className="p-4">
        <div className="text-[11px] font-bold uppercase tracking-wide text-apc-slate">{product.category}</div>
        <h3 className="mt-1 font-semibold text-apc-ink group-hover:text-apc-blue line-clamp-2">{product.name}</h3>
        {product.from_cents != null && (
          <p className="mt-1.5 text-sm text-apc-charcoal">
            From <span className="font-bold text-apc-ink">{money(product.from_cents)}</span>
          </p>
        )}
      </div>
    </Link>
  );
}
