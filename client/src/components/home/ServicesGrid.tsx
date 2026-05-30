import { Link } from 'react-router-dom';

const categories = [
  { name: 'T-Shirts', search: 'T-Shirts', image: 'https://cdn.ssactivewear.com/Images/Style/5126_fs.jpg' },
  { name: 'Hoodies & Sweatshirts', search: 'Fleece', image: 'https://cdn.ssactivewear.com/Images/Style/7544_fs.jpg' },
  { name: 'Hats & Caps', search: 'Headwear', image: 'https://cdn.ssactivewear.com/Images/Style/15274_fs.jpg' },
  { name: 'Polos', search: 'Polos', image: 'https://cdn.ssactivewear.com/Images/Style/11810_fs.jpg' },
  { name: 'Long Sleeves', search: 'T-Shirts - Long Sleeve', image: 'https://cdn.ssactivewear.com/Images/Style/12447_fs.jpg' },
  { name: 'Outerwear', search: 'Outerwear', image: 'https://cdn.ssactivewear.com/Images/Style/6420_fs.jpg' },
  { name: 'Bags & Totes', search: 'Bags', image: 'https://cdn.ssactivewear.com/Images/Style/5861_fs.jpg' },
  { name: 'Bottoms', search: 'Bottoms', image: 'https://cdn.ssactivewear.com/Images/Style/11781_fs.jpg' },
  { name: 'Accessories', search: 'Accessories', image: 'https://cdn.ssactivewear.com/Images/Style/12071_fs.jpg' },
  { name: 'Knits & Layering', search: 'Knits', image: 'https://cdn.ssactivewear.com/Images/Style/15978_fs.jpg' },
  { name: 'Wovens', search: 'Wovens', image: 'https://cdn.ssactivewear.com/Images/Style/8225_fs.jpg' },
  { name: 'All Products', search: '', image: 'https://cdn.ssactivewear.com/Images/Style/8512_fs.jpg' },
];

export default function ServicesGrid() {
  return (
    <section className="py-14 md:py-20 -mt-[45px]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-10">
          View our Catalogue
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {categories.map((cat) => (
            <Link
              key={cat.name}
              to={cat.search ? `/shop?category=${encodeURIComponent(cat.search)}` : '/shop'}
              className="group rounded-xl overflow-hidden border border-gray-200 hover:shadow-lg hover:border-gray-300 transition-all cursor-pointer"
            >
              <div className="bg-gray-50 aspect-[4/3] flex items-center justify-center relative overflow-hidden">
                <img
                  src={cat.image}
                  alt={cat.name}
                  width={200}
                  height={250}
                  className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm py-3 px-4">
                  <p className="font-semibold text-sm text-gray-900 text-center">
                    {cat.name}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
