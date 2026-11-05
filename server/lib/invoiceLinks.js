// Customer-facing invoice URLs.
//
// GET /api/invoices/public/:id, GET /api/invoices/:id/pdf and
// POST /api/invoices/public/:id/create-checkout are gated on
// invoices.public_token (see migrations/invoice_public_token.sql), so every
// link we hand a customer has to carry it. Built here rather than at the nine
// call sites that used to interpolate the bare id, so a new one can't quietly
// ship an unauthorized link.
//
// Pass the invoice row, not just the id — the token has to come from the DB.

const DOMAIN = () => process.env.DOMAIN || 'https://tshirtbrothers.com';

function suffix(invoice) {
  return invoice?.public_token ? `?token=${invoice.public_token}` : '';
}

// The React invoice page, which forwards ?token= to the API.
export function invoiceViewUrl(invoice, { domain } = {}) {
  return `${domain || DOMAIN()}/invoice/view/${invoice.id}${suffix(invoice)}`;
}

// The PDF endpoint, hit directly by the browser.
export function invoicePdfUrl(invoice, { domain, absolute = true } = {}) {
  const base = absolute ? (domain || DOMAIN()) : '';
  return `${base}/api/invoices/${invoice.id}/pdf${suffix(invoice)}`;
}
