import { Link } from 'react-router-dom';

const testimonials = [
  {
    quote:
      'The quality blew us away and the turnaround was incredibly fast. Our entire team loved the shirts. Will definitely be ordering again!',
    name: 'Sarah J.',
    location: 'Peachtree City, GA',
    date: 'March 2026',
  },
  {
    quote:
      'We needed 200 polos with our company logo embroidered. TShirt Brothers delivered on time and the quality was outstanding. Best vendor we\'ve worked with.',
    name: 'Mike R.',
    location: 'Fayetteville, GA',
    date: 'February 2026',
  },
  {
    quote:
      'Used them for our school fundraiser t-shirts. The design process was so easy and the kids absolutely loved the final product. Great prices too!',
    name: 'Lisa C.',
    location: 'Union City, GA',
    date: 'January 2026',
  },
  {
    quote:
      'Our rec league jerseys turned out amazing. The numbers and names were perfect, and they even helped us tweak our design. Highly recommend!',
    name: 'James T.',
    location: 'Newnan, GA',
    date: 'December 2025',
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5 mb-3">
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          className="w-4 h-4 text-amber-400 fill-current"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function TestimonialsSection() {
  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-10">
          What Our Customers Say
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="border border-gray-200 rounded-xl p-5"
            >
              <Stars />
              <p className="text-sm text-gray-700 leading-relaxed mb-4 line-clamp-4">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div>
                <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                <p className="text-xs text-gray-500">{t.location}</p>
                <p className="text-xs text-gray-400 mt-1">{t.date}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link
            to="/services"
            className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
          >
            See All Reviews &rarr;
          </Link>
        </div>
      </div>
    </section>
  );
}
