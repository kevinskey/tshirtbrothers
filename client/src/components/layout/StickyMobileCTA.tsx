import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Tag, Sparkles } from 'lucide-react';

// Mobile-only bottom action bar. Mounts inside Layout so it appears on
// every public marketing page automatically. Two intentional UX choices:
//
//   1. Hidden until the user has scrolled past ~80% of the viewport
//      height. The hero CTA is still in view above that threshold, so
//      adding a second one immediately would be redundant. Once the
//      user has scrolled — i.e. they're "still browsing" — we recover
//      that second-thoughts moment with a one-tap path back to /quote.
//
//   2. Hidden on /quote and /design entirely. /quote has its own quote
//      CTA literally on screen; /design has its own bottom toolbar
//      that would visually collide. Hiding here is cheaper than
//      conditionally not rendering Layout for those pages.

const HIDE_ON_PATHS = ['/quote', '/design'];

export default function StickyMobileCTA() {
  const { pathname } = useLocation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    function onScroll() {
      // Show after the user has scrolled ~80% of viewport — past the
      // hero's primary CTA but before the page is unreasonably deep.
      const threshold = Math.max(window.innerHeight * 0.8, 400);
      setShow(window.scrollY > threshold);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  if (HIDE_ON_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <div
      // Fixed to the bottom of the mobile viewport. md:hidden lets the
      // desktop CTA in the hero / nav do its job without a redundant
      // floating bar. pointer-events-none on the wrapper while hidden
      // means the bar can't intercept taps during its transition out.
      className={`fixed inset-x-0 bottom-0 z-40 md:hidden transition-transform duration-300 ${
        show ? 'translate-y-0' : 'translate-y-full pointer-events-none'
      }`}
      // iOS safe-area inset so the bar clears the home indicator.
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-2 mb-2 flex gap-2 rounded-2xl bg-gray-950/95 backdrop-blur border border-white/10 shadow-2xl shadow-black/30 p-2">
        <Link
          to="/quote"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 px-3 py-3 text-sm font-bold text-white"
        >
          <Tag className="h-4 w-4" /> Get a Quote
        </Link>
        <Link
          to="/design"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 px-3 py-3 text-sm font-bold text-white"
        >
          <Sparkles className="h-4 w-4" /> Design
        </Link>
      </div>
    </div>
  );
}
