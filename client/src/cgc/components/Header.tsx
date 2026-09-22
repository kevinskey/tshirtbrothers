import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronDown, Heart, Menu, Search, ShoppingBag, User, X,
} from 'lucide-react';
import Logo from './Logo';
import { useCgcPath } from '../lib/base';
import { useCgcCart } from '../lib/cart';

export const NAV_CATEGORIES = [
  { label: 'Personalized Gifts', category: 'Personalized Gifts' },
  { label: 'Drinkware', category: 'Drinkware' },
  { label: 'Awards & Trophies', category: 'Awards & Trophies' },
];

export const OCCASION_LINKS = [
  { key: 'birthday', label: 'Birthday' },
  { key: 'wedding', label: 'Wedding & Anniversary' },
  { key: 'graduation', label: 'Graduation' },
  { key: 'retirement', label: 'Retirement' },
  { key: 'recognition', label: 'Awards & Recognition' },
  { key: 'holiday', label: 'Holiday' },
  { key: 'housewarming', label: 'Housewarming' },
  { key: 'sports', label: 'Sports & Fan Gifts' },
];

export default function Header() {
  const p = useCgcPath();
  const navigate = useNavigate();
  const { count } = useCgcCart();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [occasionsOpen, setOccasionsOpen] = useState(false);
  const occasionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (occasionsRef.current && !occasionsRef.current.contains(e.target as Node)) {
        setOccasionsOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

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

  const iconLink = 'p-2 rounded-full text-cgc-ink hover:bg-cgc-cream transition-colors';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-cgc-cream-deep">
      {/* Top strip */}
      <div className="bg-cgc-ink text-cgc-cream text-center text-xs sm:text-sm py-1.5 px-4">
        Made personal. Given with meaning.
      </div>

      {/* Main header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6 py-3">
          <button
            type="button"
            className="lg:hidden p-2 -ml-2 text-cgc-ink"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>

          <Logo />

          {/* Desktop search */}
          <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-2xl mx-auto" role="search">
            <label htmlFor="cgc-search" className="sr-only">Search products</label>
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-cgc-stone" aria-hidden />
              <input
                id="cgc-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search gifts, awards, drinkware & more"
                className="w-full rounded-full border border-cgc-cream-deep bg-white pl-11 pr-4 py-2.5 text-sm text-cgc-ink placeholder:text-cgc-stone shadow-sm focus:outline-none focus:ring-2 focus:ring-cgc-orange"
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
              <User className="h-5 w-5" />
            </Link>
            <Link to={p('/favorites')} className={`${iconLink} hidden sm:inline-flex`} aria-label="Favorites">
              <Heart className="h-5 w-5" />
            </Link>
            <Link to={p('/cart')} className={`${iconLink} relative`} aria-label={`Shopping bag, ${count} items`}>
              <ShoppingBag className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-cgc-orange text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile search */}
        {mobileSearchOpen && (
          <form onSubmit={submitSearch} className="md:hidden pb-3" role="search">
            <label htmlFor="cgc-search-m" className="sr-only">Search products</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-cgc-stone" aria-hidden />
              <input
                id="cgc-search-m"
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search gifts, awards, drinkware & more"
                className="w-full rounded-full border border-cgc-cream-deep bg-white pl-11 pr-4 py-2.5 text-base text-cgc-ink placeholder:text-cgc-stone focus:outline-none focus:ring-2 focus:ring-cgc-orange"
              />
            </div>
          </form>
        )}

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center justify-center gap-8 pb-3 text-sm font-semibold text-cgc-ink" aria-label="Primary">
          <Link to={shopHref()} className="hover:text-cgc-orange transition-colors">Shop All</Link>
          {NAV_CATEGORIES.map((c) => (
            <Link key={c.label} to={shopHref(c.category)} className="hover:text-cgc-orange transition-colors">
              {c.label}
            </Link>
          ))}
          <div className="relative" ref={occasionsRef}>
            <button
              type="button"
              className="flex items-center gap-1 hover:text-cgc-orange transition-colors"
              aria-expanded={occasionsOpen}
              onClick={() => setOccasionsOpen((v) => !v)}
            >
              Shop by Occasion <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
            {occasionsOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-60 rounded-xl border border-cgc-cream-deep bg-white shadow-lg py-2">
                {OCCASION_LINKS.map((o) => (
                  <Link
                    key={o.key}
                    to={`${p('/shop')}?occasion=${o.key}`}
                    onClick={() => setOccasionsOpen(false)}
                    className="block px-4 py-2 text-sm font-medium text-cgc-charcoal hover:bg-cgc-cream hover:text-cgc-orange"
                  >
                    {o.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <Link to={p('/business')} className="hover:text-cgc-orange transition-colors">Business & Bulk</Link>
          <Link to={shopHref('Blanks & Supplies')} className="hover:text-cgc-orange transition-colors">Blanks & Supplies</Link>
        </nav>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="lg:hidden border-t border-cgc-cream-deep bg-white px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto" aria-label="Primary">
          {[
            { label: 'Shop All', to: shopHref() },
            ...NAV_CATEGORIES.map((c) => ({ label: c.label, to: shopHref(c.category) })),
          ].map((l) => (
            <Link key={l.label} to={l.to} onClick={() => setMenuOpen(false)}
              className="block py-2.5 px-2 rounded-lg font-semibold text-cgc-ink hover:bg-cgc-cream">
              {l.label}
            </Link>
          ))}
          <div className="py-1 px-2">
            <div className="text-xs font-bold uppercase tracking-wide text-cgc-stone py-1">Shop by Occasion</div>
            {OCCASION_LINKS.map((o) => (
              <Link key={o.key} to={`${p('/shop')}?occasion=${o.key}`} onClick={() => setMenuOpen(false)}
                className="block py-2 px-2 rounded-lg text-cgc-charcoal hover:bg-cgc-cream">
                {o.label}
              </Link>
            ))}
          </div>
          <Link to={p('/business')} onClick={() => setMenuOpen(false)}
            className="block py-2.5 px-2 rounded-lg font-semibold text-cgc-ink hover:bg-cgc-cream">
            Business & Bulk
          </Link>
          <Link to={shopHref('Blanks & Supplies')} onClick={() => setMenuOpen(false)}
            className="block py-2.5 px-2 rounded-lg font-semibold text-cgc-ink hover:bg-cgc-cream">
            Blanks & Supplies
          </Link>
          <div className="flex gap-2 border-t border-cgc-cream-deep pt-3 mt-2">
            <Link to={p('/account')} onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 py-2 px-3 rounded-lg font-semibold text-cgc-ink hover:bg-cgc-cream">
              <User className="h-4 w-4" aria-hidden /> Account
            </Link>
            <Link to={p('/favorites')} onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 py-2 px-3 rounded-lg font-semibold text-cgc-ink hover:bg-cgc-cream">
              <Heart className="h-4 w-4" aria-hidden /> Favorites
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
