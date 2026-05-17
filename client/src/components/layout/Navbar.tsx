import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Search, User, Menu, X, MessageCircle, LogOut, ChevronDown, Heart, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

type NavLink = { label: string; href: string };
type NavEntry = NavLink | { label: string; children: NavLink[] };
const isGroup = (e: NavEntry): e is { label: string; children: NavLink[] } => 'children' in e;

const catalogueLinks: NavLink[] = [
  { label: 'T-Shirts', href: '/shop?category=T-Shirts' },
  { label: 'Hoodies & Fleece', href: '/shop?category=Fleece' },
  { label: 'Hats', href: '/shop?category=Headwear' },
  { label: 'Polos', href: '/shop?category=Polos' },
  { label: 'Outerwear', href: '/shop?category=Outerwear' },
  { label: 'Accessories', href: '/shop?category=Accessories' },
  { label: 'All Products', href: '/shop' },
];

const subNavEntries: NavEntry[] = [
  { label: 'Design Studio', href: '/design' },
  { label: 'Catalogue', children: catalogueLinks },
  { label: 'Get a Quote', href: '/quote' },
  { label: 'Services', href: '/services' },
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
                src="https://tshirtbrothers.atl1.digitaloceanspaces.com/tsb-logo.png"
                alt="TShirt Brothers"
                className="h-12 w-12 sm:h-14 sm:w-14 object-contain"
              />
              <span
                className="text-base sm:text-xl text-orange-500 leading-[0.95] tracking-tight"
                style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
              >
                <span className="block sm:inline">TSHIRT</span>{' '}
                <span className="block sm:inline">BROTHERS</span>
              </span>
            </Link>

            {/* Right side actions */}
            <div className="flex items-center gap-1 sm:gap-3 ml-auto flex-shrink-0">
              {/* Phone — desktop only */}
              <div className="relative hidden md:block" ref={phoneBtnRef}>
                <button type="button" onClick={() => setPhoneMenu(p => !p)} className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 hover:text-orange-600 transition-colors px-2 py-2">
                  <Phone className="h-4 w-4" />
                  <span className="hidden lg:inline">(470) 622-4845</span>
                </button>
                {phoneMenu && (() => {
                  const r = phoneBtnRef.current?.getBoundingClientRect();
                  const top = r ? r.bottom + 8 : 64;
                  const right = r ? window.innerWidth - r.right : 16;
                  return createPortal(
                    <>
                      <div className="fixed inset-0 z-[9998]" onClick={() => setPhoneMenu(false)} />
                      <div className="fixed bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-48 z-[9999]" style={{ top, right }}>
                        <a href="tel:+14706224845" onClick={() => setPhoneMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition"><Phone className="h-4 w-4" />Call Us</a>
                        <a href="sms:+14706224845" onClick={() => setPhoneMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition"><MessageCircle className="h-4 w-4" />Text Us</a>
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
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-4 border-b border-gray-200/80">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
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

      {/* Sub-nav row (desktop) */}
      <div className="bg-white border-t border-b border-gray-200 hidden md:block">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-center gap-4 sm:gap-6 overflow-visible">
            {subNavEntries.map((entry) => {
              if (isGroup(entry)) {
                return (
                  <div
                    key={entry.label}
                    className="relative"
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
                  className="text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors whitespace-nowrap"
                >
                  {entry.label}
                </Link>
              );
            })}
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
            href="sms:+14706224845"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-orange-600 hover:bg-gray-50 transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            <MessageCircle className="h-4 w-4" />
            Text (470) 622-4845
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
