import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { User } from '@/lib/api';

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
      // Stash the query so we can use it after sign-in (basic best-effort via sessionStorage)
      sessionStorage.setItem('pending_poetry_q', q);
      window.location.href = `${apiBase}/api/auth/google`;
    }
  }

  // If we just came back from sign-in with a pending query, take them straight to poetry
  if (user) {
    const pending = sessionStorage.getItem('pending_poetry_q');
    if (pending) {
      sessionStorage.removeItem('pending_poetry_q');
      navigate(`/app/poetry?q=${encodeURIComponent(pending)}`);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-8 py-6 flex items-center justify-between">
        <div className="font-serif text-2xl font-bold tracking-tight">Songwriter</div>
        {user ? (
          <Link
            to="/app"
            className="px-4 py-2 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 text-sm font-medium"
          >
            Open your songs →
          </Link>
        ) : (
          <a
            href={`${apiBase}/api/auth/google`}
            className="px-4 py-2 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 text-sm font-medium"
          >
            Sign in with Google
          </a>
        )}
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-8 py-16 text-center">
          <h1 className="font-serif text-5xl md:text-7xl font-bold tracking-tight text-ink-900 mb-6 leading-[1.05]">
            Write lyrics that <span className="text-accent italic">sing.</span>
          </h1>
          <p className="text-lg md:text-xl text-ink-600 mb-10 max-w-xl mx-auto">
            A distraction-free lyric editor with AI rhyme suggestions, next-line prompts,
            and syllable counting. Save to the cloud, write from any device.
          </p>
          <a
            href={`${apiBase}/api/auth/google`}
            className="inline-flex items-center gap-3 px-6 py-3 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 font-medium"
          >
            <GoogleMark />
            Start writing — sign in with Google
          </a>
        </div>

        {/* Poetry inspiration search */}
        <section className="bg-ink-100 py-16 px-8 border-y border-ink-200">
          <div className="max-w-3xl mx-auto text-center">
            <div className="text-[10px] uppercase tracking-[0.2em] text-accent mb-2 font-semibold">
              AI poetry agent
            </div>
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-ink-900 mb-3">
              Find poetry to inspire your next song
            </h2>
            <p className="text-ink-600 mb-8 max-w-xl mx-auto">
              Type a theme — heartbreak, the open road, hope after grief — and our AI will surface
              classic public-domain poems you can adapt right into your lyrics.
            </p>

            <div className="flex flex-col sm:flex-row gap-2 max-w-xl mx-auto">
              <input
                type="text"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handlePoetrySearch(); }}
                placeholder="e.g. losing a parent, summer love, the open road"
                className="flex-1 px-4 py-3 bg-white border border-ink-200 rounded-md focus:outline-none focus:border-accent text-base"
              />
              <button
                onClick={handlePoetrySearch}
                disabled={!theme.trim()}
                className="px-6 py-3 bg-ink-900 text-ink-50 rounded-md hover:bg-ink-800 font-medium disabled:opacity-40"
              >
                {user ? 'Find poems' : 'Sign in to search'}
              </button>
            </div>
            <p className="text-[11px] text-ink-400 mt-3">
              {user ? 'Free with your account' : 'Free — Google sign-in required'}
            </p>
          </div>
        </section>

        <div className="max-w-3xl mx-auto px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-left">
            <Feature title="Rhyme finder" body="Perfect, near, and multi-syllable rhymes — context-aware so results fit your song's mood." />
            <Feature title="Next-line suggestions" body="Stuck on a line? Get three options that match your meter and rhyme scheme." />
            <Feature title="Generate full songs" body="Give a topic, get a complete verse-chorus-bridge song you can edit and make your own." />
          </div>
        </div>
      </main>

      <footer className="px-8 py-6 text-xs text-ink-400 text-center">
        Songwriter · AI-powered lyric editor
      </footer>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h3 className="font-serif text-xl font-semibold mb-2">{title}</h3>
      <p className="text-ink-600 text-sm leading-relaxed">{body}</p>
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
