import { Link } from 'react-router-dom';

const brands = [
  'Gildan',
  'Hanes',
  'Next Level',
  'Comfort Colors',
  'Bella+Canvas',
  'Champion',
  'Adidas',
  'Nike',
  'Carhartt',
  'Fruit of the Loom',
];

export default function FeaturedBrands() {
  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="font-display text-2xl md:text-3xl font-bold">
            Shop Featured Brands
          </h2>
          <Link
            to="/shop"
            className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors whitespace-nowrap"
          >
            See All Brands &rarr;
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          {brands.map((brand) => (
            <Link
              key={brand}
              to="/shop"
              className="w-32 h-20 flex-shrink-0 border border-gray-200 rounded-xl flex items-center justify-center hover:border-gray-400 hover:shadow-sm transition-all cursor-pointer"
            >
              <span className="text-sm font-bold text-gray-700 text-center px-2">
                {brand}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
