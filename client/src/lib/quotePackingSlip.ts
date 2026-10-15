// Packing slip for a custom-apparel quote/order. Shared by the admin quote
// modal (AdminPage) and the order dossier (AdminOrderDetailPage), which hold
// the same order in slightly different shapes — snake_case rows from the
// detail endpoint, camelCase+snake_case from the quotes list. Everything here
// is customer-facing: garments, colours, sizes, design thumbnails. No prices,
// deposits or admin notes.
import { printPackingSlip, type PackingSlipItem } from './packingSlip';

interface SizeCount { size: string; quantity: number }

export interface SlipQuote {
  id: string | number;
  customer_name?: string | null; customerName?: string | null;
  customer_email?: string | null; customerEmail?: string | null;
  customer_phone?: string | null; customerPhone?: string | null;
  product_name?: string | null; productName?: string | null;
  color?: string | null;
  quantity?: number | null;
  created_at?: string | null; createdAt?: string | null;
  accepted_at?: string | null;
  shipping_method?: string | null;
  fulfillment_method?: string | null;
  tracking_number?: string | null;
  tracking_carrier?: string | null;
  shipping_address?: unknown;
  mockup_image_url?: string | null;
  mockup_image_url_back?: string | null;
}

export interface SlipItem {
  product_name?: string | null;
  catalog_name?: string | null;
  brand?: string | null;
  color?: string | null;
  sizes?: unknown;
  quantity?: number | null;
}

function sizesOf(raw: unknown): SizeCount[] {
  let v = raw;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is SizeCount => !!s && typeof s === 'object' && 'size' in s)
    .map((s) => ({ size: String(s.size), quantity: Number(s.quantity) || 0 }));
}

// Addresses were saved in two shapes over time: the quote wizard writes
// {street, city, state, zip}; the checkout/label flows write
// {name, address, address2, city, state, zip}. Read both.
function addressLines(raw: unknown, fallbackName: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const a = raw as Record<string, unknown>;
  const s = (k: string) => (typeof a[k] === 'string' ? (a[k] as string).trim() : '');
  const cityLine = [s('city'), s('state')].filter(Boolean).join(', ') + (s('zip') ? ` ${s('zip')}` : '');
  return [
    s('name') || fallbackName || '',
    s('address') || s('street') || s('line1'),
    s('address2') || s('line2'),
    cityLine.trim(),
  ].filter((l) => l !== '');
}

export function quoteSlipItems(quote: SlipQuote, items: SlipItem[]): PackingSlipItem[] {
  const real = items.filter((it) => it.product_name || it.catalog_name || (Number(it.quantity) || 0) > 0);
  if (real.length === 0) {
    return [{
      title: quote.product_name || quote.productName || 'Custom apparel order',
      detail: quote.color || null,
      qty: quote.quantity ?? '',
    }];
  }
  return real.map((it) => {
    const sizes = sizesOf(it.sizes);
    const fromSizes = sizes.reduce((n, sz) => n + sz.quantity, 0);
    return {
      title: it.product_name || it.catalog_name || 'Item',
      detail: [
        [it.brand, it.color].filter(Boolean).join(' · '),
        sizes.filter((sz) => sz.quantity > 0).map((sz) => `${sz.size} × ${sz.quantity}`).join(', '),
      ].filter(Boolean).join(' — '),
      qty: it.quantity ?? (fromSizes || ''),
    };
  });
}

export function printQuotePackingSlip(quote: SlipQuote, items: SlipItem[] = []): void {
  const name = quote.customer_name || quote.customerName || null;
  const method = quote.fulfillment_method || quote.shipping_method || null;
  const isPickup = !method || /pickup|pick up|will call/i.test(method);
  const shipTo = isPickup ? undefined : addressLines(quote.shipping_address, name);
  printPackingSlip({
    orderNumber: quote.id,
    orderType: 'Custom Order',
    date: quote.accepted_at || quote.created_at || quote.createdAt || null,
    customer: {
      name,
      email: quote.customer_email || quote.customerEmail || null,
      phone: quote.customer_phone || quote.customerPhone || null,
    },
    fulfillment: isPickup ? 'pickup' : 'ship',
    shipTo: shipTo && shipTo.length > 0 ? shipTo : undefined,
    shippingMethod: !isPickup && method && method !== 'ship' ? method : null,
    tracking: quote.tracking_number
      ? { carrier: quote.tracking_carrier, number: quote.tracking_number }
      : null,
    items: quoteSlipItems(quote, items),
    gallery: quote.mockup_image_url || quote.mockup_image_url_back ? {
      title: 'Your design',
      images: [
        quote.mockup_image_url && { src: quote.mockup_image_url, caption: 'Front' },
        quote.mockup_image_url_back && { src: quote.mockup_image_url_back, caption: 'Back' },
      ].filter((g): g is { src: string; caption: string } => !!g),
    } : null,
  });
}
