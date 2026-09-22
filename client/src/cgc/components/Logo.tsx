import { Link } from 'react-router-dom';
import { useCgcPath } from '../lib/base';

// The approved logo treatment: a solid orange-gradient gift mark (bow
// loops on top, ribbon channels cut through the lid and box) next to a
// bold italic two-line CUSTOM / GIFT CLUB wordmark in the same gradient.
export function GiftMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="cgc-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
        <mask id="cgc-ribbon">
          <rect width="48" height="48" fill="white" />
          {/* vertical ribbon channel + lid/box separation */}
          <rect x="21.2" y="13.5" width="5.6" height="34.5" fill="black" />
          <rect x="3" y="23.2" width="42" height="2.6" fill="black" />
        </mask>
      </defs>
      <g fill="url(#cgc-grad)">
        {/* bow loops */}
        <path d="M23 12.5 C 17.5 3.5, 7.5 6, 11.5 11 C 14 14, 20 13.5, 23 12.5 Z" />
        <path d="M25 12.5 C 30.5 3.5, 40.5 6, 36.5 11 C 34 14, 28 13.5, 25 12.5 Z" />
        <g mask="url(#cgc-ribbon)">
          {/* lid + box */}
          <rect x="6" y="14" width="36" height="10" rx="2" />
          <rect x="9" y="26" width="30" height="18" rx="2.5" />
        </g>
      </g>
    </svg>
  );
}

export default function Logo({ compact = false }: { compact?: boolean }) {
  const p = useCgcPath();
  return (
    <Link to={p('/')} className="flex items-center gap-2 shrink-0" aria-label="Custom Gift Club home">
      <GiftMark className={compact ? 'h-8 w-8' : 'h-10 w-10 sm:h-12 sm:w-12'} />
      <span
        className={`font-sans font-black uppercase italic leading-[0.92] tracking-tight bg-gradient-to-b from-[#fb923c] to-[#ea580c] bg-clip-text text-transparent ${compact ? 'text-sm' : 'text-lg sm:text-2xl'}`}
      >
        Custom<br />Gift&nbsp;Club
      </span>
    </Link>
  );
}
