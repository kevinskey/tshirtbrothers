import { Link } from 'react-router-dom';

const areas = [
  'Tyrone',
  'Fairburn',
  'Peachtree City',
  'Fayetteville',
  'Union City',
  'Newnan',
  'Atlanta Metro',
];

export default function LocalCTA() {
  return (
    <section className="bg-gray-900 text-white text-center py-20">
      <div className="container mx-auto px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-400 mb-3">
          PROUDLY LOCAL
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
          Ready to Get Started?
        </h2>
        <p className="text-gray-400 text-base mb-8 max-w-md mx-auto">
          Get a free quote in under 24 hours. No minimums, no hassle — just great custom printing.
        </p>

        <div className="flex flex-wrap justify-center gap-4 mb-10">
          <Link
            to="/quote"
            className="inline-flex items-center justify-center h-12 px-6 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-sm"
          >
            Get a Free Quote &rarr;
          </Link>
          <Link
            to="/design"
            className="inline-flex items-center justify-center h-12 px-6 border border-white/20 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors"
          >
            Start Designing
          </Link>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {areas.map((area) => (
            <span
              key={area}
              className="bg-white/10 border border-white/10 rounded-full px-4 py-1.5 text-xs text-gray-400"
            >
              {area}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
