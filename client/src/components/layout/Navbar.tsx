import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Phone, User, Menu, X, MessageCircle, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

// Sub-nav tabs for the Swing & Fling venue. Each tab deliberately hovers a
// DIFFERENT brand color so the nav feels as playful as the venue. Anchors
// use plain <a href="/#id"> so they work from any page — the browser lands
// on the homepage and native-scrolls to the section (which set scroll-mt).
// Hover classes are written out in full so Tailwind's scanner keeps them.
type Tab = { label: string; href: string; hover: string };
const tabs: Tab[] = [
  { label: 'Attractions', href: '/#attractions', hover: 'hover:text-fling-green' },
  { label: 'Plan Your Visit', href: '/#plan-visit', hover: 'hover:text-fling-blue' },
  { label: 'Parties & Events', href: '/#parties', hover: 'hover:text-fling-pink' },
  { label: 'Eats & Treats', href: '/#eats', hover: 'hover:text-fling-orange' },
  { label: 'Reviews', href: '/#reviews', hover: 'hover:text-fling-purple' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [phoneMenu, setPhoneMenu] = useState(false);
  const phoneBtnRef = useRef<HTMLDivElement | null>(null);

  const isLoggedIn = !!localStorage.getItem('tsb_token');

  return (
    <nav className="sticky top-0 z-50 bg-white overflow-x-hidden">
      {/* Top promo strip — the venue's signature no-reservations promise. */}
      <Link
        to="/#plan-visit"
        className="block bg-fling-ink text-white text-center text-xs sm:text-sm py-2.5 sm:py-1.5 px-2 sm:px-4 whitespace-nowrap overflow-hidden hover:bg-fling-green transition-colors"
      >
        No Reservations Needed &mdash; Just Swing By!{' '}
        <span className="font-bold underline">Plan Your Visit</span>
      </Link>

      {/* Main header row — combined logo left, phone + account right. */}
      <div className="bg-white border-b border-gray-200/80">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2.5">
          <div className="flex items-center gap-3">
            {/* Hamburger */}
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            {/* Combined Swing & Fling wordmark logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0" aria-label="Swing & Fling home">
              <span
                className="text-2xl sm:text-3xl leading-none tracking-tight"
                style={{ fontFamily: "'Fraunces', Georgia, serif", fontWeight: 900 }}
              >
                <span className="text-fling-green">Swing</span>
                <span className="mx-1 text-gray-400">&amp;</span>
                <span className="text-fling-pink">Fling</span>
              </span>
            </Link>

            {/* Desktop tabs — each hovers a different brand color */}
            <div className="hidden md:flex items-center gap-6 ml-6">
              {tabs.map((t) => (
                <a
                  key={t.label}
                  href={t.href}
                  className={cn(
                    'text-sm font-bold text-gray-700 transition-colors whitespace-nowrap',
                    t.hover,
                  )}
                >
                  {t.label}
                </a>
              ))}
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-1 sm:gap-3 ml-auto flex-shrink-0">
              {/* Phone — icon-only on mobile, icon + number on md+. */}
              <div className="relative" ref={phoneBtnRef}>
                <button type="button" onClick={() => setPhoneMenu(p => !p)} aria-label="Call or text us" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-fling-green transition-colors p-2 md:px-2 md:py-2">
                  <Phone className="h-5 w-5 md:h-4 md:w-4" />
                  <span className="hidden md:inline">(470) 622-1392</span>
                </button>
                {phoneMenu && (() => {
                  const r = phoneBtnRef.current?.getBoundingClientRect();
                  const top = r ? r.bottom + 8 : 64;
                  const right = r ? window.innerWidth - r.right : 16;
                  return createPortal(
                    <>
                      <div className="fixed inset-0 z-[9998]" onClick={() => setPhoneMenu(false)} />
                      <div className="fixed bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-48 z-[9999]" style={{ top, right }}>
                        <a href="tel:+14706221392" onClick={() => setPhoneMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-fling-green/10 hover:text-fling-green transition"><Phone className="h-4 w-4" />Call Us</a>
                        <a href="sms:+14706221392" onClick={() => setPhoneMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-fling-green/10 hover:text-fling-green transition"><MessageCircle className="h-4 w-4" />Text Us</a>
                      </div>
                    </>,
                    document.body,
                  );
                })()}
              </div>

              {/* Book Your Party — high-intent CTA */}
              <a
                href="/#parties"
                className="hidden sm:inline-flex items-center justify-center rounded-full bg-fling-pink px-4 py-2 text-sm font-extrabold text-white shadow-sm hover:bg-fling-purple transition-colors"
              >
                Book a Party
              </a>

              {/* Account / Sign In */}
              {isLoggedIn ? (
                <Link to="/account" className="hidden sm:flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-fling-blue hover:bg-gray-100 transition-colors">
                  <User className="h-5 w-5" />
                  <span>Account</span>
                </Link>
              ) : (
                <Link to="/auth" className="hidden sm:flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-fling-blue hover:bg-gray-100 transition-colors">
                  <User className="h-5 w-5" />
                  <span>Sign In</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/hamburger menu */}
      <div
        className={cn(
          'bg-white border-b border-gray-200 max-h-[80vh] overflow-y-auto md:hidden',
          mobileOpen ? 'block' : 'hidden'
        )}
      >
        <div className="px-4 py-3 space-y-1">
          {tabs.map((t) => (
            <a
              key={t.label}
              href={t.href}
              className={cn(
                'block rounded-lg px-3 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors',
                t.hover,
              )}
              onClick={() => setMobileOpen(false)}
            >
              {t.label}
            </a>
          ))}

          <a
            href="/#parties"
            className="block rounded-lg px-3 py-2.5 text-sm font-extrabold text-fling-pink hover:bg-fling-pink/10 transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            🎉 Book Your Party/Event
          </a>

          <a
            href="sms:+14706221392"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-fling-green hover:bg-gray-50 transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            <MessageCircle className="h-4 w-4" />
            Text (470) 622-1392
          </a>

          {/* Account section */}
          <div className="border-t border-gray-200 mt-2 pt-2">
            {isLoggedIn ? (
              <>
                <Link
                  to="/account"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-fling-blue hover:bg-gray-50 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="h-4 w-4" />
                  My Account
                </Link>
                <Link
                  to="/admin"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-fling-green hover:bg-fling-green/10 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="h-4 w-4" />
                  Admin Dashboard
                </Link>
                <button
                  onClick={() => {
                    localStorage.removeItem('tsb_token');
                    setMobileOpen(false);
                    window.location.href = '/';
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors w-full text-left"
                >
                  <LogOut className="h-4 w-4" />
                  Log Out
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-fling-blue hover:bg-fling-blue/10 transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                <User className="h-4 w-4" />
                Sign In / Create Account
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
