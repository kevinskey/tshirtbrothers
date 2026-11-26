import { orderSheets } from '../lib/dtfCart.js';

// Sequential sends preserve each vendor's page-splitting behavior. A failure
// propagates before the caller records the whole order as sent.
export async function sendPurchasedDtfSheets(order, vendor, { split, send, sign }) {
  const sheets = orderSheets(order);
  if (!sheets.length) throw new Error('Order has no production file');
  const sent = [];
  for (const [index, sheet] of sheets.entries()) {
    const reference = `TSB Order #${order.id} — Sheet ${index + 1}, ${sheet.copies} copies`;
    const note = [`Print ${sheet.copies} copies of this sheet.`, vendor.note].filter(Boolean).join(' ');
    const parts = await split({ vendorName: vendor.vendorName, vendorEmail: vendor.vendorEmail,
      reference, fileKey: sheet.file_key, layout: sheet.layout, note });
    if (!parts) await send({ vendorName: vendor.vendorName, vendorEmail: vendor.vendorEmail,
      reference, widthPx: sheet.width_px, heightPx: sheet.height_px,
      downloadUrl: await sign(sheet.file_key), linkExpiresDays: 7, note });
    sent.push(...(parts || [{ name: `order-${order.id}-sheet-${index + 1}.png`,
      key: sheet.file_key, widthPx: sheet.width_px, heightPx: sheet.height_px }])
      .map(file => ({ ...file, copies: sheet.copies })));
  }
  return sent;
}
