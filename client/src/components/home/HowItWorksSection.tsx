import { Link } from 'react-router-dom';
import { Palette, Printer, Package } from 'lucide-react';

const steps = [
  {
    num: 1,
    icon: Palette,
    title: 'Design',
    desc: 'Use our free design studio or send us your artwork. We can help with that too.',
    color: 'bg-orange-500',
  },
  {
    num: 2,
    icon: Printer,
    title: 'We Print',
    desc: 'Screen printing, DTF transfers, embroidery — we handle production with care.',
    color: 'bg-gray-900',
  },
  {
    num: 3,
    icon: Package,
    title: 'You Receive',
    desc: 'Fast delivery to your door or free local pickup in Fairburn, GA.',
    color: 'bg-emerald-600',
  },
];

export default function HowItWorksSection() {
  return (
    <section className="py-12 md:py-16 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <p className="text-sm font-semibold text-orange-500 uppercase tracking-wider mb-2">Simple as 1-2-3</p>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-gray-900">
            How It Works
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div key={step.num} className="text-center">
                <div className={"mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5 shadow-lg " + step.color}>
                  <Icon className="h-7 w-7 text-white" />
                </div>
                <div className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-2">
                  Step {step.num}
                </div>
                <h3 className="font-display text-xl font-bold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-500 leading-relaxed text-sm max-w-xs mx-auto">
                  {step.desc}
                </p>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <Link
            to="/design"
            className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors shadow-lg shadow-orange-500/20"
          >
            Start Designing — It&apos;s Free
          </Link>
        </div>
      </div>
    </section>
  );
}
