import { Link } from 'react-router-dom';

export default function HeroSection() {
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left Column */}
          <div>
            <div className="inline-flex items-center gap-2 bg-red-50 text-red-600 rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-wide mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" />
              </span>
              Serving South Atlanta since 2020
            </div>

            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-6">
              Custom Printing.
              <br />
              <span className="bg-gradient-to-r from-red-600 to-orange-500 bg-clip-text text-transparent">
                No Minimums.
              </span>
            </h1>

            <p className="text-gray-500 text-lg max-w-md leading-relaxed mb-8">
              T-shirts, hoodies, polos, and more — screen printed, embroidered,
              or DTF transferred. Same-day pickup available in Tyrone, GA.
            </p>

            <div className="flex flex-wrap gap-4 mb-8">
              <Link
                to="/quote"
                className="inline-flex items-center justify-center h-12 px-6 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                Get a Free Quote &rarr;
              </Link>
              <Link
                to="/design"
                className="inline-flex items-center justify-center h-12 px-6 border border-gray-300 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-50 transition-colors"
              >
                Start Designing
              </Link>
            </div>

            <div className="flex flex-wrap gap-6 text-sm text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="text-amber-500">&#9733;</span> 5.0 on Google
              </span>
              <span className="flex items-center gap-1.5">
                &#128666; Same-day pickup
              </span>
              <span className="flex items-center gap-1.5">
                &#9989; No minimums
              </span>
            </div>
          </div>

          {/* Right Column */}
          <div>
            <div className="rounded-2xl overflow-hidden max-h-[420px]">
              <img
                src="https://images.unsplash.com/photo-1562157873-818bc0726f68?auto=format&fit=crop&w=800&h=420&q=80"
                alt="Custom printed t-shirts on display"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
