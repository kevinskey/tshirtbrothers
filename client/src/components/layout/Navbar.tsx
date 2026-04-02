import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Search, User, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const subNavLinks = [
  { label: 'Design Studio', href: '/design' },
  { label: 'T-Shirts', href: '/shop' },
  { label: 'Hoodies', href: '/shop' },
  { label: 'Hats', href: '/shop' },
  { label: 'Polos', href: '/shop' },
  { label: 'All Products', href: '/shop' },
  { label: 'Get a Quote', href: '/quote' },
  { label: 'About Us', href: '/services' },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <nav className="sticky top-0 z-50">
      {/* Top thin announcement bar */}
      <div className="bg-gray-900 text-white text-xs text-center py-1.5 px-4">
        Custom T-Shirts &amp; Promotional Products, Fast &amp; Free Shipping
      </div>

      {/* Main nav row */}
      <div className="bg-white border-b border-gray-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 flex-shrink-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600">
                <span className="text-sm font-bold text-white">TSB</span>
              </div>
              <span
                className="text-lg font-bold text-gray-900 hidden sm:inline"
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
                  placeholder="Search for t-shirts, hoodies, hats, and more"
                  className="w-full rounded-full border border-gray-300 bg-gray-50 pl-5 pr-12 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 bg-red-600 hover:bg-red-700 text-white rounded-full p-2 transition-colors"
                  aria-label="Search"
                >
                  <Search className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-4 flex-shrink-0 ml-auto md:ml-0">
              <a
                href="tel:4706224845"
                className="hidden lg:flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-red-600 transition-colors"
              >
                <Phone className="h-4 w-4" />
                (470) 622-4845
              </a>
              <Link
                to="/auth"
                className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-red-600 transition-colors"
              >
                <User className="h-4 w-4" />
                <span className="hidden sm:inline">Sign In</span>
              </Link>

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
          <div className="flex items-center gap-6 overflow-x-auto">
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
          'md:hidden bg-white border-b border-gray-200',
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
              placeholder="Search for t-shirts, hoodies, hats, and more"
              className="w-full rounded-full border border-gray-300 bg-gray-50 pl-5 pr-12 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
            <button
              type="button"
              className="absolute right-1 top-1/2 -translate-y-1/2 bg-red-600 hover:bg-red-700 text-white rounded-full p-2 transition-colors"
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
            href="tel:4706224845"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:text-red-600 hover:bg-gray-50 transition-colors lg:hidden"
          >
            <Phone className="h-4 w-4" />
            (470) 622-4845
          </a>
        </div>
      </div>
    </nav>
  );
}
