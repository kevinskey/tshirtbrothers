import { Link } from 'react-router-dom';

// Homepage band announcing the DTF transfer service. The horizontal
// gang-sheet ribbon (film + white-ink-haloed art + foot ruler) mirrors the
// /dtf hero's signature graphic so the two read as one campaign.
export default function DtfPromo() {
  return (
    <section className="overflow-hidden bg-gray-900">
      <div className="container mx-auto grid max-w-6xl items-center gap-6 px-4 py-10 sm:grid-cols-2 sm:py-12">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-orange-400">
            New · DTF transfers
          </p>
          <h2
            className="mt-2 font-display text-3xl font-bold uppercase leading-[0.95] tracking-tight text-white sm:text-4xl"
            style={{ fontWeight: 900 }}
          >
            We print DTF.
            <span className="block text-orange-500">By the foot.</span>
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-300">
            22″ gang sheets from $9/ft — upload your art or build a sheet online,
            with same-day rush available. Press them yourself, or we'll press them for you.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              to="/dtf"
              className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-700"
            >
              Order transfers
            </Link>
            <Link
              to="/dtf/builder"
              className="rounded-xl border border-gray-600 px-6 py-3 text-sm font-bold text-gray-200 transition hover:border-orange-500 hover:text-white"
            >
              Build a sheet
            </Link>
          </div>
        </div>

        {/* Horizontal gang-sheet ribbon */}
        <svg aria-hidden="true" viewBox="0 0 520 150" className="w-full">
          <rect x="-10" y="30" width="540" height="104" rx="6" fill="#1f2937" />
          <rect x="-10" y="30" width="540" height="104" rx="6" fill="url(#dtfPromoGloss)" />
          <defs>
            <linearGradient id="dtfPromoGloss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.10" />
              <stop offset="0.3" stopColor="#ffffff" stopOpacity="0" />
              <stop offset="1" stopColor="#000000" stopOpacity="0.25" />
            </linearGradient>
          </defs>
          {/* printed art on white-ink halos */}
          <circle cx="52" cy="82" r="22" fill="#ffffff" />
          <circle cx="52" cy="82" r="17" fill="#ec4899" />
          <rect x="96" y="56" width="64" height="38" rx="8" fill="#ffffff" />
          <rect x="101" y="61" width="54" height="28" rx="5" fill="#22d3ee" />
          <rect x="96" y="104" width="52" height="20" rx="5" fill="#ffffff" />
          <rect x="100" y="108" width="44" height="12" rx="3" fill="#facc15" />
          <rect x="184" y="60" width="90" height="34" rx="8" fill="#ffffff" />
          <rect x="189" y="65" width="80" height="24" rx="5" fill="#111827" />
          <text x="229" y="82" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="14" fill="#ffffff" letterSpacing="2">TSB</text>
          <circle cx="212" cy="116" r="14" fill="#ffffff" />
          <circle cx="212" cy="116" r="10" fill="#ea580c" />
          <path d="M310 58 l18 30 h-14 l11 28 -30 -35 h14 z" fill="#ffffff" />
          <path d="M312 62 l14 24 h-11 l9 22 -24 -28 h11 z" fill="#facc15" />
          <rect x="352" y="62" width="46" height="46" rx="23" fill="#ffffff" />
          <rect x="358" y="68" width="34" height="34" rx="17" fill="#22d3ee" />
          <rect x="418" y="58" width="70" height="30" rx="7" fill="#ffffff" />
          <rect x="423" y="63" width="60" height="20" rx="4" fill="#ea580c" />
          <rect x="424" y="98" width="44" height="24" rx="6" fill="#ffffff" />
          <rect x="428" y="102" width="36" height="16" rx="3" fill="#ec4899" />
          {/* tape-measure edge along the top */}
          <rect x="-10" y="18" width="540" height="14" fill="#111827" />
          {[0, 1, 2, 3].map((ft) => (
            <g key={ft}>
              <rect x={30 + ft * 150} y="18" width="2" height="14" fill="#ea580c" />
              <text x={40 + ft * 150} y="29" fontFamily="ui-monospace, monospace" fontSize="9" fill="#9ca3af">
                {ft + 1}FT
              </text>
              {[1, 2].map((q) => (
                <rect key={q} x={30 + ft * 150 + q * 50} y="25" width="1" height="7" fill="#4b5563" />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
