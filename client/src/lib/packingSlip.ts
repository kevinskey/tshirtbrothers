// The branded TSB packing slip — the sheet that goes in the box.
//
// One document for every product line (DTF gang sheets, custom orders, and
// the coupon panel on group-store slips), so a customer gets the
// same branded insert no matter what they bought. It is printed from a
// hidden iframe rather than the admin page itself: the admin screens carry
// prices, notes and margins, and none of that belongs in a parcel.
//
// The coupon code is registered in the promotions table by
// server/migrations/packing_slip_coupon_20261008.sql.

export const SLIP_COUPON_CODE = 'THANKYOU20';
export const SLIP_COUPON_PERCENT = 20;

const LOGO_URL = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png';
const ORANGE = '#f97316';
const NAVY = '#0f172a';
const INK = '#111827';
const GRAY = '#6b7280';
const LINE = '#e5e7eb';
const CREAM = '#fff4ec';
const SHOP = {
  address: '6010 Renaissance Parkway, Fairburn, GA 30213',
  phone: '(470) 622-1392',
  email: 'info@tshirtbrothers.com',
  site: 'tshirtbrothers.com',
};

export interface PackingSlipItem {
  title: string;
  /** Size, colour, dimensions — anything but price. */
  detail?: string | null;
  qty: number | string;
  image?: string | null;
}

