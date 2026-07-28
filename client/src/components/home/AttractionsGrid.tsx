import { Flag, Target, Swords, UtensilsCrossed, Trophy, PartyPopper } from 'lucide-react';

// The venue's headline attractions. Each card owns a distinct brand color
// so the grid reads as bright and playful. Class names are written out in
// full (not concatenated) so Tailwind's content scanner keeps them.
const attractions = [
  {
    icon: Flag,
    title: '18-Hole Mini Golf',
    body: 'Wind through 18 creative holes built for every skill level — bring the kids or settle a friendly rivalry.',
    ring: 'hover:border-fling-green',
    chip: 'bg-fling-green/10 text-fling-green',
    emoji: '⛳',
  },
  {
    icon: Target,
    title: 'Axe Throwing',
    body: 'Step up to the lane, take aim, and let it fly. Coaches on hand so first-timers stick the bullseye.',
    ring: 'hover:border-fling-red',
    chip: 'bg-fling-red/10 text-fling-red',
    emoji: '🪓',
  },
  {
    icon: Swords,
    title: 'Ninja Stars',
    body: 'Test your precision with throwing stars — a fast, addictive challenge you won’t find just anywhere.',
    ring: 'hover:border-fling-purple',
    chip: 'bg-fling-purple/10 text-fling-purple',
    emoji: '🎯',
  },
  {
    icon: UtensilsCrossed,
    title: 'Food Truck Bites',
    body: 'Rotating food trucks serving up delicious eats and cold drinks to keep the whole crew fueled.',
    ring: 'hover:border-fling-orange',
    chip: 'bg-fling-orange/10 text-fling-orange',
    emoji: '🍔',
  },
  {
    icon: Trophy,
    title: 'The Winner’s Wall',
    body: 'Land a top score and earn your spot on our famous Winner’s Wall — bragging rights guaranteed.',
    ring: 'hover:border-fling-yellow',
    chip: 'bg-fling-yellow/20 text-yellow-600',
    emoji: '🏆',
  },
  {
    icon: PartyPopper,
    title: 'Parties & Events',
    body: 'Birthdays, team outings, date nights, and group celebrations — we’ll host a day to remember.',
    ring: 'hover:border-fling-pink',
    chip: 'bg-fling-pink/10 text-fling-pink',
    emoji: '🎉',
  },
];

export default function AttractionsGrid() {
  return (
    <section id="attractions" className="scroll-mt-24 py-14 sm:py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <span className="inline-block rounded-full bg-fling-green/10 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-fling-green">
            The Fun Lineup
          </span>
          <h2
            className="mt-3 text-3xl sm:text-4xl text-fling-ink tracking-tight"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif", fontWeight: 700 }}
          >
            Everything to <span className="text-fling-pink">Swing</span> &amp;{' '}
            <span className="text-fling-green">Fling</span> About
          </h2>
          <p className="mt-3 text-gray-600">
            One outdoor playground, endless ways to play, eat, and celebrate.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {attractions.map((a) => {
            const Icon = a.icon;
            return (
              <div
                key={a.title}
                className={`group rounded-3xl border-2 border-gray-100 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg ${a.ring}`}
              >
                <div className="flex items-center justify-between">
                  <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${a.chip}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="text-3xl transition-transform group-hover:scale-125">{a.emoji}</span>
                </div>
                <h3 className="mt-4 text-xl font-extrabold text-fling-ink">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600">{a.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
