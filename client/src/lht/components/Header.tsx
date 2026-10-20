import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, ShoppingBag, X } from 'lucide-react';
import Logo from './Logo';
import { useLhtPath } from '../lib/base';
import { useLhtCart } from '../lib/cart';

const NAV = [
  { label: 'The Collection', path: '/#shop' },
  { label: 'Truth Session', path: '/truth' },
  { label: 'Free Guide', path: '/guide' },
  { label: 'About', path: '/#about' },
];

export default function Header() {
  const p = useLhtPath();
  const { count } = useLhtCart();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-lht-ink/95 backdrop-blur border-b border-lht-cream/10 text-lht-cream">
      <div className="bg-lht-cyan text-lht-ink text-center text-xs sm:text-sm font-lht-sans font-semibold py-1.5 px-4">
        The Fall 2026 collection is live — heavyweight sets in eleven colors.
      </div>
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3 sm:gap-8 py-4">
          <button
            type="button"
            className="lg:hidden p-2 -ml-2"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          <Logo />

          <nav className="hidden lg:flex items-center gap-1 ml-10 text-sm font-lht-sans font-semibold uppercase tracking-[0.12em]" aria-label="Primary">
            {NAV.map((l) => (
              <Link key={l.label} to={p(l.path)} className="px-4 py-2 hover:text-lht-cyan transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <Link to={p('/cart')} className="relative p-2 hover:text-lht-cyan transition-colors" aria-label={`Bag, ${count} items`}>
              <ShoppingBag className="h-5 w-5 sm:h-6 sm:w-6" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-lht-cyan text-lht-ink text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {menuOpen && (
        <nav className="lg:hidden border-t border-lht-cream/10 bg-lht-ink px-4 py-3 space-y-1" aria-label="Primary">
          {NAV.map((l) => (
            <Link
              key={l.label}
              to={p(l.path)}
              onClick={() => setMenuOpen(false)}
              className="block py-2.5 px-2 font-lht-sans font-semibold uppercase tracking-[0.12em] text-sm hover:text-lht-cyan"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
