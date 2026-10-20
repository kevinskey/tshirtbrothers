import { Link } from 'react-router-dom';
import { useLhtPath } from '../lib/base';

export default function Footer() {
  const p = useLhtPath();
  return (
    <footer className="bg-black text-lht-cream/80 border-t border-lht-cream/10">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-10 py-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="font-lht-display uppercase tracking-[0.08em] text-lht-cream text-lg">Live Hard Truth</div>
          <p className="mt-3 text-sm text-lht-cream/60 font-lht-sans">
            Streetwear for people who lead with honesty. Every piece carries
            the signature LIVE HARD TRUTH mark — cut heavyweight, made to be
            worn hard.
          </p>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Shop</div>
          <ul className="mt-3 space-y-2 text-sm font-lht-sans">
            <li><Link to={p('/#shop')} className="hover:text-lht-cyan">The Collection</Link></li>
            <li><Link to={p(`/product/live-hard-truth-joggers-set`)} className="hover:text-lht-cyan">Joggers Set</Link></li>
            <li><Link to={p('/product/hard-truth-hat')} className="hover:text-lht-cyan">Hard Truth Hat</Link></li>
            <li><Link to={p('/cart')} className="hover:text-lht-cyan">Your Bag</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">The Movement</div>
          <ul className="mt-3 space-y-2 text-sm font-lht-sans">
            <li><Link to={p('/truth')} className="hover:text-lht-cyan">The Truth Session</Link></li>
            <li><Link to={p('/guide')} className="hover:text-lht-cyan">Free Guide</Link></li>
            <li><Link to={p('/#about')} className="hover:text-lht-cyan">About Hard Truth</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Help</div>
          <ul className="mt-3 space-y-2 text-sm font-lht-sans">
            <li><a href="mailto:info@tshirtbrothers.com" className="hover:text-lht-cyan">info@tshirtbrothers.com</a></li>
            <li><a href="tel:+14706221392" className="hover:text-lht-cyan">(470) 622-1392</a></li>
            <li className="text-lht-cream/50">Printed &amp; fulfilled in Fairburn, GA</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-lht-cream/10 py-4 text-center text-xs text-lht-cream/40 font-lht-sans">
        © {new Date().getFullYear()} Live Hard Truth · Fulfilled by{' '}
        <a href="https://tshirtbrothers.com" className="underline hover:text-lht-cyan">T-Shirt Brothers</a>
      </div>
    </footer>
  );
}
