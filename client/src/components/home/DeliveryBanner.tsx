import { Truck, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';

function getDeliveryDate(daysFromNow: number): string {
  const date = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export default function DeliveryBanner() {
  const standardDate = getDeliveryDate(14);
  const rushDate = getDeliveryDate(7);

  return (
    <section className="bg-gray-50 border-y border-gray-200 py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Standard shipping */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Truck className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-gray-900 mb-1">
                  Free Shipping &amp; 2-Week Delivery
                </h3>
                <p className="text-sm text-gray-600 mb-2">
                  Get it by <span className="font-semibold text-gray-900">{standardDate}</span>
                </p>
                <Link
                  to="/services"
                  className="text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
                >
                  View Delivery Calendar &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* Rush shipping */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center">
                <Zap className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-display font-bold text-lg text-gray-900 mb-1">
                  Need It Sooner?
                </h3>
                <p className="text-sm text-gray-600 mb-1">
                  Rush or Super Rush available
                </p>
                <p className="text-sm text-gray-600">
                  Get it as soon as <span className="font-semibold text-gray-900">{rushDate}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
