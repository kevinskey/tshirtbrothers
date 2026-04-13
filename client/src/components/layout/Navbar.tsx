import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Phone, Search, User, Menu, X, MessageCircle, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const subNavLinks = [
  { label: 'Design Studio', href: '/design' },
  { label: 'T-Shirts', href: '/shop?category=T-Shirts' },
  { label: 'Hoodies & Fleece', href: '/shop?category=Fleece' },
  { label: 'Hats', href: '/shop?category=Headwear' },
  { label: 'Polos', href: '/shop?category=Polos' },
  { label: 'Outerwear', href: '/shop?category=Outerwear' },
  { label: 'Accessories', href: '/shop?category=Accessories' },
  { label: 'All Products', href: '/shop' },
  { label: 'Get a Quote', href: '/quote' },
  { label: 'Services', href: '/services' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [phoneMenu, setPhoneMenu] = useState(false);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setMobileOpen(false);
    }
  };

  return (
    <nav className="sticky top-0 z-50 overflow-x-hidden">
      {/* Top thin announcement bar */}
      <div className="bg-gray-900 text-white text-xs text-center py-1.5 px-4">
        Custom T-Shirts &amp; Promotional Products, Fast &amp; Free Shipping
      </div>

      {/* Main nav row */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 flex-shrink-0">
              <img
                src="https://tshirtbrothers.atl1.digitaloceanspaces.com/tsb-logo.png"
                alt="TShirt Brothers"
                className="h-10 w-10 object-contain"
              />
              <span
                className="text-sm sm:text-lg font-bold text-gray-900"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                TShirt Brothers
              </span>
            </Link>

            {/* Center: Search bar (hidden on mobile) */}
            <div className="hidden md:flex flex-1 max-w-2xl mx-4">
              <div className="relative w-full">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Search for t-shirts, hoodies, hats, and more"
                  className="w-full rounded-full border-2 border-gray-300 bg-white pl-5 pr-12 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 shadow-sm"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  className="absolute right-1 top-1/2 -translate-y-1/2 bg-gray-900 hover:bg-gray-800 text-white rounded-full p-2 transition-colors"
                  aria-label="Search"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3 flex-shrink-0 ml-auto md:ml-0">
              {/* Phone - desktop only */}
              <div className="relative hidden md:block">
                <button type="button" onClick={() => setPhoneMenu(p => !p)} className="flex items-center gap-1.5 text-sm sm:text-base font-bold text-orange-600 hover:text-orange-700 transition-colors">
                  <Phone className="h-4 w-4" />
                  (470) 622-4845
                </button>
                {phoneMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPhoneMenu(false)} />
                    <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-48 z-50">
                      <a href="tel:+14706224845" onClick={() => setPhoneMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition"><Phone className="h-4 w-4" />Call Us</a>
                      <a href="sms:+14706224845" onClick={() => setPhoneMenu(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-orange-50 hover:text-orange-600 transition"><MessageCircle className="h-4 w-4" />Text Us</a>
                    </div>
                  </>
                )}
              </div>

              {/* Admin + Logout - desktop only when logged in */}
              {localStorage.getItem('tsb_token') ? (
                <div className="hidden md:flex items-center gap-3">
                  <Link to="/admin" className="flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700 transition-colors">
                    <User className="h-4 w-4" />Admin
                  </Link>
                  <button onClick={() => { localStorage.removeItem('tsb_token'); window.location.href = '/'; }} className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-red-600 transition-colors">
                    <LogOut className="h-4 w-4" />Log Out
                  </button>
                </div>
              ) : (
                <Link to="/auth" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-red-600 transition-colors">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign In</span>
                </Link>
              )}

              {/* Mobile hamburger */}
              <button
                type="button"
                className="md:hidden inline-flex items-center justify-center rounded-lg p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle menu"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-nav row (desktop) */}
      <div className="bg-white border-b border-gray-200 hidden md:block">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none">
            {subNavLinks.map((link) => (
              <Link
                key={link.label}
                to={link.href}
                className="text-sm font-medium text-gray-600 hover:text-red-600 transition-colors whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={cn(
          'md:hidden bg-white border-b border-gray-200 max-h-[80vh] overflow-y-auto',
          mobileOpen ? 'block' : 'hidden'
        )}
      >
        {/* Mobile search */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative w-full">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for t-shirts, hoodies, hats, and more"
              className="w-full rounded-full border-2 border-gray-300 bg-white pl-5 pr-12 py-2.5 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 shadow-sm"
            />
            <button
              type="button"
              onClick={handleSearch}
              className="absolute right-1 top-1/2 -translate-y-1/2 bg-gray-900 hover:bg-gray-800 text-white rounded-full p-2 transition-colors"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Mobile nav links */}
        <div className="px-4 py-3 space-y-1">
          {subNavLinks.map((link) => (
            <Link
              key={link.label}
              to={link.href}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-gray-50 transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}

          <a
            href="sms:+14706224845"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-gray-50 transition-colors"
            onClick={() => setMobileOpen(false)}
          >
            <MessageCircle className="h-4 w-4" />
            Text (470) 622-4845
          </a>

          {/* Account section */}
          <div className="border-t border-gray-200 mt-2 pt-2">
            {localStorage.getItem('tsb_token') ? (
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
