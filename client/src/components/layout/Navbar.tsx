import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Search, User, Menu, X, MessageCircle, LogOut, ChevronDown, Heart, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavLink = { label: string; href: string; desktopOnly?: boolean };
type NavEntry = NavLink | { label: string; children: NavLink[]; desktopOnly?: boolean };
const isGroup = (e: NavEntry): e is { label: string; children: NavLink[]; desktopOnly?: boolean } => 'children' in e;

const catalogueLinks: NavLink[] = [
  { label: 'T-Shirts', href: '/shop?category=T-Shirts' },
  { label: 'Hoodies & Fleece', href: '/shop?category=Fleece' },
  { label: 'Hats', href: '/shop?category=Headwear' },
  { label: 'Polos', href: '/shop?category=Polos' },
  { label: 'Outerwear', href: '/shop?category=Outerwear' },
  { label: 'Accessories', href: '/shop?category=Accessories' },
  { label: 'All Products', href: '/shop' },
];

// desktopOnly entries are hidden from the sub-nav pill on mobile (they
// still appear in the hamburger menu). Keeps the mobile pill to just the
// three high-intent CTAs — Design Studio, Catalogue, Get a Quote — so it
// stays one screen-width without horizontal scrolling.
const subNavEntries: NavEntry[] = [
  { label: 'Design Studio', href: '/design' },
  { label: 'Catalogue', children: catalogueLinks },
  { label: 'Get a Quote', href: '/quote' },
  { label: 'Services', href: '/services', desktopOnly: true },
  { label: 'About', href: '/about', desktopOnly: true },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileCatalogueOpen, setMobileCatalogueOpen] = useState(false);
  const [desktopCatalogueOpen, setDesktopCatalogueOpen] = useState(false);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [phoneMenu, setPhoneMenu] = useState(false);
  const phoneBtnRef = useRef<HTMLDivElement | null>(null);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileOpen(false);
    }
  };

  const isLoggedIn = !!localStorage.getItem('tsb_token');

  return (
    <nav className="sticky top-0 z-50 bg-white overflow-x-hidden">
      {/* Top promo strip — same shape as the Custom Ink black banner. */}
      <Link
        to="/shop"
        className="block bg-gray-900 text-white text-center text-xs sm:text-sm py-2.5 sm:py-0.5 px-2 sm:px-4 whitespace-nowrap overflow-hidden hover:bg-gray-800 transition-colors"
      >
        15% Off T-shirts, Athletics &amp; Polos — Prices as Marked.<sup>*</sup>{' '}
        <span className="font-bold underline">Shop Sale</span>
      </Link>

      {/* Main header row — Custom Ink-style: hamburger + logo on left,
          heart / account / phone on the right. The big rounded search
          field lives in its own row below, full-width at every viewport. */}
      <div className="bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-1.5">
          <div className="flex items-center gap-3">
            {/* Always-visible hamburger (mobile + desktop, like Custom Ink) */}
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg p-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <img
                src="https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png"
                alt="TShirt Brothers"
                className="h-12 w-12 sm:h-14 sm:w-14 object-contain"
              />
              <span
                className="text-base sm:text-xl text-orange-700 leading-[0.95] tracking-tight"
                style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
              >
                <span className="block sm:inline">TSHIRT</span>{' '}
                <span className="block sm:inline">BROTHERS</span>
              </span>
            </Link>

            {/* Right side actions */}
            <div className="flex items-center gap-1 sm:gap-3 ml-auto flex-shrink-0">
              {/* Phone — icon-only on mobile, icon + number on md+. */}
              <div className="relative" ref={phoneBtnRef}>
                <button type="button" onClick={() => setPhoneMenu(p => !p)} aria-label="Call or text us" className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-orange-600 transition-colors p-2 md:px-2 md:py-2">
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
                        <a href="tel:+14706221392" onClick={() => setPhoneMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition"><Phone className="h-4 w-4" />Call Us</a>
                        <a href="sms:+14706221392" onClick={() => setPhoneMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition"><MessageCircle className="h-4 w-4" />Text Us</a>
                      </div>
                    </>,
                    document.body,
                  );
                })()}
              </div>

              {/* Favorites (heart) */}
              <Link
                to={isLoggedIn ? '/favorites' : '/auth'}
                aria-label="Favorites"
                className="inline-flex items-center justify-center p-2 rounded-lg text-gray-700 hover:text-orange-600 hover:bg-gray-100 transition-colors"
              >
                <Heart className="h-5 w-5" />
              </Link>

              {/* Account / Sign In (avatar + label) */}
              {isLoggedIn ? (
                <Link to="/account" className="flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-orange-600 hover:bg-gray-100 transition-colors">
                  <User className="h-5 w-5" />
                  <span>Account</span>
                </Link>
              ) : (
                <Link to="/auth" className="flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-orange-600 hover:bg-gray-100 transition-colors">
                  <User className="h-5 w-5" />
                  <span>Sign In</span>
                </Link>
              )}

              {/* Cart — links to quote builder since TSB orders go through quotes */}
              <Link
                to="/quote"
                aria-label="Quote builder"
                className="inline-flex items-center justify-center p-2 rounded-lg text-gray-700 hover:text-orange-600 hover:bg-gray-100 transition-colors"
              >
                <ShoppingCart className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>

        {/* Custom Ink-style pill search — its own row, full-width, all sizes.
            Border-b below mirrors the thin divider Custom Ink uses to
            separate the header block from page content. */}
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8 pb-3 sm:pb-4 sm:border-b border-gray-200/80">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for t-shirts, hoodies, hats, and more"
              className="w-full rounded-full bg-gray-100 pl-12 pr-4 py-[9.5px] text-base text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white border border-transparent focus:border-orange-300"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
      </div>

      {/* Sub-nav row — floating 3D pill. Visible at every breakpoint;
          on mobile the pill is horizontally scrollable (overflow-x-auto
          on the wrapper) so all 5 entries stay reachable from the
          landing page without opening the hamburger. The pill itself
          stays a single line — no wrap — to preserve the rounded shape. */}
      <div className="bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2 sm:py-3">
          <div
            className="flex justify-center overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div
              className="inline-flex flex-nowrap items-center gap-4 sm:gap-6 px-5 sm:px-6 py-1.5 sm:py-2 rounded-full border border-gray-200 bg-gradient-to-b from-white to-gray-100 overflow-visible"
              style={{
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)',
              }}
            >
            {subNavEntries.map((entry) => {
              const mobileHide = entry.desktopOnly ? 'hidden sm:flex' : '';
              if (isGroup(entry)) {
                return (
                  <div
                    key={entry.label}
                    className={cn('relative', mobileHide)}
                    onMouseEnter={() => setDesktopCatalogueOpen(true)}
                    onMouseLeave={() => setDesktopCatalogueOpen(false)}
                  >
                    <button
                      type="button"
                      onClick={() => { setDesktopCatalogueOpen(false); navigate('/shop'); }}
                      className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors whitespace-nowrap cursor-pointer bg-transparent border-0 p-0"
                    >
                      {entry.label}
                      <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', desktopCatalogueOpen && 'rotate-180')} />
                    </button>
                    {desktopCatalogueOpen && (
                      <div className="absolute left-1/2 -translate-x-1/2 top-full pt-2 z-50">
                        <div className="bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-56">
                          {entry.children.map((c) => (
                            <Link
                              key={c.label}
                              to={c.href}
                              onClick={() => setDesktopCatalogueOpen(false)}
                              className="block px-4 py-2 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                            >
                              {c.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <Link
                  key={entry.label}
                  to={entry.href}
                  className={cn('text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors whitespace-nowrap', entry.desktopOnly && 'hidden sm:inline')}
                >
                  {entry.label}
                </Link>
              );
            })}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile/hamburger menu */}
      <div
        className={cn(
          'bg-white border-b border-gray-200 max-h-[80vh] overflow-y-auto',
          mobileOpen ? 'block' : 'hidden'
        )}
      >
        <div className="px-4 py-3 space-y-1">
          {subNavEntries.map((entry) => {
            if (isGroup(entry)) {
              return (
                <div key={entry.label}>
                  <button
                    type="button"
                    onClick={() => setMobileCatalogueOpen((v) => !v)}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-orange-600 hover:bg-gray-50 transition-colors"
                  >
                    <span>{entry.label}</span>
                    <ChevronDown className={cn('h-4 w-4 transition-transform', mobileCatalogueOpen && 'rotate-180')} />
                  </button>
                  {mobileCatalogueOpen && (
                    <div className="ml-3 pl-3 border-l border-gray-200 space-y-1 mt-1">
                      {entry.children.map((c) => (
                        <Link
                          key={c.label}
                          to={c.href}
                          className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:text-orange-600 hover:bg-gray-50 transition-colors"
                          onClick={() => setMobileOpen(false)}
                        >
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Link
                key={entry.label}
                to={entry.href}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-orange-600 hover:bg-gray-50 transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                {entry.label}
              </Link>
            );
          })}

          <a
            href="sms:+14706221392"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-orange-600 hover:bg-gray-50 transition-colors"
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
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-orange-600 hover:bg-gray-50 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="h-4 w-4" />
                  My Account
                </Link>
                <Link
                  to="/admin"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 transition-colors"
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
                className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 transition-colors"
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
