import { Link } from 'react-router-dom';
import { useCgcPath } from '../lib/base';

// Doc's supplied Custom Gift Club logo (2026-09-22): heart-bow gift mark
// with CUSTOM (charcoal) / GIFT CLUB (orange) wordmark. Source asset in
// client/public/cgc-logo.png (transparent, 800px); cgc-icon.png is the
// gift-mark crop used as the favicon by scripts/make-cgc-shell.mjs.
export default function Logo({ compact = false }: { compact?: boolean }) {
  const p = useCgcPath();
  return (
    <Link to={p('/')} className="flex items-center shrink-0" aria-label="Custom Gift Club home">
      <img
        src="/cgc-logo.png"
        alt="Custom Gift Club"
        className={`${compact ? 'h-9' : 'h-12 sm:h-14'} w-auto`}
      />
    </Link>
  );
}
