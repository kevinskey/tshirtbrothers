import { Link } from 'react-router-dom';

interface Product {
  brand: string;
  name: string;
  model: string;
  colors: number;
  sizes: string;
  badge?: string;
  colorDots: string[];
}

const products: Product[] = [
  {
    brand: 'Gildan',
    name: 'Heavy Cotton T-Shirt',
    model: '5000',
    colors: 78,
    sizes: 'S-5XL',
    badge: 'Trending',
    colorDots: ['#0a0a0a', '#dc2626', '#2563eb', '#16a34a', '#f59e0b'],
  },
  {
    brand: 'Gildan',
    name: 'Softstyle T-Shirt',
    model: '64000',
    colors: 68,
    sizes: 'S-4XL',
    badge: 'Popular',
    colorDots: ['#0a0a0a', '#ffffff', '#6b7280', '#dc2626', '#1d4ed8'],
  },
  {
    brand: 'Hanes',
    name: 'ComfortSoft T-Shirt',
    model: '5280',
    colors: 24,
    sizes: 'S-4XL',
    colorDots: ['#0a0a0a', '#ffffff', '#6b7280', '#dc2626'],
  },
  {
    brand: 'Gildan',
    name: 'Ultra Cotton T-Shirt',
    model: '2000',
    colors: 61,
    sizes: 'S-5XL',
    colorDots: ['#0a0a0a', '#dc2626', '#7c3aed', '#ea580c', '#0d9488'],
  },
  {
    brand: 'Gildan',
    name: 'Heavy Blend Hoodie',
    model: '18500',
    colors: 42,
    sizes: 'S-5XL',
    badge: 'Popular',
    colorDots: ['#0a0a0a', '#ffffff', '#1e3a5f', '#dc2626'],
  },
];

export default function PopularProducts() {
  return (
    <section className="py-16 md:py-20">
      <div className="container mx-auto px-6">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-600 mb-3">
              POPULAR PRODUCTS
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
              Best Sellers
            </h2>
          </div>
          <Link
            to="/shop"
            className="hidden sm:inline-flex items-center justify-center h-10 px-5 border border-gray-300 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            Browse Full Catalog &rarr;
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {products.map((product) => (
            <div
              key={product.model}
              className="border rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
            >
              {/* Image Area */}
              <div className="relative aspect-square bg-gray-100 flex items-center justify-center">
                {/* Placeholder shirt shape */}
                <div className="w-16 h-20 bg-gray-300 rounded-b-2xl relative">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-2 bg-gray-100 rounded-b-full" />
                </div>
                {product.badge && (
                  <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                    {product.badge}
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="p-4">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">
                  {product.brand}
                </p>
                <h3 className="font-display font-semibold text-sm mb-1">{product.name}</h3>
                <p className="text-xs text-gray-500 mb-3">
                  {product.model} &middot; {product.colors} colors &middot; {product.sizes}
                </p>

                {/* Color Dots */}
                <div className="flex items-center gap-1 mb-3">
                  {product.colorDots.slice(0, 4).map((color, i) => (
                    <span
                      key={i}
                      className="w-3.5 h-3.5 rounded-full border border-gray-200"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  {product.colors > 4 && (
                    <span className="text-[10px] text-gray-400 ml-0.5">
                      +{product.colors - 4}
                    </span>
                  )}
                </div>

                <Link
                  to={`/shop/${product.model}`}
                  className="block w-full bg-gray-900 text-white rounded-lg text-xs py-2.5 font-semibold text-center hover:bg-gray-800 transition-colors"
                >
                  Customize
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile browse link */}
        <div className="mt-6 sm:hidden text-center">
          <Link
            to="/shop"
            className="inline-flex items-center justify-center h-10 px-5 border border-gray-300 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            Browse Full Catalog &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
