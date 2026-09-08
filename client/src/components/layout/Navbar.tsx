import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, User, Menu, X, MessageCircle, LogOut, ChevronDown, Heart, ShoppingCart } from 'lucide-react';
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

const catalogueLinksEs: NavLink[] = [
  { label: 'Camisetas', href: '/shop?category=T-Shirts' },
  { label: 'Sudaderas y Polar', href: '/shop?category=Fleece' },
  { label: 'Gorras', href: '/shop?category=Headwear' },
  { label: 'Polos', href: '/shop?category=Polos' },
  { label: 'Chaquetas', href: '/shop?category=Outerwear' },
  { label: 'Accesorios', href: '/shop?category=Accessories' },
  { label: 'Todos los Productos', href: '/shop' },
];

// desktopOnly entries are hidden from the sub-nav pill on mobile (they
// still appear in the hamburger menu). Keeps the mobile pill to just the
// three high-intent CTAs — Design Studio, Catalogue, Get a Quote — so it
// stays one screen-width without horizontal scrolling.
const subNavEntries: NavEntry[] = [
  { label: 'Design Studio', href: '/design' },
  { label: 'Catalogue', children: catalogueLinks },
  { label: 'Get a Quote', href: '/quote' },
  { label: 'DTF Transfers', href: '/dtf' },
  { label: 'Compare Shirt Tiers', href: '/compare' },
  { label: 'Webstores for Organizations', href: '/webstores' },
  { label: 'Services', href: '/services', desktopOnly: true },
  { label: 'About', href: '/about', desktopOnly: true },
];

const subNavEntriesEs: NavEntry[] = [
  { label: 'Estudio de Diseño', href: '/design' },
  { label: 'Catálogo', children: catalogueLinksEs },
  { label: 'Obtener Cotización', href: '/es/cotizacion' },
  { label: 'Transferencias DTF', href: '/dtf' },
  { label: 'Compara Camisetas', href: '/compare' },
  { label: 'Tiendas para Organizaciones', href: '/webstores' },
  { label: 'Servicios', href: '/services', desktopOnly: true },
  { label: 'Nosotros', href: '/about', desktopOnly: true },
];

// User-visible chrome strings per language (menu labels live in the
// entry arrays above).
const NAV_T = {
  en: {
    promoShort: '15% Off Gildan Tees & Hoodies.', promoLong: '15% Off All Gildan Tees & Hoodies — Prices as Marked.',
    shopSale: 'Shop Sale', search: 'Search for t-shirts, hoodies, hats, and more',
    account: 'Account', signIn: 'Sign In', textUs: 'Text (470) 622-1392',
    myAccount: 'My Account', admin: 'Admin Dashboard', logOut: 'Log Out',
    signInCreate: 'Sign In / Create Account',
  },
  es: {
    promoShort: '15% de descuento en Gildan.', promoLong: '15% de descuento en camisetas y sudaderas Gildan — precios ya marcados.',
    shopSale: 'Ver Ofertas', search: 'Busca camisetas, sudaderas, gorras y más',
    account: 'Cuenta', signIn: 'Iniciar Sesión', textUs: 'Envía un texto al (470) 622-1392',
    myAccount: 'Mi Cuenta', admin: 'Panel de Administración', logOut: 'Cerrar Sesión',
    signInCreate: 'Iniciar Sesión / Crear Cuenta',
  },
} as const;

