const testimonials = [
  {
    quote: 'The quality blew us away and the turnaround was incredibly fast. Our entire team loved the shirts. Will definitely be ordering again!',
    name: 'Sarah J.',
    location: 'Peachtree City, GA',
    date: 'March 2026',
    context: 'Ordered 75 team shirts',
    color: 'bg-purple-500',
  },
  {
    quote: 'We needed 200 polos with our company logo embroidered. TShirt Brothers delivered on time and the quality was outstanding. Best vendor we\'ve worked with.',
    name: 'Mike R.',
    location: 'Fayetteville, GA',
    date: 'February 2026',
    context: '200 embroidered polos',
    color: 'bg-blue-500',
  },
  {
    quote: 'Used them for our school fundraiser t-shirts. The design process was so easy and the kids absolutely loved the final product. Great prices too!',
    name: 'Lisa C.',
    location: 'Union City, GA',
    date: 'January 2026',
    context: 'School fundraiser tees',
    color: 'bg-emerald-500',
  },
  {
    quote: 'Our rec league jerseys turned out amazing. The numbers and names were perfect, and they even helped us tweak our design. Highly recommend!',
    name: 'James T.',
    location: 'Newnan, GA',
    date: 'December 2025',
    context: 'Rec league jerseys',
    color: 'bg-orange-500',
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5 mb-3">
      {[...Array(5)].map((_, i) => (
        <svg key={i} className="w-4 h-4 text-amber-400 fill-current" viewBox="0 0 20 20">
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
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="flex">
              {[...Array(5)].map((_, i) => (
                <svg key={i} className="w-5 h-5 text-amber-400 fill-current" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            <span className="text-sm font-bold text-gray-900">5.0 on Google</span>
          </div>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-gray-900">
            What Our Customers Say
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {testimonials.map((t) => (
            <div key={t.name} className="border border-gray-200 rounded-xl p-5">
              <Stars />
              <p className="text-sm text-gray-700 leading-relaxed mb-4 line-clamp-4">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className={t.color + " w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"}>
                  {t.name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.location}</p>
                  <p className="text-xs text-orange-500 font-medium mt-0.5">{t.context}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <a
            href="https://www.google.com/maps/place/TShirt+Brothers/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-orange-500 hover:text-orange-600 transition-colors"
          >
            See All Reviews on Google &rarr;
          </a>
        </div>
      </div>
    </section>
  );
}
