import { Gift } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCgcPath } from '../lib/base';

// Gift-symbol logo + stacked orange wordmark, per the approved design.
export default function Logo({ compact = false }: { compact?: boolean }) {
  const p = useCgcPath();
  return (
    <Link to={p('/')} className="flex items-center gap-2 shrink-0" aria-label="Custom Gift Club home">
      <Gift
        className={`${compact ? 'h-7 w-7' : 'h-9 w-9 sm:h-11 sm:w-11'} text-cgc-orange`}
        strokeWidth={2.4}
        aria-hidden
      />
      <span className={`font-display font-bold uppercase leading-[0.95] tracking-tight text-cgc-orange ${compact ? 'text-sm' : 'text-base sm:text-xl'}`}>
        Custom<br />Gift Club
      </span>
    </Link>
  );
}
