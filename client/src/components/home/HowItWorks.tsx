const steps = [
  {
    num: '1',
    title: 'Choose & Design',
    description:
      'Pick your garment from 6,500+ options. Upload your logo or work with our design team to create something unique.',
  },
  {
    num: '2',
    title: 'Get a Quote',
    description:
      "Tell us what you need. We'll send a detailed quote within 24 hours — no hidden fees, no surprises.",
  },
  {
    num: '3',
    title: 'We Print & Deliver',
    description:
      'Professional printing with same-day local pickup available in Tyrone, GA. Or we ship right to your door.',
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-gray-900 text-white py-20">
      <div className="container mx-auto px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-3">
          HOW IT WORKS
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
          Three Simple Steps
        </h2>
        <p className="text-gray-400 text-base mb-12 max-w-lg">
          Getting custom apparel has never been easier. Here's how we make it happen.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((step) => (
            <div
              key={step.num}
              className="bg-white/5 border border-white/10 rounded-xl p-8"
            >
              <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-sm mb-5">
                {step.num}
              </div>
              <h3 className="font-display font-semibold text-xl mb-3">{step.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
