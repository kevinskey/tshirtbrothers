// Render the three branded customer email templates to static HTML files
// with clearly-labeled SAMPLE data — for design review only, nothing sends.
//
//   node server/scripts/preview-emails.mjs [outDir]
//
// The promotions lookup is stubbed with a sample promo so the coupon panel
// renders even without a database connection.
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import pool from '../db.js';

// Stub the DB before importing the templates: previews must render without
// a live database, and the coupon panel needs a promo row to show itself.
const SAMPLE_PROMO = {
  code: 'SAMPLE10',
  headline: 'Good for your next custom apparel order.',
  discount_type: 'percent',
  discount_value: 10,
  min_order_amount: 0,
  expires_at: new Date(Date.now() + 90 * 86400000),
};
pool.query = async () => ({ rows: [SAMPLE_PROMO] });

const { buildQuoteEmailHtml, buildPaidReceiptHtml } = await import('../services/email.js');
const { buildInvoiceEmailHtml } = await import('../routes/invoices.js');

const outDir = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '../../email-previews');
fs.mkdirSync(outDir, { recursive: true });

// ── SAMPLE DATA (stress cases: long names, many lines, extended sizes,
//    discounts, partial payment, missing optional fields) ──────────────────

const sampleQuote = {
  id: 999,
  customer_name: 'Alexandria Montgomery-Vanderbilt (SAMPLE)',
  customer_email: 'sample.customer@example.com',
  customer_phone: '(555) 010-0000',
  product_name: 'Unisex Heavy Blend™ Hooded Sweatshirt',
  color: 'Light Pink',
  quantity: 48,
  sizes: { S: 6, M: 12, L: 12, XL: 8, '2XL': 6, '3XL': 3, '4XL': 1 },
  print_areas: ['Front - Full', 'Back - Full', 'Left Sleeve'],
  design_type: 'DTF Transfer',
  design_url: null,
  accept_token: 'SAMPLETOKEN',
  created_at: new Date(),
  date_needed: new Date(Date.now() + 21 * 86400000),
  shipping_method: 'shipping',
  shipping_address: { name: 'Riverside High School Booster Club', street: '123 Education Way', city: 'Fairburn', state: 'GA', zip: '30213' },
};
const sampleQuotePrice = {
  basePrice: 528.0, printingCost: 336.0, designFee: 75.0, rushFee: 0,
  shipping: 45.0, tax: 74.53, taxExempt: false, taxRate: 0.0775,
  total: 1058.53, message: 'SAMPLE preview — thanks for the artwork! Extended sizes carry a small upcharge, reflected below.',
  discountPct: 10, discountReason: 'Returning customer', discountAmount: 96.4,
};

const sampleInvoice = {
  id: 999,
  invoice_number: 'INV-SAMPLE-001',
  quote_id: 999,
  customer_name: 'Alexandria Montgomery-Vanderbilt (SAMPLE)',
  customer_email: 'sample.customer@example.com',
  customer_phone: '(555) 010-0000',
  customer_address: '123 Education Way, Fairburn, GA 30213',
  items: [
    { description: "Women's Heavy Cotton™ T-Shirt (Gildan)", color: 'Black', size: 'XL', quantity: 24, unit_price: 12.0 },
    { description: 'Unisex Heavy Blend™ Hooded Sweatshirt (Gildan)', color: 'Light Pink', size: '2XL', quantity: 6, unit_price: 26.74 },
    { description: 'Unisex Heavy Blend™ Hooded Sweatshirt (Gildan)', color: 'Light Pink', size: '3XL', quantity: 3, unit_price: 31.35 },
    { description: 'Unisex Heavy Blend™ Hooded Sweatshirt (Gildan)', color: 'Light Pink', size: '4XL', quantity: 1, unit_price: 31.35 },
    { description: 'Rush production fee', quantity: 1, unit_price: 50.0 },
  ],
  subtotal: 613.84, tax: 49.11, shipping: 45.0, discount: 25.0,
  total: 682.95, amount_paid: 341.48, amount_due: 341.47,
  deposit_percent: 50, due_date: null, notes: 'SAMPLE preview — deposit received, balance due on delivery.',
  created_at: new Date(),
  mockup_preview_url: null, mockup_preview_url_back: null, extra_mockups: [],
};

const samplePaid = {
  ...sampleInvoice,
  amount_paid: 682.95, amount_due: 0, deposit_percent: 50,
  notes: null,
};

const files = {
  'template1-quote.html': await buildQuoteEmailHtml(sampleQuote, sampleQuotePrice),
  'template2-invoice.html': await buildInvoiceEmailHtml({ ...sampleInvoice, amount_paid: 0, amount_due: 682.95 }, 'https://tshirtbrothers.com/invoice/view/999'),
  'template2b-invoice-partial.html': await buildInvoiceEmailHtml(sampleInvoice, 'https://tshirtbrothers.com/invoice/view/999'),
  'template3-paid-receipt.html': await buildPaidReceiptHtml(samplePaid),
};
for (const [name, html] of Object.entries(files)) {
  fs.writeFileSync(path.join(outDir, name), html);
  console.log('wrote', path.join(outDir, name));
}
process.exit(0);
