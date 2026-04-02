import { Link } from 'react-router-dom';

const brands = [
  { name: 'Gildan', search: 'Gildan', logo: 'https://www.ssactivewear.com/Images/Brand/2_fm.jpg' },
  { name: 'BELLA + CANVAS', search: 'BELLA + CANVAS', logo: 'https://www.ssactivewear.com/Images/Brand/106_fm.jpg' },
  { name: 'Adidas', search: 'Adidas', logo: 'https://www.ssactivewear.com/Images/Brand/31_fm.jpg' },
  { name: 'Under Armour', search: 'Under Armour', logo: 'https://www.ssactivewear.com/Images/Brand/63_fm.jpg' },
  { name: 'Champion', search: 'Champion', logo: 'https://www.ssactivewear.com/Images/Brand/27_fm.jpg' },
  { name: 'Hanes', search: 'Hanes', logo: 'https://www.ssactivewear.com/Images/Brand/4_fm.jpg' },
  { name: 'Comfort Colors', search: 'Comfort Colors', logo: 'https://www.ssactivewear.com/Images/Brand/67_fm.jpg' },
  { name: 'JERZEES', search: 'JERZEES', logo: 'https://www.ssactivewear.com/Images/Brand/3_fm.jpg' },
  { name: 'Richardson', search: 'Richardson', logo: 'https://www.ssactivewear.com/Images/Brand/40_fm.jpg' },
  { name: 'Augusta Sportswear', search: 'Augusta Sportswear', logo: 'https://www.ssactivewear.com/Images/Brand/18_fm.jpg' },
  { name: 'Fruit of the Loom', search: 'Fruit of the Loom', logo: 'https://www.ssactivewear.com/Images/Brand/5_fm.jpg' },
  { name: 'Nike', search: 'Nike', logo: 'https://www.ssactivewear.com/Images/Brand/37_fm.jpg' },
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
            to="/brands"
            className="text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors whitespace-nowrap"
          >
            See All Brands &rarr;
          </Link>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
          {brands.map((brand) => (
            <Link
              key={brand.name}
              to={`/shop?brand=${encodeURIComponent(brand.search)}`}
              className="w-36 h-24 flex-shrink-0 border border-gray-200 rounded-xl flex items-center justify-center hover:border-orange-400 hover:shadow-md transition-all cursor-pointer bg-white p-3"
            >
              <img
                src={brand.logo}
                alt={brand.name}
                className="max-w-full max-h-full object-contain"
                loading="lazy"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-sm font-bold text-gray-700 text-center">${brand.name}</span>`;
                }}
              />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