export interface PackingSlipData {
  orderNumber: string | number;
  /** "DTF Gang Sheet", "Custom Order", … */
  orderType: string;
  date?: string | Date | null;
  customer: { name?: string | null; email?: string | null; phone?: string | null };
  fulfillment: 'ship' | 'pickup' | null;
  shipTo?: string[];
  shippingMethod?: string | null;
  tracking?: { carrier?: string | null; number?: string | null } | null;
  items: PackingSlipItem[];
  /** Thumbnails shown under the items, e.g. the designs on a gang sheet. */
  gallery?: { title: string; images: { src: string; caption?: string }[] } | null;
  /** Customer-facing note. Never pass an admin note here. */
  note?: string | null;
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(d: string | Date | null | undefined): string {
  const date = d ? new Date(d) : new Date();
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const label = (text: string) =>
  `<div style="font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${GRAY};margin-bottom:6px;">${esc(text)}</div>`;

/** The 20%-off coupon panel. Inline-styled so it can also be dropped into
 *  the React-rendered group-store slip, which keeps its own store-branded
 *  thank-you. */
export function slipCouponHtml(): string {
  return `
  <div style="margin-top:28px;border:2px dashed ${ORANGE};border-radius:14px;background:${CREAM};padding:18px 22px;display:flex;align-items:center;gap:22px;break-inside:avoid;">
    <div style="flex:none;text-align:center;background:${ORANGE};color:#fff;border-radius:10px;padding:10px 16px;">
      <div style="font-size:34px;font-weight:900;line-height:1;">${SLIP_COUPON_PERCENT}%</div>
      <div style="font-size:12px;font-weight:800;letter-spacing:.2em;">OFF</div>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:11px;font-weight:700;letter-spacing:.16em;color:${INK};">A LITTLE THANK YOU FROM US</div>
      <div style="font-size:19px;font-weight:800;color:${INK};margin-top:2px;">Take ${SLIP_COUPON_PERCENT}% off your next order</div>
      <div style="font-size:12px;color:${GRAY};margin-top:4px;line-height:1.5;">
        Custom tees, DTF transfers, embroidery and more. Use the code on your next quote at
        <strong style="color:${INK};">${SHOP.site}</strong> or mention it in the shop.
      </div>
    </div>
    <div style="flex:none;text-align:center;background:#fff;border:2px solid ${ORANGE};border-radius:10px;padding:8px 16px;">
      <div style="font-size:10px;color:${GRAY};letter-spacing:.1em;text-transform:uppercase;">Use code</div>
      <div style="font-size:22px;font-weight:900;color:${ORANGE};letter-spacing:.06em;font-family:ui-monospace,Menlo,monospace;">${SLIP_COUPON_CODE}</div>
    </div>
  </div>`;
}

function thankYouFooterHtml(): string {
  return `
  <div style="margin-top:22px;background:${NAVY};color:#fff;border-radius:14px;padding:18px 22px;text-align:center;break-inside:avoid;">
    <div style="font-size:24px;font-weight:900;letter-spacing:-.01em;">Thank you for your order!</div>
    <div style="font-size:13px;color:#cbd5e1;margin-top:4px;">
      Every order supports a local, family-run print shop. We'd love to see what you make —
      tag us and share your photos.
    </div>
    <div style="height:3px;width:60px;background:${ORANGE};margin:12px auto;border-radius:2px;"></div>
    <div style="font-size:11px;color:#94a3b8;line-height:1.7;">
      T-Shirt Brothers · ${esc(SHOP.address)}<br/>
      ${esc(SHOP.phone)} · ${esc(SHOP.email)} · ${esc(SHOP.site)}
    </div>
  </div>`;
}

export function packingSlipHtml(d: PackingSlipData): string {
  const units = d.items.reduce((n, i) => n + (Number(i.qty) || 0), 0);
  const isPickup = d.fulfillment === 'pickup';
  const shipLines = d.shipTo && d.shipTo.length > 0
    ? d.shipTo
    : [d.customer.name || d.customer.email || 'Customer'];

  const rows = d.items.map((i) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid ${LINE};">
        <div style="display:flex;align-items:center;gap:10px;">
          ${i.image ? `<img src="${esc(i.image)}" alt="" style="width:44px;height:44px;object-fit:contain;border:1px solid ${LINE};border-radius:6px;background:#f8fafc;" />` : ''}
          <span style="font-weight:700;">${esc(i.title)}</span>
        </div>
      </td>
      <td style="padding:10px;border-bottom:1px solid ${LINE};color:#374151;">${esc(i.detail || '—')}</td>
      <td style="padding:10px;border-bottom:1px solid ${LINE};text-align:right;font-weight:800;font-size:15px;">${esc(i.qty)}</td>
      <td style="padding:10px;border-bottom:1px solid ${LINE};text-align:center;">
        <span style="display:inline-block;width:16px;height:16px;border:1.5px solid #9ca3af;border-radius:3px;"></span>
      </td>
    </tr>`).join('');

  const gallery = d.gallery && d.gallery.images.length > 0 ? `
    <div style="margin-top:20px;break-inside:avoid;">
      ${label(d.gallery.title)}
      <div style="display:flex;flex-wrap:wrap;gap:10px;">
        ${d.gallery.images.slice(0, 12).map((g) => `
          <div style="width:92px;text-align:center;">
            <img src="${esc(g.src)}" alt="" style="width:92px;height:92px;object-fit:contain;border:1px solid ${LINE};border-radius:8px;background:#f8fafc;" />
            ${g.caption ? `<div style="font-size:10px;color:${GRAY};margin-top:3px;">${esc(g.caption)}</div>` : ''}
          </div>`).join('')}
      </div>
    </div>` : '';

  const tracking = d.tracking?.number
    ? `<div style="margin-top:4px;">${esc(d.tracking.carrier || 'Tracking')} <span style="font-family:ui-monospace,Menlo,monospace;">${esc(d.tracking.number)}</span></div>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Packing slip #${esc(d.orderNumber)} · T-Shirt Brothers</title>
<style>
  @page { size: letter; margin: 0.45in; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; color: ${INK}; background: #fff; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
</style></head>
<body>
  <div style="background:${NAVY};color:#fff;border-radius:14px;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
    <div style="display:flex;align-items:center;gap:14px;">
      <img src="${LOGO_URL}" alt="T-Shirt Brothers" style="height:58px;width:58px;object-fit:contain;" />
      <div style="border-left:3px solid ${ORANGE};padding-left:14px;">
        <div style="font-size:22px;font-weight:900;letter-spacing:.02em;line-height:1.05;">T-SHIRT<br/>BROTHERS</div>
        <div style="font-size:9px;letter-spacing:.22em;color:#94a3b8;margin-top:4px;">CUSTOM APPAREL. STRONGER TOGETHER.</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="display:inline-block;background:${ORANGE};color:#fff;font-size:11px;font-weight:800;letter-spacing:.18em;padding:4px 10px;border-radius:999px;">PACKING SLIP</div>
      <div style="font-size:28px;font-weight:900;margin-top:6px;letter-spacing:-.02em;">#${esc(d.orderNumber)}</div>
      <div style="font-size:12px;color:#cbd5e1;">${esc(d.orderType)} · ${esc(fmtDate(d.date))}</div>
    </div>
  </div>

  <div style="display:flex;gap:28px;margin:22px 4px 20px;">
    <div style="flex:1.2;">
      ${label(isPickup ? 'Pickup for' : 'Ship to')}
      <div style="font-size:15px;line-height:1.5;">
        ${shipLines.map((l, i) => `<div style="font-weight:${i === 0 ? 800 : 400};">${esc(l)}</div>`).join('')}
      </div>
      ${d.customer.email || d.customer.phone
        ? `<div style="font-size:12px;color:${GRAY};margin-top:4px;">${esc([d.customer.email, d.customer.phone].filter(Boolean).join(' · '))}</div>`
        : ''}
    </div>
    <div style="flex:1;">
      ${label('Delivery')}
      <div style="font-size:13px;color:#374151;line-height:1.6;">
        ${isPickup ? 'Local pickup — Fairburn, GA' : esc(d.shippingMethod || (d.fulfillment === 'ship' ? 'Shipped' : '—'))}
        ${tracking}
      </div>
    </div>
    <div style="flex:none;text-align:right;">
      ${label('Items')}
      <div style="font-size:26px;font-weight:900;">${units}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr style="background:${NAVY};color:#fff;">
        <th style="text-align:left;padding:9px 10px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;border-radius:8px 0 0 0;">Item</th>
        <th style="text-align:left;padding:9px 10px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;">Details</th>
        <th style="text-align:right;padding:9px 10px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;">Qty</th>
        <th style="width:44px;padding:9px 10px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;border-radius:0 8px 0 0;">✓</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  ${gallery}

  ${d.note ? `
  <div style="margin-top:18px;border-left:3px solid ${ORANGE};background:#f8fafc;padding:10px 14px;border-radius:0 8px 8px 0;break-inside:avoid;">
    ${label('Your note')}
    <div style="font-size:13px;color:#374151;white-space:pre-wrap;">${esc(d.note)}</div>
  </div>` : ''}

  ${slipCouponHtml()}
  ${thankYouFooterHtml()}
</body></html>`;
}

/** Print the slip without leaving the page: render it into a hidden iframe,
 *  wait for the logo and thumbnails, then open the print dialog. */
export function printPackingSlip(d: PackingSlipData): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) { iframe.remove(); return; }
  doc.open();
  doc.write(packingSlipHtml(d));
  doc.close();

  const cleanup = () => setTimeout(() => iframe.remove(), 500);
  const images = Array.from(doc.images);
  const loaded = Promise.all(images.map((img) => (img.complete
    ? Promise.resolve()
    : new Promise<void>((r) => { img.onload = () => r(); img.onerror = () => r(); }))));
  const timeout = new Promise<void>((r) => setTimeout(r, 4000));
  void Promise.race([loaded, timeout]).then(() => {
    win.addEventListener('afterprint', cleanup);
    win.focus();
    win.print();
    setTimeout(() => iframe.remove(), 60_000);
  });
}
