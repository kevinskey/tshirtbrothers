const testimonials = [
  {
    quote:
      'TShirt Brothers knocked it out of the park. Our church group order came out perfect — vibrant colors, great fit, and they had everything ready same day. Will definitely be back!',
    name: 'Sarah Johnson',
    location: 'Peachtree City, GA',
    initials: 'SJ',
  },
  {
    quote:
      "Best custom printing shop in the area, hands down. I needed jerseys for my rec league with only a few days' notice and they delivered. Quality was top notch.",
    name: 'Mike Rodriguez',
    location: 'Fayetteville, GA',
    initials: 'MR',
  },
  {
    quote:
      'I ordered just 5 shirts for a family reunion and they treated my order like it was their biggest client. The embroidery detail was incredible. Highly recommend!',
    name: 'Lisa Chen',
    location: 'Union City, GA',
    initials: 'LC',
  },
];

function Stars() {
  return (
    <div className="flex gap-0.5 mb-4">
      {[...Array(5)].map((_, i) => (
        <svg
          key={i}
          className="w-5 h-5 text-amber-400 fill-current"
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
    <section className="py-16 md:py-20">
      <div className="container mx-auto px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-600 mb-3">
          TESTIMONIALS
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
          5.0 Stars on Google
        </h2>
        <p className="text-gray-500 text-base mb-12 max-w-lg">
          Don&apos;t just take our word for it. Here&apos;s what our customers have to say.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="border rounded-xl p-6"
            >
              <Stars />
              <p className="text-gray-600 text-sm italic leading-relaxed mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 text-xs font-bold">{t.initials}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.location}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
