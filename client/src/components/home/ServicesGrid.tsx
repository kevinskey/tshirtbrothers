import { Link } from 'react-router-dom';

const categories = [
  { name: 'T-Shirts', search: 'T-Shirts', image: 'https://www.ssactivewear.com/Images/Style/5126_fm.jpg' },
  { name: 'Hoodies & Sweatshirts', search: 'Fleece', image: 'https://www.ssactivewear.com/Images/Style/7544_fm.jpg' },
  { name: 'Hats & Caps', search: 'Headwear', image: 'https://www.ssactivewear.com/Images/Style/15274_fm.jpg' },
  { name: 'Polos', search: 'Polos', image: 'https://www.ssactivewear.com/Images/Style/11810_fm.jpg' },
  { name: 'Long Sleeves', search: 'T-Shirts - Long Sleeve', image: 'https://www.ssactivewear.com/Images/Style/12447_fm.jpg' },
  { name: 'Outerwear', search: 'Outerwear', image: 'https://www.ssactivewear.com/Images/Style/6420_fm.jpg' },
  { name: 'Bags & Totes', search: 'Bags', image: 'https://www.ssactivewear.com/Images/Style/5861_fm.jpg' },
  { name: 'Bottoms', search: 'Bottoms', image: 'https://www.ssactivewear.com/Images/Style/11781_fm.jpg' },
  { name: 'Accessories', search: 'Accessories', image: 'https://www.ssactivewear.com/Images/Style/12071_fm.jpg' },
  { name: 'Knits & Layering', search: 'Knits', image: 'https://www.ssactivewear.com/Images/Style/15978_fm.jpg' },
  { name: 'Wovens', search: 'Wovens', image: 'https://www.ssactivewear.com/Images/Style/8225_fm.jpg' },
  { name: 'All Products', search: '', image: 'https://www.ssactivewear.com/Images/Style/8512_fm.jpg' },
];

export default function ServicesGrid() {
  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-10">
          Custom T-Shirts &amp; Products for Your Group
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
                  className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
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
