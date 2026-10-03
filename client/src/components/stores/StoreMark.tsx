// A store's visual mark: its uploaded logo when it has one, otherwise a
// monogram tile in the store's brand color. Every storefront surface
// (header, footer, cart, receipt) used to render the logo only when the
// URL existed, so stores that hadn't uploaded one showed bare text and
// read as unbranded. The monogram keeps them branded until the logo lands.

const SIZES = {
  sm: { box: 'h-9 w-9 rounded-lg', text: 'text-xs' },
  md: { box: 'h-12 w-12 rounded-xl', text: 'text-base' },
  lg: { box: 'h-20 w-20 sm:h-24 sm:w-24 rounded-2xl', text: 'text-2xl' },
} as const;

export function storeInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /^[a-z0-9]/i.test(w))
    .map((w) => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('') || '•';
}

export default function StoreMark({
  name, logoUrl, color = '#111827', size = 'md', className = '',
}: {
  name: string;
  logoUrl?: string | null;
  color?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className={`${s.box} object-contain bg-white shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`${s.box} ${s.text} shrink-0 flex items-center justify-center font-black text-white tracking-tight ${className}`}
      style={{ background: color }}
    >
      {storeInitials(name)}
    </div>
  );
}
