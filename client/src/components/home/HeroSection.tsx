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
          <div className="relative">
            <div className="bg-gray-100 rounded-2xl p-12 flex items-center justify-center min-h-[400px]">
              {/* CSS T-Shirt Shape */}
              <div className="relative">
                {/* Sleeves */}
                <div className="absolute -left-12 top-0 w-16 h-20 bg-red-600 rounded-bl-3xl -skew-x-12" />
                <div className="absolute -right-12 top-0 w-16 h-20 bg-red-600 rounded-br-3xl skew-x-12" />
                {/* Body */}
                <div className="relative w-48 h-64 bg-red-600 rounded-b-[60px]">
                  {/* Neckline */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-6 bg-gray-100 rounded-b-full" />
                  {/* Logo Area */}
                  <div className="absolute inset-0 flex items-center justify-center pt-8">
                    <div className="border-2 border-dashed border-white/60 rounded-lg px-4 py-3">
                      <span className="text-white/80 text-xs font-bold uppercase tracking-wider">
                        YOUR LOGO HERE
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating Card - Top Right */}
            <div className="absolute -top-4 -right-4 md:top-4 md:right-4 bg-white rounded-xl shadow-lg p-4 animate-float">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <span className="text-green-600 text-sm">&#10003;</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Order Complete</p>
                  <p className="text-xs text-gray-500">Ready for pickup</p>
                </div>
              </div>
            </div>

            {/* Floating Card - Bottom Left */}
            <div className="absolute -bottom-4 -left-4 md:bottom-4 md:left-4 bg-white rounded-xl shadow-lg p-4 animate-float-delayed">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 text-sm">&#9632;</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">78 Colors</p>
                  <p className="text-xs text-gray-500">Available in stock</p>
                </div>
              </div>
            </div>

            <style>{`
              @keyframes float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-10px); }
              }
              @keyframes float-delayed {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-8px); }
              }
              .animate-float {
                animation: float 3s ease-in-out infinite;
              }
              .animate-float-delayed {
                animation: float-delayed 3.5s ease-in-out infinite 0.5s;
              }
            `}</style>
          </div>
        </div>
      </div>
    </section>
  );
}
