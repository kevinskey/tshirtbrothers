import { Link } from 'react-router-dom';
import { useApcPath } from '../lib/base';

// Wordmark logo (no raster asset yet — swap in a real logo file when Doc
// supplies one, like cgc-logo.png).
export default function Logo() {
  const p = useApcPath();
  return (
    <Link to={p('/')} className="flex items-center gap-2 shrink-0" aria-label="All Print Club home">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-apc-blue text-white font-black text-sm tracking-tight">
        APC
      </span>
      <span className="hidden sm:block leading-none">
        <span className="block font-display font-bold text-lg text-apc-ink tracking-tight">All Print Club</span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-apc-slate">Print more. Pay less.</span>
      </span>
    </Link>
  );
}
