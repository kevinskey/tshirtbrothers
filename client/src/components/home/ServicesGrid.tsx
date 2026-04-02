import { Link } from 'react-router-dom';

const categories = [
  { name: 'T-Shirts', emoji: '👕' },
  { name: 'Hoodies & Sweatshirts', emoji: '🧥' },
  { name: 'Hats & Caps', emoji: '🧢' },
  { name: 'Polos', emoji: '👔' },
  { name: 'Long Sleeves', emoji: '🎽' },
  { name: 'Tank Tops', emoji: '🩳' },
  { name: 'Jackets & Vests', emoji: '🧥' },
  { name: 'Bags & Totes', emoji: '👜' },
  { name: 'Drinkware & Mugs', emoji: '☕' },
  { name: 'Business Apparel', emoji: '👔' },
  { name: 'Youth & Kids', emoji: '👶' },
  { name: 'Activewear', emoji: '🏃' },
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
              to="/shop"
              className="group rounded-xl overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
            >
              <div className="bg-gray-100 aspect-[4/3] flex items-center justify-center relative">
                <span className="text-5xl md:text-6xl opacity-60 group-hover:opacity-80 transition-opacity">
                  {cat.emoji}
                </span>
                <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur p-3">
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
