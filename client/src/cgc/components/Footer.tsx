import { Link } from 'react-router-dom';
import Logo from './Logo';
import { useCgcPath } from '../lib/base';
import { NAV_CATEGORIES } from './Header';

export default function Footer() {
  const p = useCgcPath();
  const shopHref = (category?: string) =>
    category ? `${p('/shop')}?category=${encodeURIComponent(category)}` : p('/shop');

  return (
    <footer className="bg-cgc-cream border-t border-cgc-cream-deep mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2 md:col-span-1">
          <Logo compact />
          <p className="mt-3 text-sm text-cgc-stone max-w-xs">
            Turn names, memories, and milestones into gifts worth keeping.
          </p>
        </div>
        <nav aria-label="Shop">
          <h3 className="text-sm font-bold uppercase tracking-wide text-cgc-ink mb-3">Shop</h3>
          <ul className="space-y-2 text-sm text-cgc-charcoal">
            <li><Link to={shopHref()} className="hover:text-cgc-orange">Shop All</Link></li>
            {NAV_CATEGORIES.map((c) => (
              <li key={c.label}>
                <Link to={shopHref(c.category)} className="hover:text-cgc-orange">{c.label}</Link>
              </li>
            ))}
            <li><Link to={shopHref('Blanks & Supplies')} className="hover:text-cgc-orange">Blanks & Supplies</Link></li>
          </ul>
        </nav>
        <nav aria-label="Customer service">
          <h3 className="text-sm font-bold uppercase tracking-wide text-cgc-ink mb-3">Customer Service</h3>
          <ul className="space-y-2 text-sm text-cgc-charcoal">
            <li><Link to={p('/account')} className="hover:text-cgc-orange">My Account & Orders</Link></li>
            <li><Link to={p('/favorites')} className="hover:text-cgc-orange">Favorites</Link></li>
            <li><Link to={p('/cart')} className="hover:text-cgc-orange">Shopping Bag</Link></li>
            <li><a href="mailto:info@tshirtbrothers.com" className="hover:text-cgc-orange">info@tshirtbrothers.com</a></li>
            <li><a href="tel:+14706221392" className="hover:text-cgc-orange">(470) 622-1392</a></li>
          </ul>
        </nav>
        <nav aria-label="Business orders">
          <h3 className="text-sm font-bold uppercase tracking-wide text-cgc-ink mb-3">Business Orders</h3>
          <ul className="space-y-2 text-sm text-cgc-charcoal">
            <li><Link to={p('/business')} className="hover:text-cgc-orange">Business Gifting</Link></li>
            <li><Link to={p('/business')} className="hover:text-cgc-orange">Bulk & Team Orders</Link></li>
            <li>
              <span className="text-cgc-stone">6010 Renaissance Pkwy<br />Fairburn, GA 30213</span>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-cgc-cream-deep">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-cgc-stone">
          <span>© {new Date().getFullYear()} Custom Gift Club</span>
          <a
            href="https://tshirtbrothers.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-cgc-orange"
          >
            A sister company of T-Shirt Brothers
          </a>
        </div>
      </div>
    </footer>
  );
}
