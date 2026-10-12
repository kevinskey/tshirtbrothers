import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Menu, Search, ShoppingCart, User, X } from 'lucide-react';
import Logo from './Logo';
import { useApcPath } from '../lib/base';
import { useApcCart } from '../lib/cart';

export const NAV_CATEGORIES = [
  { label: 'Business Cards', category: 'Business Cards' },
  { label: 'Flyers & Brochures', category: 'Flyers & Brochures' },
  { label: 'Postcards', category: 'Postcards' },
  { label: 'Signs & Banners', category: 'Signs & Banners' },
  { label: 'Stickers & Labels', category: 'Stickers & Labels' },
];

export default function Header() {
  const p = useApcPath();
  const navigate = useNavigate();
  const { count } = useApcCart();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setMenuOpen(false);
    setMobileSearchOpen(false);
    navigate(`${p('/shop')}?search=${encodeURIComponent(q)}`);
  };

  const shopHref = (category?: string) =>
    category ? `${p('/shop')}?category=${encodeURIComponent(category)}` : p('/shop');

  const iconLink = 'p-2 lg:p-2.5 rounded-full text-apc-ink hover:bg-apc-paper transition-colors';
  const iconSize = 'h-5 w-5 lg:h-6 lg:w-6';
  const navLink = 'px-4 py-2.5 rounded-full hover:bg-apc-paper hover:text-apc-blue transition-colors';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-apc-paper-deep">
      {/* Top strip */}
      <div className="bg-apc-ink text-white text-center text-xs sm:text-sm py-1.5 px-4">
        Trade-quality printing, club prices. Free local pickup in Fairburn, GA.
      </div>

      {/* Main header */}
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-3 sm:gap-6 lg:gap-10 py-3 lg:py-5">
          <button
            type="button"
            className="lg:hidden p-2 -ml-2 text-apc-ink"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          <Logo />

          {/* Desktop search */}
          <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-3xl mx-auto" role="search">
            <label htmlFor="apc-search" className="sr-only">Search products</label>
            <div className="relative w-full">
              <Search className="absolute left-4 lg:left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-apc-slate" aria-hidden />
              <input
                id="apc-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search business cards, flyers, banners & more"
                className="w-full rounded-full border border-apc-paper-deep bg-apc-paper/60 pl-11 lg:pl-12 pr-4 py-2.5 lg:py-3.5 text-sm lg:text-base text-apc-ink placeholder:text-apc-slate shadow-sm transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-apc-blue"
              />
            </div>
          </form>

          <div className="flex items-center gap-1 sm:gap-2 ml-auto">
            <button
              type="button"
              className={`${iconLink} md:hidden`}
              aria-label="Open search"
              onClick={() => setMobileSearchOpen((v) => !v)}
            >
              <Search className="h-5 w-5" />
            </button>
            <Link to={p('/account')} className={`${iconLink} hidden sm:inline-flex`} aria-label="Account">
              <User className={iconSize} />
            </Link>
            <Link to={p('/cart')} className={`${iconLink} relative`} aria-label={`Cart, ${count} items`}>
              <ShoppingCart className={iconSize} />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-apc-blue text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile search */}
        {mobileSearchOpen && (
          <form onSubmit={submitSearch} className="md:hidden pb-3" role="search">
            <label htmlFor="apc-search-m" className="sr-only">Search products</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-apc-slate" aria-hidden />
              <input
                id="apc-search-m"
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search print products"
                className="w-full rounded-full border border-apc-paper-deep bg-white pl-11 pr-4 py-2.5 text-base text-apc-ink placeholder:text-apc-slate focus:outline-none focus:ring-2 focus:ring-apc-blue"
              />
            </div>
          </form>
        )}
      </div>

      {/* Desktop nav */}
      <nav className="hidden lg:block border-t border-apc-paper-deep" aria-label="Primary">
        <div className="max-w-screen-2xl mx-auto px-10 flex items-center justify-center gap-1 py-1.5 text-[15px] font-semibold text-apc-ink">
          <Link to={shopHref()} className={navLink}>Shop All</Link>
          {NAV_CATEGORIES.map((c) => (
            <Link key={c.label} to={shopHref(c.category)} className={navLink}>
              {c.label}
            </Link>
          ))}
          {/* Custom jobs (apparel, embroidery, anything not in the catalog)
              route to the TSB quote wizard — absolute, cross-brand. */}
          <a href="https://tshirtbrothers.com/quote" className={navLink}>Custom Quote</a>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="lg:hidden border-t border-apc-paper-deep bg-white px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto" aria-label="Primary">
          {[
            { label: 'Shop All', to: shopHref() },
            ...NAV_CATEGORIES.map((c) => ({ label: c.label, to: shopHref(c.category) })),
          ].map((l) => (
            <Link key={l.label} to={l.to} onClick={() => setMenuOpen(false)}
              className="block py-2.5 px-2 rounded-lg font-semibold text-apc-ink hover:bg-apc-paper">
              {l.label}
            </Link>
          ))}
          <a href="https://tshirtbrothers.com/quote"
            className="block py-2.5 px-2 rounded-lg font-semibold text-apc-ink hover:bg-apc-paper">
            Custom Quote
          </a>
          <div className="flex gap-2 border-t border-apc-paper-deep pt-3 mt-2">
            <Link to={p('/account')} onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 py-2 px-3 rounded-lg font-semibold text-apc-ink hover:bg-apc-paper">
              <User className="h-4 w-4" aria-hidden /> Account
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
