import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, type User } from '@/lib/api';
import { Flower } from '@/components/decorations/GardenDecorations';
import AIBudgetBadge from '@/components/AIBudgetBadge';

const NAV_ITEMS = [
  { to: '/app', label: 'Songs' },
  { to: '/app/journal', label: 'Journal' },
  { to: '/app/dictionary', label: 'Dictionary' },
  { to: '/app/poetry', label: 'Poetry' },
  { to: '/app/psalms', label: 'Psalms' },
  { to: '/app/bible', label: 'Bible' },
  { to: '/app/analyze', label: 'Analyze' },
];

export default function TopBar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Overflow detection: a hidden "sizer" nav stays in the DOM (absolute-positioned,
  // invisible, zero flex impact) so we can always measure the full inline nav's
  // required width against the container's available width.
  const navSlotRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useLayoutEffect(() => {
    const slot = navSlotRef.current;
    const sizer = sizerRef.current;
    if (!slot || !sizer) return;
    const check = () => {
      const needed = sizer.scrollWidth;
      const available = slot.clientWidth;
      // Small buffer avoids hysteresis at the boundary
      setCollapsed(needed > available - 8);
    };
    requestAnimationFrame(check);
    const ro = new ResizeObserver(check);
    ro.observe(slot);
    window.addEventListener('resize', check);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', check);
    };
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-nav-menu]')) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  async function logout() {
    await api.logout().catch(() => {});
    onLogout();
    navigate('/');
  }

  return (
    <header className="border-b border-meadow-200 bg-meadow-50/90 backdrop-blur-sm sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-5 flex-1 min-w-0">
          <Link to="/app" className="flex items-center gap-2 font-serif text-xl font-bold text-meadow-800 flex-shrink-0">
            <Flower size={22} petal="#f2c6c6" center="#f5c842" />
            Songwriter
          </Link>

          {/* Nav slot — measures its available width */}
          <div ref={navSlotRef} className="relative flex-1 min-w-0 flex items-center">
            {/* Invisible sizer — always rendered, positioned absolute so it has
                no layout impact, but we can measure its natural width. */}
            <div
              ref={sizerRef}
              aria-hidden="true"
              className="absolute left-0 top-0 opacity-0 pointer-events-none flex items-center gap-1 text-sm whitespace-nowrap"
              style={{ visibility: 'hidden' }}
            >
              {NAV_ITEMS.map((item) => (
                <span key={item.to} className="px-3 py-1.5">{item.label}</span>
              ))}
            </div>

            {collapsed ? (
              <div className="relative" data-nav-menu>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-meadow-700 hover:text-meadow-900 hover:bg-meadow-100 transition-colors"
                  aria-haspopup="true"
                  aria-expanded={menuOpen}
                  aria-label="Main menu"
                >
                  <HamburgerIcon />
                  <span className="text-sm font-medium">Menu</span>
                </button>
                {menuOpen && (
                  <div className="absolute left-0 top-full mt-2 w-56 bg-white border border-meadow-200 rounded-xl shadow-lg py-1 z-40">
                    {NAV_ITEMS.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={`block px-4 py-2 text-sm transition-colors ${
                          location.pathname === item.to
                            ? 'bg-meadow-100 text-meadow-900 font-medium'
                            : 'text-meadow-700 hover:bg-meadow-50 hover:text-meadow-900'
                        }`}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <nav className="flex items-center gap-1 text-sm">
                {NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    active={location.pathname === item.to}
                  />
                ))}
              </nav>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          <AIBudgetBadge />
          {user.avatar_url && (
            <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full border border-meadow-200" referrerPolicy="no-referrer" />
          )}
          <span className="text-sm text-meadow-700 hidden lg:inline">{user.name || user.email}</span>
          <button
            onClick={logout}
            className="text-xs text-meadow-500 hover:text-meadow-800 px-2 py-1"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
        active
          ? 'bg-meadow-200 text-meadow-900 font-medium'
          : 'text-meadow-700 hover:text-meadow-900 hover:bg-meadow-100'
      }`}
    >
      {label}
    </Link>
  );
}

function HamburgerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}
