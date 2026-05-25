import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import {
  Scissors,
  Trophy,
  Layers,
  ShieldCheck,
  MapPin,
  Upload,
  Printer,
  Truck,
  Package,
  CheckCircle2,
  Shirt,
} from 'lucide-react';

const badges = ['Lightning Fast', 'Quality Guaranteed', 'Local Experts'];

// Each service visual is one of:
//   - kind: 'photo' with an SS Activewear product image (stable URL, on-brand)
//   - kind: 'graphic' with a brand-orange gradient + large icon + a few
//     decorative chips, used when no single product photo represents the
//     service (DTF transfers, awards/promo)
type ServiceVisual =
  | { kind: 'photo'; src: string }
  | { kind: 'graphic'; gradient: string; chips: string[] };

const services: Array<{
  title: string;
  description: string;
  visual: ServiceVisual;
  icon: typeof Shirt;
  items: string[];
  whyChoose: string[];
  cta: { label: string; to: string };
  reverse: boolean;
}> = [
  {
    title: 'Custom Apparel',
    description:
      'From single custom pieces to large team orders, we print vibrant, long-lasting designs on premium garments. Screen printing, DTG, and heat transfer options available for every budget and timeline.',
    visual: { kind: 'photo', src: 'https://www.ssactivewear.com/Images/Style/16_fm.jpg' },
    icon: Shirt,
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
    visual: { kind: 'photo', src: 'https://www.ssactivewear.com/Images/Style/15274_fm.jpg' },
    icon: Scissors,
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
    title: 'DTF Print Transfers',
    description:
      "Just need the prints? We'll send you ready-to-press DTF transfer films — no garments, no sizes, just the artwork on transfer film. Bring your own apparel and press them yourself, or drop the films at any local printer.",
    visual: {
      kind: 'graphic',
      gradient: 'from-orange-500 via-orange-600 to-rose-600',
      chips: ['Full Color', 'Heat-Press Ready', 'No Minimums'],
    },
    icon: Layers,
    items: [
      'Single transfers or bulk runs',
      'Multiple designs per order',
      'Vibrant full-color prints',
      'Heat-press ready',
      'No minimum order',
    ],
    whyChoose: ['Fast turnaround', 'No minimums', 'Bring your own apparel'],
    cta: { label: 'Get a DTF Quote', to: '/quote?service=dtf' },
    reverse: false,
  },
  {
    title: 'Promo & Awards',
    description:
      'Go beyond apparel with our full catalog of customizable products. From corporate awards to personalized gifts, we use laser engraving and sublimation to deliver stunning results.',
    visual: {
      kind: 'graphic',
      gradient: 'from-amber-500 via-orange-500 to-orange-700',
      chips: ['Trophies', 'Mugs', 'Drinkware', 'Gifts'],
    },
    icon: Trophy,
    items: [
      'Trophies & Awards',
      'Custom Mugs',
      'Keychains',
      'Phone Cases',
      'Corporate Gifts',
    ],
    whyChoose: ['Laser precision', 'Premium materials', 'Gift packaging'],
    cta: { label: 'Browse Catalog', to: '/shop' },
    reverse: true,
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
  return (
    <Layout>
      <Seo
        title="Custom Apparel, Embroidery & DTF Printing in Atlanta · TShirt Brothers"
        description="Custom apparel, embroidery, DTF transfers, and promo products serving the Atlanta metro. No minimums, same-day rush available, free local pickup in Fairburn, GA."
        path="/services"
      />
      {/* Hero */}
      <section className="bg-gray-950 text-white py-12 sm:py-16 text-center">
        <div className="container mx-auto px-4">
          <h1
            className="text-4xl sm:text-5xl md:text-6xl text-white tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            Our <span className="text-orange-500">Services</span>
          </h1>
          <p className="mt-4 text-gray-300 max-w-2xl mx-auto text-base sm:text-lg">
            From custom apparel to professional signage, we bring your vision to
            life with precision and care.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
            {badges.map((badge) => (
              <span
                key={badge}
                className="bg-orange-500/10 text-orange-300 border border-orange-500/30 rounded-full px-3 py-1 text-xs font-semibold"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Service Cards */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 space-y-12 sm:space-y-14">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <div
                key={service.title}
                className={`grid md:grid-cols-2 gap-6 sm:gap-10 items-center ${
                  service.reverse ? 'md:[direction:rtl]' : ''
                }`}
              >
                {/* Visual — either an SS Activewear product photo or a
                    branded gradient graphic with decorative chips. */}
                <div
                  className={`relative overflow-hidden rounded-2xl aspect-[4/3] ${
                    service.visual.kind === 'photo' ? 'bg-gray-100' : `bg-gradient-to-br ${service.visual.gradient}`
                  } ${service.reverse ? 'md:[direction:ltr]' : ''}`}
                >
                  {service.visual.kind === 'photo' ? (
                    <img
                      src={service.visual.src}
                      alt={service.title}
                      loading="lazy"
                      className="w-full h-full object-contain p-4"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                      <Icon className="h-20 w-20 opacity-90" strokeWidth={1.5} />
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 px-4">
                        {service.visual.chips.map((chip) => (
                          <span
                            key={chip}
                            className="rounded-full bg-white/25 backdrop-blur px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Service-name pill anchored top-left for instant
                      recognition regardless of which visual mode rendered. */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-gray-900 shadow">
                    <Icon className="h-3.5 w-3.5 text-orange-500" />
                    {service.title}
                  </div>
                </div>

                {/* Content */}
                <div className={service.reverse ? 'md:[direction:ltr]' : ''}>
                  <h2
                    className="text-2xl sm:text-3xl text-gray-900 tracking-tight"
                    style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
                  >
                    {service.title}
                  </h2>
                  <p className="mt-2 text-gray-600 text-sm sm:text-base leading-relaxed">
                    {service.description}
                  </p>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        What We Print
                      </span>
                      <ul className="mt-1.5 space-y-1">
                        {service.items.map((item) => (
                          <li
                            key={item}
                            className="flex items-start gap-1.5 text-sm text-gray-700"
                          >
                            <CheckCircle2 className="mt-0.5 w-3.5 h-3.5 text-orange-500 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                        Why Choose Us
                      </span>
                      <ul className="mt-1.5 space-y-1">
                        {service.whyChoose.map((reason) => (
                          <li
                            key={reason}
                            className="flex items-start gap-1.5 text-sm text-gray-700"
                          >
                            <ShieldCheck className="mt-0.5 w-3.5 h-3.5 text-orange-500 shrink-0" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <Link
                    to={service.cta.to}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold px-5 py-2.5 text-sm shadow-md shadow-orange-500/20 transition-colors"
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
      <section className="bg-gray-50 py-12 sm:py-16 border-y border-gray-200">
        <div className="container mx-auto px-4">
          <h2
            className="text-3xl sm:text-4xl text-gray-900 text-center tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            How It <span className="text-orange-500">Works</span>
          </h2>
          <p className="mt-2 text-gray-600 text-center max-w-xl mx-auto text-sm sm:text-base">
            Three simple steps and you're done.
          </p>

          <div className="mt-8 grid md:grid-cols-3 gap-6 sm:gap-8">
            {steps.map((step) => {
              const StepIcon = step.icon;
              return (
                <div
                  key={step.number}
                  className="relative rounded-2xl bg-white border border-gray-200 px-6 py-7 text-center hover:border-orange-300 hover:shadow-md transition"
                >
                  <div className="mx-auto w-12 h-12 rounded-full bg-orange-500 text-white flex items-center justify-center font-extrabold text-lg">
                    {step.number}
                  </div>
                  <StepIcon className="mx-auto mt-3 w-7 h-7 text-gray-400" />
                  <h3
                    className="mt-2 text-lg text-gray-900"
                    style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700 }}
                  >
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Local Delivery */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-5">
            {/* Local Express */}
            <div className="rounded-2xl border border-gray-200 p-6 sm:p-7 hover:border-orange-300 transition">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-orange-500" />
                </div>
                <h3
                  className="text-xl text-gray-900"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
                >
                  Local Express Service
                </h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                Free local pickup at our Fairburn, GA shop. Same-day and
                next-day options available for the Atlanta metro area.
              </p>
              <p className="mt-3 text-orange-600 font-bold text-sm">
                Free pickup in Fairburn, GA
              </p>
            </div>

            {/* Nationwide */}
            <div className="rounded-2xl border border-gray-200 p-6 sm:p-7 hover:border-orange-300 transition">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                  <Package className="w-5 h-5 text-orange-500" />
                </div>
                <h3
                  className="text-xl text-gray-900"
                  style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800 }}
                >
                  Nationwide Shipping
                </h3>
              </div>
              <p className="text-gray-600 text-sm leading-relaxed">
                We ship anywhere in the United States with trusted carriers.
                Standard, expedited, and overnight options to fit your timeline.
              </p>
              <p className="mt-3 text-orange-600 font-bold text-sm">
                Free shipping on orders over $150
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="bg-gray-950 text-white py-12 sm:py-14 text-center">
        <div className="container mx-auto px-4">
          <h2
            className="text-3xl sm:text-4xl tracking-tight"
            style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
          >
            Ready to <span className="text-orange-500">Get Started?</span>
          </h2>
          <p className="mt-2 text-gray-300 max-w-lg mx-auto text-sm sm:text-base">
            Contact us today for a free quote or start designing online.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
            <Link
              to="/design"
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-lg px-6 py-3 text-sm shadow-md shadow-orange-500/25 transition-colors"
            >
              Start Designing
            </Link>
            <Link
              to="/quote"
              className="border border-white/30 hover:bg-white/10 text-white font-bold rounded-lg px-6 py-3 text-sm transition-colors"
            >
              Get a Quote
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
