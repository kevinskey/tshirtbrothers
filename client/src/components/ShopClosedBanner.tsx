import { useLocation } from 'react-router-dom';
import { useShopClosure } from '@/lib/shopStatus';

// Sitewide notice while the whole-shop switch is on. Admin pages skip it
// (the dashboard has its own card), and so does the build-time prerenderer,
// so a deploy made while the shop is closed can't bake the notice into the
// HTML Google indexes.
export default function ShopClosedBanner() {
  const { pathname } = useLocation();
  const { data } = useShopClosure();
  if (typeof navigator !== 'undefined' && /HeadlessChrome/i.test(navigator.userAgent)) return null;
  if (pathname.startsWith('/admin') || /\/admin$/.test(pathname)) return null;
  if (!data || !data.closed) return null;
  return (
    <div role="status" className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-900">
      <p className="font-semibold">
        {data.reopens_label ? `We're closed and reopen ${data.reopens_label}.` : "We're closed right now."}
        {data.note ? ` ${data.note}` : ''}
      </p>
      <p className="mt-0.5 text-xs text-amber-800">
        New orders and checkout are paused. Quote requests are welcome, and we&rsquo;ll reply when we reopen.
      </p>
    </div>
  );
}
