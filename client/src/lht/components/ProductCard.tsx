import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { LhtProduct } from '../lib/api';
import { colorsFor, photoFor, usd } from '../lib/catalog';
import { useLhtPath } from '../lib/base';

export default function ProductCard({ product }: { product: LhtProduct }) {
  const p = useLhtPath();
  const colors = colorsFor(product.slug);
  const [hovered, setHovered] = useState<string | null>(null);
  const image = photoFor(product.slug, hovered, product.cover_image);

  return (
    <Link
      to={p(`/product/${encodeURIComponent(product.slug)}`)}
      className="group block bg-lht-ink-soft border border-lht-cream/10 hover:border-lht-cyan/60 transition-colors overflow-hidden"
    >
      <div className="aspect-square bg-black/40 overflow-hidden">
        {image && (
          <img
            src={image}
            alt={product.title}
            loading="lazy"
            className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        )}
      </div>
      <div className="p-4">
        <h3 className="font-lht-display text-sm uppercase tracking-[0.06em] text-lht-cream group-hover:text-lht-cyan transition-colors">
          {product.title}
        </h3>
        <p className="mt-1.5 font-lht-sans text-lht-stone">{usd(product.retail_price_cents)}</p>
        {colors.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${colors.length} colors`}>
            {colors.map((c) => (
              <span
                key={c.key}
                title={c.label}
                onMouseEnter={() => setHovered(c.label)}
                onMouseLeave={() => setHovered(null)}
                className="h-4 w-4 rounded-full border border-lht-cream/30"
                style={{ backgroundColor: c.swatch }}
              />
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
