// Extended-size upcharges in cents: 2XL +$2, 3XL +$3, 4XL +$4, 5XL+ +$6.
// Mirror of server/lib/sizeUpcharges.js — the server value is what
// actually gets charged; this copy only drives price display.
export function sizeUpchargeCents(size: string | null | undefined): number {
  const s = String(size ?? '').trim().toUpperCase();
  if (s.startsWith('2XL') || s === 'XXL') return 200;
  if (s.startsWith('3XL')) return 300;
  if (s.startsWith('4XL')) return 400;
  if (/^[5-9]XL/.test(s)) return 600;
  return 0;
}
