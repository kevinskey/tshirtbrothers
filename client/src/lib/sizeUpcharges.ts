// Extended-size upcharges in cents: 2XL +$2, 3XL +$4, 4XL+ +$6.
// Mirror of server/lib/sizeUpcharges.js — the server value is what
// actually gets charged; this copy only drives price display.
export function sizeUpchargeCents(size: string | null | undefined): number {
  const s = String(size ?? '').trim().toUpperCase();
  if (s.startsWith('2XL') || s === 'XXL') return 200;
  if (s.startsWith('3XL')) return 400;
  if (/^[4-9]XL/.test(s)) return 600;
  return 0;
}
