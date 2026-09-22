import { Link } from 'react-router-dom';
import { useCgcPath } from '../lib/base';

// The approved logo: solid orange gift mark (twin bow loops, ribbon
// channels cut through lid and box) beside a heavy italic two-line
// CUSTOM / GIFT CLUB wordmark. The gradient is applied PER LINE so both
// lines shade light→dark individually — one gradient across the whole
// block leaves the top line washed out and the bottom line muddy.
export function GiftMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden focusable="false">
      <defs>
        <linearGradient id="cgc-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f97316" />
          <stop offset="1" stopColor="#dd5a0b" />
        </linearGradient>
        <mask id="cgc-ribbon">
          <rect width="48" height="48" fill="white" />
          <rect x="20.8" y="14" width="6.4" height="34" fill="black" />
          <rect x="3" y="24.4" width="42" height="3" fill="black" />
        </mask>
      </defs>
      <g fill="url(#cgc-grad)">
        {/* twin bow loops */}
        <path d="M22.5 13 C 15 1.5, 3.5 5.5, 9.5 12 C 12.5 15, 19.5 14, 22.5 13 Z" />
        <path d="M25.5 13 C 33 1.5, 44.5 5.5, 38.5 12 C 35.5 15, 28.5 14, 25.5 13 Z" />
        <g mask="url(#cgc-ribbon)">
          <rect x="5" y="15" width="38" height="11" rx="2" />
          <rect x="8.5" y="27.5" width="31" height="18.5" rx="3" />
        </g>
      </g>
    </svg>
  );
}

const LINE_CLASS =
  'block leading-none bg-gradient-to-b from-[#fb8c2e] to-[#e3610d] bg-clip-text text-transparent pr-1';

export default function Logo({ compact = false }: { compact?: boolean }) {
  const p = useCgcPath();
  return (
    <Link to={p('/')} className="flex items-center gap-2 shrink-0" aria-label="Custom Gift Club home">
      <GiftMark className={compact ? 'h-8 w-8' : 'h-10 w-10 sm:h-12 sm:w-12'} />
      <span
        className={`font-sans font-black uppercase italic tracking-tight ${compact ? 'text-sm' : 'text-lg sm:text-[1.55rem]'}`}
      >
        <span className={LINE_CLASS}>Custom</span>
        <span className={`${LINE_CLASS} ${compact ? 'mt-px' : 'mt-0.5'}`}>Gift&nbsp;Club</span>
      </span>
    </Link>
  );
}
