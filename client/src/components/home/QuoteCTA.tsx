import { Link } from 'react-router-dom';
import { ArrowRight, Phone } from 'lucide-react';

export default function QuoteCTA() {
  return (
    <section className="py-12 md:py-16 bg-gradient-to-b from-orange-50 to-white">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <p className="text-xs sm:text-sm font-semibold text-orange-500 uppercase tracking-wider mb-3">
          Free Quote · Same-Day Reply
        </p>
        <h2 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          Ready to print? Tell us what you need.
        </h2>
        <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto mb-8">
          Single shirts to bulk orders of 1,000+. Screen printing, DTF, embroidery. No minimums. We respond the same day with pricing.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-center">
          <Link
            to="/quote"
            className="inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3.5 rounded-lg transition-colors shadow-lg shadow-orange-500/25 text-base"
          >
            Get a Quote
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="tel:+14706221392"
            className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-900 font-semibold px-6 py-3.5 rounded-lg border border-gray-200 transition-colors text-base"
          >
            <Phone className="h-4 w-4" />
            (470) 622-1392
          </a>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-gray-500">
          <span>✅ No minimums</span>
          <span>✅ Same-day quotes</span>
          <span>✅ Free local delivery over $250</span>
        </div>
      </div>
    </section>
  );
}
