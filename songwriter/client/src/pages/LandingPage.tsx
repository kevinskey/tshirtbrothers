import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@/lib/api';
import { Sun, GrassStrip, Leaf, Flower, Branch } from '@/components/decorations/GardenDecorations';

export default function LandingPage({ user }: { user: User | null }) {
  const apiBase = import.meta.env.VITE_API_URL || '';
  const navigate = useNavigate();
  const [theme, setTheme] = useState('');

  function handlePoetrySearch() {
    const q = theme.trim();
    if (!q) return;
    if (user) {
      navigate(`/app/poetry?q=${encodeURIComponent(q)}`);
    } else {
      sessionStorage.setItem('pending_poetry_q', q);
      window.location.href = `${apiBase}/api/auth/google`;
    }
  }

  if (user) {
    const pending = sessionStorage.getItem('pending_poetry_q');
    if (pending) {
      sessionStorage.removeItem('pending_poetry_q');
      navigate(`/app/poetry?q=${encodeURIComponent(pending)}`);
    }
  }

  return (
    <div className="min-h-screen bg-meadow-gradient text-meadow-900 overflow-x-hidden">
      {/* Header */}
      <header className="relative px-4 sm:px-8 py-4 sm:py-6 flex items-center justify-between z-10 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Flower size={28} petal="#f2c6c6" center="#f5c842" />
          <div className="font-serif text-xl sm:text-2xl font-bold tracking-tight text-meadow-800 truncate">Songwriter</div>
        </div>
        {user ? (
          <Link
            to="/app"
            className="px-3 sm:px-4 py-2 bg-meadow-700 text-meadow-50 rounded-full hover:bg-meadow-800 text-xs sm:text-sm font-medium shadow-sm whitespace-nowrap"
          >
            Open songs →
          </Link>
        ) : (
          <a
            href={`${apiBase}/api/auth/google`}
            className="px-3 sm:px-4 py-2 bg-meadow-700 text-meadow-50 rounded-full hover:bg-meadow-800 text-xs sm:text-sm font-medium shadow-sm whitespace-nowrap"
          >
            Sign in
          </a>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Sun — clipped to section on mobile */}
        <Sun className="absolute top-4 -right-8 sm:top-8 sm:right-6 md:right-16 opacity-90 z-0" size={180} />
        {/* Floating garden scatter — hide some on mobile */}
        <Leaf className="absolute top-16 left-4 opacity-70 z-0" color="#6b8f42" rotate={-30} size={30} />
        <Leaf className="hidden sm:block absolute top-56 left-20 opacity-50 z-0" color="#8eb063" rotate={25} size={30} />
        <Flower className="hidden md:block absolute top-40 left-[45%] opacity-80 z-0" petal="#f2c6c6" center="#f5c842" size={36} />
        <Flower className="hidden sm:block absolute top-72 right-24 opacity-70 z-0" petal="#cfe7f2" center="#e6b020" size={28} />
        <Leaf className="hidden sm:block absolute bottom-20 right-[35%] opacity-60 z-0" color="#527132" rotate={-55} size={34} />

        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-8 pt-8 sm:pt-16 pb-20 sm:pb-28 text-center">
          <h1 className="font-serif text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-meadow-900 mb-4 sm:mb-6 leading-[1.05]">
            Write songs that <span className="italic text-accent">bloom.</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-meadow-700 mb-8 sm:mb-10 max-w-xl mx-auto">
            A sunlit place for songwriters. Rhymes, next-line prompts, poetry, scripture, and AI
            that helps good lines take root.
          </p>
          <a
            href={`${apiBase}/api/auth/google`}
            className="inline-flex items-center gap-3 px-5 sm:px-6 py-3 bg-meadow-700 text-meadow-50 rounded-full hover:bg-meadow-800 font-medium shadow-md hover:shadow-lg transition-shadow text-sm sm:text-base"
          >
            <GoogleMark />
            Start writing with Google
          </a>
        </div>

        {/* Wavy grass transition */}
        <GrassStrip className="absolute bottom-0 left-0 w-full h-12 sm:h-20 opacity-90" />
      </section>

      {/* Poetry inspiration — the "meadow" section */}
      <section className="relative bg-meadow-100 border-y border-meadow-200 py-12 sm:py-20 px-4 sm:px-8 overflow-hidden">
        <Leaf className="absolute top-10 left-10 opacity-40" color="#527132" rotate={-15} size={56} />
        <Leaf className="absolute top-16 right-16 opacity-40" color="#6b8f42" rotate={40} size={44} />
        <Flower className="absolute bottom-14 left-20 opacity-70" petal="#e89b9b" center="#f5c842" size={38} />

        <div className="relative max-w-3xl mx-auto text-center">
          <div className="text-[11px] uppercase tracking-[0.22em] text-meadow-600 font-semibold mb-3">
            🌱 AI poetry agent
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-meadow-900 mb-3">
            Find poetry to water your next song
          </h2>
          <p className="text-sm sm:text-base text-meadow-700 mb-6 sm:mb-8 max-w-xl mx-auto">
            Type a theme and our AI will pluck classic public-domain poems you can adapt right into your lyrics.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto">
            <input
              type="text"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePoetrySearch(); }}
              placeholder="heartbreak, the open road, summer love…"
              className="flex-1 px-4 py-3 bg-white border border-meadow-200 rounded-full focus:outline-none focus:border-accent text-base shadow-sm"
            />
            <button
              onClick={handlePoetrySearch}
              disabled={!theme.trim()}
              className="px-6 py-3 bg-meadow-700 text-meadow-50 rounded-full hover:bg-meadow-800 font-medium disabled:opacity-40 shadow-sm whitespace-nowrap"
            >
              {user ? 'Find poems' : 'Sign in to search'}
            </button>
          </div>
          <p className="text-[11px] text-meadow-500 mt-3">
            {user ? 'Free with your account' : 'Free — Google sign-in required'}
          </p>
        </div>
      </section>

      {/* Feature garden — 6 tools as "plots" */}
      <section className="relative max-w-5xl mx-auto px-4 sm:px-8 py-12 sm:py-20">
        <div className="text-center mb-8 sm:mb-12">
          <div className="text-[11px] uppercase tracking-[0.22em] text-meadow-600 font-semibold mb-3">
            🌻 Your creative garden
          </div>
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-meadow-900">
            Six tools, one place to grow
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          <FeatureCard
            icon={<Sun size={40} />}
            title="AI co-writer"
            body="Suggest next lines, rewrite weak lines, and write whole songs on any topic."
            tone="sun"
          />
          <FeatureCard
            icon={<Flower size={40} petal="#e89b9b" center="#f5c842" />}
            title="Rhyme finder"
            body="Perfect, near, and multi-syllable rhymes — context-aware to fit your song's mood."
            tone="petal"
          />
          <FeatureCard
            icon={<Leaf size={40} color="#527132" />}
            title="Poetry library"
            body="Search classic public-domain poets by theme, background, and era. Import as lyrics."
            tone="leaf"
          />
          <FeatureCard
            icon={<Branch size={90} />}
            title="Book of Psalms"
            body="All 150 psalms in 11 translations. AI adapts scripture into modern song lyrics."
            tone="branch"
          />
          <FeatureCard
            icon={<Flower size={40} petal="#cfe7f2" center="#e6b020" />}
            title="Lyricist's dictionary"
            body="Definitions, synonyms, collocations, rhymes, plus AI connotation and metaphor help."
            tone="sky"
          />
          <FeatureCard
            icon={<Leaf size={40} color="#8eb063" rotate={-30} />}
            title="Analyze & model"
            body="Study how any song works — then write a brand-new one using it as a structural template."
            tone="meadow"
          />
        </div>
      </section>

      {/* Closing band */}
      <section className="relative bg-sun-gradient py-12 sm:py-16 px-4 sm:px-8 border-t border-meadow-200 overflow-hidden">
        <div className="absolute top-0 left-0 right-0 overflow-hidden">
          <GrassStrip className="w-full h-6 sm:h-8 opacity-60 rotate-180" />
        </div>
        <Flower className="hidden sm:block absolute top-10 left-12 opacity-70" petal="#e89b9b" center="#f5c842" size={32} />
        <Flower className="hidden sm:block absolute bottom-12 right-16 opacity-80" petal="#cfe7f2" center="#f5c842" size={28} />

        <div className="relative max-w-2xl mx-auto text-center">
          <h2 className="font-serif text-2xl sm:text-3xl font-bold text-meadow-900 mb-3 sm:mb-4">
            Every song starts with a seed.
          </h2>
          <p className="text-sm sm:text-base text-meadow-700 mb-6">
            Plant one today.
          </p>
          <a
            href={`${apiBase}/api/auth/google`}
            className="inline-flex items-center gap-3 px-6 py-3 bg-meadow-700 text-meadow-50 rounded-full hover:bg-meadow-800 font-medium shadow-md"
          >
            <GoogleMark />
            Sign in with Google
          </a>
        </div>
      </section>

      <footer className="px-8 py-6 text-xs text-meadow-500 text-center bg-meadow-100">
        Songwriter · A sunlit place for lyricists
      </footer>
    </div>
  );
}

function FeatureCard({
  icon, title, body, tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  tone: 'sun' | 'petal' | 'leaf' | 'branch' | 'sky' | 'meadow';
}) {
  const bg = {
    sun:    'bg-sun-100 border-sun-200',
    petal:  'bg-petal-300/30 border-petal-300/50',
    leaf:   'bg-meadow-100 border-meadow-200',
    branch: 'bg-meadow-50 border-meadow-200',
    sky:    'bg-sky_soft-200 border-sky_soft-300',
    meadow: 'bg-meadow-100 border-meadow-300',
  }[tone];

  return (
    <div className={`relative p-6 rounded-2xl border ${bg} transition-transform hover:-translate-y-1 hover:shadow-md`}>
      <div className="mb-3 flex items-center">{icon}</div>
      <h3 className="font-serif text-xl font-semibold text-meadow-900 mb-2">{title}</h3>
      <p className="text-meadow-700 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C33.6 6.1 29 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C33.6 6.1 29 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5 0 9.5-1.9 12.9-5.1l-6-5.1C28.9 35.5 26.6 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.3-2.2 4.3-4 5.7l6 5.1c-.4.4 6.7-4.9 6.7-14.8 0-1.2-.1-2.3-.4-4z"/>
    </svg>
  );
}
