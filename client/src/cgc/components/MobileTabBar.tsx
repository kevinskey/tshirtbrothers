// App-like bottom tab bar — the primary navigation on phones. Desktop
// (lg+) hides it and uses the Header's horizontal nav instead. Five
// thumb-reachable destinations with the live bag/favorites counts, an
// active-route highlight, and a safe-area inset so it clears the iOS
// home indicator.
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, Search, Heart, ShoppingBag } from 'lucide-react';
import { useCgcPath, useCgcBase } from '../lib/base';
import { useCgcCart } from '../lib/cart';
import { useCgcFavorites } from '../lib/favorites';

export default function MobileTabBar() {
  const p = useCgcPath();
  const base = useCgcBase();
  const { pathname } = useLocation();
  const { count } = useCgcCart();
  const { favorites } = useCgcFavorites();

  const homePath = p('/');
  const tabs = [
    { to: homePath, label: 'Home', icon: Home, match: (x: string) => x === homePath || x === `${base}` || x === '/' },
    { to: p('/shop'), label: 'Shop', icon: LayoutGrid, match: (x: string) => x.startsWith(p('/shop')) || x.startsWith(p('/product')) },
    { to: `${p('/shop')}?focus=search`, label: 'Search', icon: Search, match: () => false },
    { to: p('/favorites'), label: 'Saved', icon: Heart, badge: favorites.length, match: (x: string) => x.startsWith(p('/favorites')) },
    { to: p('/cart'), label: 'Bag', icon: ShoppingBag, badge: count, match: (x: string) => x.startsWith(p('/cart')) },
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-cgc-cream-deep bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {tabs.map((t) => {
          const active = t.match(pathname);
          const Icon = t.icon;
          return (
            <li key={t.label}>
              <Link
                to={t.to}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold ${
                  active ? 'text-cgc-orange' : 'text-cgc-charcoal'
                }`}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.8} />
                  {!!t.badge && t.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-cgc-orange text-white text-[10px] font-bold flex items-center justify-center">
                      {t.badge > 99 ? '99+' : t.badge}
                    </span>
                  )}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
