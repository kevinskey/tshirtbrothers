import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, Users, Sparkles } from 'lucide-react';

// Quantity the headline price is quoted at — keep the copy ("groups of N+")
// in sync with this.
const HINT_QTY = 24;

export default function PricingHint() {
  // Live price from the quote engine so the banner can never drift from the
  // admin-editable pricing tables. No hardcoded fallback: until it loads (or
  // if it fails) we show the price-free line instead of a wrong number.
  const [perShirt, setPerShirt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/quote/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        garmentName: 'T-shirt',
        qualityTier: 'Standard',
        methodName: 'DTF',
        numLocations: 1,
        quantity: HINT_QTY,
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && Number.isFinite(Number(data.per_shirt))) {
          setPerShirt(Number(data.per_shirt));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="bg-gray-900 py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
            <div className="flex items-center gap-2 text-white">
              <DollarSign className="h-5 w-5 text-orange-400" />
              {perShirt !== null ? (
                <span className="text-sm">Custom tees from <strong className="text-orange-400 text-lg">${perShirt.toFixed(2)}/each</strong> for groups of {HINT_QTY}+</span>
              ) : (
                <span className="text-sm">Group discounts for {HINT_QTY}+ — get an instant price</span>
              )}
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
            className="flex-shrink-0 inline-flex items-center justify-center bg-orange-700 hover:bg-orange-800 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors text-sm"
          >
            Get Your Price
          </Link>
        </div>
      </div>
    </section>
  );
}
