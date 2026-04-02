const props = [
  {
    emoji: '\uD83D\uDCE6',
    title: 'No Minimums',
    description: 'Order 1 shirt or 1,000 — we handle orders of all sizes with the same care and attention.',
  },
  {
    emoji: '\u26A1',
    title: 'Same-Day Rush',
    description: 'Need it fast? We offer same-day production and pickup for qualifying orders in Tyrone, GA.',
  },
  {
    emoji: '\uD83C\uDFC6',
    title: 'Quality Guaranteed',
    description: 'We stand behind every print. If you\'re not happy, we\'ll make it right — guaranteed.',
  },
  {
    emoji: '\uD83D\uDCCD',
    title: 'Local & National',
    description: 'Free local delivery in Tyrone, GA and surrounding areas. We also ship nationwide.',
  },
];

export default function ValueProps() {
  return (
    <section className="bg-gray-50 border-y py-16">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
          {props.map((prop) => (
            <div key={prop.title} className="text-center">
              <div className="w-14 h-14 bg-white border rounded-xl flex items-center justify-center text-2xl mx-auto mb-4">
                {prop.emoji}
              </div>
              <h3 className="font-display font-semibold text-base mb-2">{prop.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{prop.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
