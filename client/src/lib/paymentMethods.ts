// How money that didn't come through Stripe gets labelled.
//
// Two admin screens record offline payments — the Record Payment modal in the
// Invoices tab and "Record offline payment" on the order dossier — and until
// 2026-11-25 they offered different lists. The invoice modal had no Zelle, so a
// Zelle payment on invoice 130 (quote #339) could only be booked by hand
// against the API. One list now feeds both.
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'cashapp', label: 'Cash App' },
  { value: 'venmo', label: 'Venmo' },
  { value: 'check', label: 'Check' },
  { value: 'card', label: 'Card (in person)' },
  { value: 'transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
] as const;

// Labels for display. Covers the values above plus what older rows actually
// hold: 'stripe' (the webhook), 'manual' (the server's fallback when a caller
// sends no method), and mixed case like 'Card'. Anything unrecognised — one
// row reads 'deposit (quote #173)' — is shown as stored rather than hidden.
const EXTRA_LABELS: Record<string, string> = {
  stripe: 'Stripe',
  manual: 'Recorded by hand',
  transfer: 'Bank Transfer',
};

export function paymentMethodLabel(method?: string | null): string {
  if (!method) return 'Payment';
  const key = method.trim().toLowerCase();
  const known = PAYMENT_METHODS.find((m) => m.value === key);
  return known?.label || EXTRA_LABELS[key] || method;
}
