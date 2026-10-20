import { Link } from 'react-router-dom';
import { useLhtPath } from '../lib/base';

// Stacked wordmark — the brand mark is typographic (Archivo Black).
// A raster logo exists at /lht/logo.jpg but the type treatment matches
// the garments' embossed LIVE HARD TRUTH mark better in the header.
export default function Logo() {
  const p = useLhtPath();
  return (
    <Link to={p('/')} className="shrink-0 leading-none" aria-label="Live Hard Truth home">
      <span className="block font-lht-display text-lht-cream text-base sm:text-lg tracking-[0.08em] uppercase">
        Live Hard Truth
      </span>
      <span className="block text-[9px] font-lht-sans font-semibold uppercase tracking-[0.34em] text-lht-cyan mt-0.5">
        Wear the truth
      </span>
    </Link>
  );
}