export default function Navbar({ lang = 'en' }: { lang?: 'en' | 'es' }) {
  const t = NAV_T[lang];
  const entries = lang === 'es' ? subNavEntriesEs : subNavEntries;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileCatalogueOpen, setMobileCatalogueOpen] = useState(false);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileOpen(false);
    }
  };

  const isLoggedIn = !!localStorage.getItem('tsb_token');

  return (
    // overflow-x-hidden used to guard the (removed) scrollable sub-nav
    // pill; it must stay off now so the sm+ hamburger dropdown — an
    // absolutely positioned card below this sticky nav — isn't clipped.
    <nav className="sticky top-0 z-50 bg-white">
      {/* Top promo strip — same shape as the Custom Ink black banner. */}
      {/* nowrap clipped the "Shop Sale" CTA on phones — wrap on mobile,
          shorter copy under sm, single line from sm up. */}
      <Link
        to="/sale"
        className="block bg-gray-900 text-white text-center text-xs sm:text-sm py-1.5 sm:py-0.5 px-3 sm:px-4 sm:whitespace-nowrap hover:bg-gray-800 transition-colors"
      >
        <span className="sm:hidden">{t.promoShort}<sup>*</sup></span>
        <span className="hidden sm:inline">{t.promoLong}<sup>*</sup></span>{' '}
        <span className="font-bold underline">{t.shopSale}</span>
      </Link>

      {/* Main header row — Custom Ink-style: hamburger + logo on left,
          heart / account / phone on the right. The big rounded search
          field lives in its own row below, full-width at every viewport. */}
      <div className="bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-1.5">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <img
                src="https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png"
                alt="TShirt Brothers"
                className="h-11 w-11 sm:h-14 sm:w-14 object-contain"
              />
              <span
                className="text-[15px] sm:text-xl text-orange-700 leading-[0.95] tracking-tight"
                style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 900 }}
              >
                <span className="block sm:inline">TSHIRT</span>{' '}
                <span className="block sm:inline">BROTHERS</span>
              </span>
            </Link>

            {/* Right side actions — phone contact lives in the hamburger
                menu's "Text us" entry, not the header. */}
            <div className="flex items-center gap-1 sm:gap-3 ml-auto flex-shrink-0">
              {/* Favorites (heart) */}
              <Link
                to={isLoggedIn ? '/favorites' : '/auth'}
                aria-label="Favorites"
                className="inline-flex items-center justify-center p-2 rounded-lg text-gray-700 hover:text-orange-600 hover:bg-gray-100 transition-colors"
              >
                <Heart className="h-6 w-6 sm:h-5 sm:w-5" />
              </Link>

              {/* Account / Sign In (avatar + label) */}
              {isLoggedIn ? (
                <Link to="/account" className="flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-orange-600 hover:bg-gray-100 transition-colors">
                  <User className="h-6 w-6 sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">{t.account}</span>
                </Link>
              ) : (
                <Link to="/auth" className="flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm font-medium text-gray-700 hover:text-orange-600 hover:bg-gray-100 transition-colors">
                  <User className="h-6 w-6 sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">{t.signIn}</span>
                </Link>
              )}

              {/* Cart — links to quote builder since TSB orders go through quotes */}
              <Link
                to="/quote"
                aria-label="Quote builder"
                className="inline-flex items-center justify-center p-2 rounded-lg text-gray-700 hover:text-orange-600 hover:bg-gray-100 transition-colors"
              >
                <ShoppingCart className="h-6 w-6 sm:h-5 sm:w-5" />
              </Link>

              {/* Hamburger — far right of the header (all breakpoints) */}
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-lg p-2 -mr-2 sm:mr-0 text-gray-700 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="h-7 w-7 sm:h-6 sm:w-6" /> : <Menu className="h-7 w-7 sm:h-6 sm:w-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Custom Ink-style pill search — its own row, full-width, all sizes.
            Border-b below mirrors the thin divider Custom Ink uses to
            separate the header block from page content. */}
        <div className="mx-auto max-w-7xl sm:px-6 lg:px-8 pb-3 sm:pb-4 sm:border-b border-gray-200/80">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t.search}
              className="w-full rounded-full bg-gray-100 pl-11 pr-4 py-1.5 text-base text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white border border-transparent focus:border-orange-300"
              style={{ fontSize: '16px' }}
            />
          </div>
        </div>
      </div>

      {/* Hamburger menu. Mobile: full-width in-flow block (normal pattern).
          sm+: a compact card anchored under the hamburger's side of the
          header — desktop never gets a full-width dropdown. */}
      <div
        className={cn(
          'bg-white border-b border-gray-200 max-h-[80vh] overflow-y-auto',
          'sm:absolute sm:right-4 sm:top-full sm:w-80 sm:rounded-2xl sm:border sm:border-gray-200 sm:shadow-2xl sm:max-h-[70vh]',
          mobileOpen ? 'block' : 'hidden'
        )}
      >
        <div className="px-4 py-3 space-y-1">
          {entries.map((entry) => {
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
            {t.textUs}
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
                  {t.myAccount}
                </Link>
                <Link
                  to="/admin"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 transition-colors"
                  onClick={() => setMobileOpen(false)}
                >
                  <User className="h-4 w-4" />
                  {t.admin}
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
                  {t.logOut}
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-orange-600 hover:bg-orange-50 transition-colors"
                onClick={() => setMobileOpen(false)}
              >
                <User className="h-4 w-4" />
                {t.signInCreate}
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
