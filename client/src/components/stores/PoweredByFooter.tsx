// The orange "Powered by TSHIRT BROTHERS" band that closes every
// storefront page — group, business and franchise alike, plus the cart
// and the order-confirmation page. Store branding owns everything above
// it; this strip is TSB's one consistent signature across all of them.
import StoreMark from './StoreMark';

export default function PoweredByFooter({
  storeName, logoUrl, color, note,
}: {
  storeName?: string;
  logoUrl?: string | null;
  color?: string;
  /** Optional store-supplied line (brand_json.footer_note). */
  note?: string | null;
}) {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-orange-500 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {storeName && (
            <>
              <StoreMark name={storeName} logoUrl={logoUrl} color={color || '#111827'} size="sm"
                className="ring-2 ring-white/70" />
              <div className="min-w-0">
                <p className="font-bold leading-tight truncate">{storeName}</p>
                <p className="text-[11px] text-orange-100 leading-tight">© {year} · All rights reserved</p>
              </div>
            </>
          )}
        </div>
        <a
          href="https://tshirtbrothers.com"
          target="_blank"
          rel="noreferrer"
          className="group inline-flex items-baseline gap-2 whitespace-nowrap"
        >
          <span className="text-xs font-medium text-orange-100 group-hover:text-white">Powered by</span>
          <span className="text-lg sm:text-xl font-black uppercase tracking-[0.12em] text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.25)]">
            TShirt Brothers
          </span>
        </a>
      </div>
      {note && (
        <div className="border-t border-white/20">
          <p className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 text-center text-xs text-orange-50">{note}</p>
        </div>
      )}
    </footer>
  );
}
