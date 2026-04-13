import { Link } from 'react-router-dom';
import { DollarSign, Users, Sparkles } from 'lucide-react';

export default function PricingHint() {
  return (
    <section className="bg-gray-900 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <div className="flex items-center gap-2 text-white">
              <DollarSign className="h-5 w-5 text-orange-400" />
              <span className="text-sm">Custom tees starting at <strong className="text-orange-400 text-lg">.99/each</strong> for groups of 24+</span>
            </div>
            <div className="hidden sm:block w-px h-6 bg-gray-700" />
            <div className="flex items-center gap-2 text-white">
              <Users className="h-5 w-5 text-orange-400" />
              <span className="text-sm">No minimums</span>
            </div>
            <div className="hidden sm:block w-px h-6 bg-gray-700" />
            <div className="flex items-center gap-2 text-white">
              <Sparkles className="h-5 w-5 text-orange-400" />
              <span className="text-sm">Free design help</span>
            </div>
          </div>
          <Link
            to="/quote"
            className="flex-shrink-0 inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            Get Your Price
          </Link>
        </div>
      </div>
    </section>
  );
}
