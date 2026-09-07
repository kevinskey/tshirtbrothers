// Extended-size upcharges in cents, applied per item at checkout:
// 2XL +$2, 3XL +$4, 4XL and larger +$6. Tall variants (4XLT etc.)
// follow their base size. Keep in sync with the client copy in
// client/src/lib/sizeUpcharges.ts.
export function sizeUpchargeCents(size) {
  const s = String(size || '').trim().toUpperCase();
  if (s.startsWith('2XL') || s === 'XXL') return 200;
  if (s.startsWith('3XL')) return 400;
  if (/^[4-9]XL/.test(s)) return 600;
  return 0;
}
