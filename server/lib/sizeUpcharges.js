// Extended-size upcharges in cents, applied per item at checkout:
// 2XL +$2, 3XL +$3, 4XL +$4, 5XL and larger +$6. Tall variants (4XLT etc.)
// follow their base size. Keep in sync with the client copy in
// client/src/lib/sizeUpcharges.ts.
//
// Corrected 2026-10-09: this table had 3XL at +$4 and everything 4XL-and-up
// at +$6, which overcharged 3XL by $1 and 4XL by $2 on every storefront and
// group-store order. The ladder below is the one quoted by hand.
export function sizeUpchargeCents(size) {
  const s = String(size || '').trim().toUpperCase();
  if (s.startsWith('2XL') || s === 'XXL') return 200;
  if (s.startsWith('3XL')) return 300;
  if (s.startsWith('4XL')) return 400;
  if (/^[5-9]XL/.test(s)) return 600;
  return 0;
}
