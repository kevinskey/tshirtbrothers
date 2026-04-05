import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import {
  Shirt,
  Scissors,
  Trophy,
  ShieldCheck,
  MapPin,
  Upload,
  Printer,
  Truck,
  Package,
  CheckCircle2,
} from 'lucide-react';

const badges = ['Lightning Fast', 'Quality Guaranteed', 'Local Experts'];

const services = [
  {
    title: 'Custom Apparel',
    description:
      'From single custom pieces to large team orders, we print vibrant, long-lasting designs on premium garments. Screen printing, DTG, and heat transfer options available for every budget and timeline.',
    icon: Shirt,
    bgColor: 'bg-orange-50',
    iconColor: 'text-orange-600',
    items: [
      'T-Shirts & Tank Tops',
      'Hoodies & Sweatshirts',
      'Polo Shirts',
      'Long Sleeves',
      'Youth & Baby Apparel',
    ],
    whyChoose: ['No minimums', 'Same-day rush', 'Bulk pricing'],
    cta: { label: 'Start Designing', to: '/design' },
    reverse: false,
  },
  {
    title: 'Embroidery',
    description:
      'Professional embroidery adds a polished, premium feel to any garment or accessory. Our state-of-the-art machines handle intricate logos and text with precision stitching that lasts.',
    icon: Scissors,
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-600',
    items: [
      'Polo Shirts',
      'Caps & Hats',
      'Jackets',
      'Bags & Backpacks',
      'Uniforms',
    ],
    whyChoose: ['Pro digitizing', 'Durable threads', 'Logo services'],
    cta: { label: 'Upload Logo', to: '/design' },
    reverse: true,
  },
  {
    title: 'Premium Products',
    description:
      'Go beyond apparel with our full catalog of customizable products. From corporate awards to personalized gifts, we use laser engraving and sublimation to deliver stunning results.',
    icon: Trophy,
    bgColor: 'bg-amber-50',
    iconColor: 'text-amber-600',
    items: [
      'Trophies & Awards',
      'Custom Mugs',
      'Keychains',
      'Phone Cases',
      'Corporate Gifts',
    ],
    whyChoose: ['Laser precision', 'Premium materials', 'Gift packaging'],
    cta: { label: 'Browse Catalog', to: '/shop' },
    reverse: false,
  },
];

const steps = [
  {
    number: '1',
    title: 'Design or Upload',
    description:
      'Use our online designer or upload your own artwork. Our team will review and optimize your files for the best print quality.',
    icon: Upload,
  },
  {
    number: '2',
    title: 'We Print',
    description:
      'Our skilled team brings your design to life using the best method for your project — screen print, DTG, embroidery, or sublimation.',
    icon: Printer,
  },
  {
    number: '3',
    title: 'Fast Delivery',
    description:
      'Pick up locally or get nationwide shipping. Rush orders available for those last-minute needs.',
    icon: Truck,
  },
];

export default function ServicesPage() {
  useEffect(() => {
    document.title = 'Our Services | Screen Printing, DTF & Embroidery | TShirt Brothers';
  }, []);

  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gray-900 text-white py-20 text-center">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-4xl md:text-5xl font-bold">
            Our Services
          </h1>
          <p className="mt-4 text-gray-400 max-w-2xl mx-auto text-lg">
            From custom apparel to professional signage, we bring your vision to
            life with precision and care.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3 flex-wrap">
            {badges.map((badge) => (
              <span
                key={badge}
                className="bg-white/10 rounded-full px-4 py-1.5 text-xs font-medium"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Service Cards */}
      <section className="py-20">
        <div className="container mx-auto px-4 space-y-16">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <div
                key={service.title}
                className={`grid md:grid-cols-2 gap-10 items-center ${
                  service.reverse ? 'md:[direction:rtl]' : ''
                }`}
              >
                {/* Visual */}
                <div
                  className={`${service.bgColor} rounded-2xl aspect-square md:aspect-[4/3] flex items-center justify-center ${
                    service.reverse ? 'md:[direction:ltr]' : ''
                  }`}
                >
                  <Icon
                    className={`${service.iconColor} w-24 h-24 opacity-40`}
                    strokeWidth={1}
                  />
                </div>

                {/* Content */}
                <div className={service.reverse ? 'md:[direction:ltr]' : ''}>
                  <h2 className="font-display text-2xl font-bold">
                    {service.title}
                  </h2>
                  <p className="mt-3 text-gray-600 leading-relaxed">
                    {service.description}
                  </p>

                  <div className="mt-6">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      What We Print:
                    </span>
                    <ul className="mt-2 space-y-1.5">
                      {service.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-center gap-2 text-sm text-gray-700"
                        >
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Why Choose Us:
                    </span>
                    <ul className="mt-2 space-y-1.5">
                      {service.whyChoose.map((reason) => (
                        <li
                          key={reason}
                          className="flex items-center gap-2 text-sm text-gray-700"
                        >
                          <ShieldCheck className="w-4 h-4 text-orange-500 shrink-0" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Link
                    to={service.cta.to}
                    className="mt-6 inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg px-6 py-3 text-sm transition-colors"
                  >
                    {service.cta.label}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-20">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl font-bold text-center">
            How It Works
          </h2>
          <p className="mt-3 text-gray-500 text-center max-w-xl mx-auto">
            Getting custom gear has never been easier. Three simple steps and
            you're done.
          </p>

          <div className="mt-12 grid md:grid-cols-3 gap-8">
            {steps.map((step) => {
              const StepIcon = step.icon;
              return (
                <div key={step.number} className="text-center">
                  <div className="mx-auto w-14 h-14 rounded-full bg-orange-500 text-white flex items-center justify-center font-display text-xl font-bold">
                    {step.number}
                  </div>
                  <StepIcon className="mx-auto mt-4 w-8 h-8 text-gray-400" />
                  <h3 className="mt-3 font-display text-lg font-semibold">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-gray-500 max-w-xs mx-auto leading-relaxed">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Local Delivery */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Local Express */}
            <div className="border border-gray-200 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="font-display text-xl font-bold">
                  Local Express Service
                </h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Free delivery within 5 miles of our shop. Same-day and next-day
                options available for local customers. We proudly serve the
                south Atlanta metro area with fast, reliable delivery.
              </p>
              <p className="mt-3 text-green-600 font-semibold text-sm">
                Free within 5 miles
              </p>
            </div>

            {/* Nationwide */}
            <div className="border border-gray-200 rounded-2xl p-8">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-display text-xl font-bold">
                  Nationwide Shipping
                </h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                We ship anywhere in the United States with trusted carriers.
                Standard, expedited, and overnight shipping options to fit your
                timeline and budget.
              </p>
              <p className="mt-3 text-blue-600 font-semibold text-sm">
                Free shipping on orders over $150
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-gray-900 text-white py-16 text-center">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl font-bold">
            Ready to Get Started?
          </h2>
          <p className="mt-3 text-gray-400 max-w-lg mx-auto">
            Contact us today for a free quote or start designing online right
            now.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4 flex-wrap">
            <Link
              to="/design"
              className="bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg px-6 py-3 text-sm transition-colors"
            >
              Start Designing
            </Link>
            <Link
              to="/contact"
              className="border border-white/20 hover:bg-white/10 text-white font-semibold rounded-lg px-6 py-3 text-sm transition-colors"
            >
              Get a Quote
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
