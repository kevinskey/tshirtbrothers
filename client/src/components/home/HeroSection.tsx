import { Link } from 'react-router-dom';
import { Shield, Palette, Package, Truck } from 'lucide-react';

const trustBadges = [
  { icon: Shield, label: '100% Satisfaction Guarantee' },
  { icon: Palette, label: 'Easy Design Tools' },
  { icon: Package, label: '6,000+ Products' },
  { icon: Truck, label: 'Free Shipping' },
];

export default function HeroSection() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-r from-orange-500 to-orange-600">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 md:py-16 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            {/* Left: Text */}
            <div>
              <h1 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
                Custom Everything,
                <br />
                All In One Place.
              </h1>
              <p className="text-white/80 text-lg mb-8 max-w-md">
                Over 6,000 custom products for your business, school, or team.
              </p>
              <Link
                to="/shop"
                className="inline-flex items-center justify-center bg-white text-gray-900 font-bold px-8 py-3 rounded-lg hover:bg-gray-100 transition-colors shadow-lg"
              >
                Get Started
              </Link>
            </div>

            {/* Right: Image with orange tint */}
            <div className="flex justify-center lg:justify-end">
              <div className="relative rounded-2xl overflow-hidden max-w-md w-full shadow-2xl">
                <img
                  src="https://images.unsplash.com/photo-1562157873-818bc0726f68?auto=format&fit=crop&w=800&h=500&q=80"
                  alt="Custom printed t-shirts"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-orange-500/20 mix-blend-multiply" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust badges */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {trustBadges.map((badge) => (
              <div
                key={badge.label}
                className="flex items-center justify-center gap-2 text-sm font-medium text-gray-700"
              >
                <badge.icon className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                <span>{badge.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
