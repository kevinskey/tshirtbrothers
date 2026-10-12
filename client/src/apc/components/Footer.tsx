import { Link } from 'react-router-dom';
import { useApcPath } from '../lib/base';
import { NAV_CATEGORIES } from './Header';

export default function Footer() {
  const p = useApcPath();
  return (
    <footer className="bg-apc-ink text-white mt-16">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="font-display font-bold text-xl">All Print Club</div>
          <p className="mt-3 text-sm text-white/70">
            Trade-quality commercial printing at club prices — cards, flyers,
            signs, stickers and more, shipped nationwide.
          </p>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-white/60">Shop</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to={p('/shop')} className="hover:text-apc-accent">All Products</Link></li>
            {NAV_CATEGORIES.map((c) => (
              <li key={c.label}>
                <Link to={`${p('/shop')}?category=${encodeURIComponent(c.category)}`} className="hover:text-apc-accent">
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-white/60">Help</div>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link to={p('/account')} className="hover:text-apc-accent">My Orders</Link></li>
            <li><a href="https://tshirtbrothers.com/quote" className="hover:text-apc-accent">Custom Quote</a></li>
            <li><a href="mailto:info@tshirtbrothers.com" className="hover:text-apc-accent">info@tshirtbrothers.com</a></li>
            <li><a href="tel:+14706221392" className="hover:text-apc-accent">(470) 622-1392</a></li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-white/60">Visit</div>
          <p className="mt-3 text-sm text-white/70">
            6010 Renaissance Parkway<br />
            Fairburn, GA 30213<br />
            Free local pickup available.
          </p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">
        © {new Date().getFullYear()} All Print Club · A sister company of{' '}
        <a href="https://tshirtbrothers.com" className="underline hover:text-apc-accent">T-Shirt Brothers</a>
      </div>
    </footer>
  );
}
