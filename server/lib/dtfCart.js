export const DTF_FILE_KEY_RE = /^gangsheet-orders\/[\w-]+\/[0-9a-f-]+-(\d{1,5})x(\d{1,6})\.png$/;

// File keys are issued by upload/compose with server-parsed pixel dimensions.
// Never price using client-supplied width, height, roll, or price.
export function priceDtfCart(body, { widthFromPixels, enabledWidths, priceSheet }) {
  const raw = body.sheets === undefined
    ? [{ file_key: body.file_key, length_ft: Number(body.length_ft), copies: 1 }]
    : body.sheets;
  if (!Array.isArray(raw) || !raw.length || raw.length > 50) throw new Error('Add between 1 and 50 sheets');
  const sheets = raw.map((item, index) => {
    const fail = message => { throw new Error(`Sheet ${index + 1}: ${message}`); };
    const match = typeof item?.file_key === 'string' && item.file_key.match(DTF_FILE_KEY_RE);
    if (!match) fail('upload your print-ready sheet first');
    const width_px = Number(match[1]), height_px = Number(match[2]);
    const width_in = widthFromPixels(width_px);
    if (!width_in || !enabledWidths.includes(width_in)) fail('choose an available 22" or 34" sheet');
    const copies = item.copies === undefined ? 1 : item.copies;
    if (!Number.isSafeInteger(copies) || copies < 1 || copies > 1000) fail('copies must be a whole number from 1 to 1000');
    if (typeof item.length_ft !== 'number' || !Number.isFinite(item.length_ft)) fail('choose a valid length');
    if (body.sheets !== undefined && !Number.isInteger(item.length_ft)) fail('length must be a whole number of feet');
    const length_ft = Math.ceil(item.length_ft);
    let unit_cents;
    try { unit_cents = priceSheet(length_ft, width_in); }
    catch { fail('length is outside the available range'); }
    if (height_px < 1 || height_px > length_ft * 3600 * 1.02) fail('your artwork is taller than the length selected');
    if (!Number.isSafeInteger(unit_cents) || unit_cents < 0) fail('pricing is unavailable');
    return { file_key: item.file_key, width_px, height_px, width_in, length_ft, copies,
      name: typeof item.name === 'string' ? item.name.trim().slice(0, 120) : `Sheet ${index + 1}`,
      unit_cents, line_cents: unit_cents * copies };
  });
  const total_cents = sheets.reduce((sum, sheet) => sum + sheet.line_cents, 0);
  if (!Number.isSafeInteger(total_cents) || total_cents > 99999999) throw new Error('This order exceeds the online checkout limit; contact the shop');
  return { sheets, total_cents };
}

// All read paths accept historical single-file orders as well as new carts.
export function orderSheets(order) {
  let value = order.sheets_json;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = null; } }
  if (Array.isArray(value) && value.length) return value;
  return order.file_key ? [{ file_key: order.file_key, width_in: order.width_in ?? 22,
    width_px: order.file_width_px, height_px: order.file_height_px, length_ft: order.length_ft,
    copies: 1, name: 'Sheet 1', layout: order.layout || null }] : [];
}

export function selectOrderSheet(order, value) {
  const index = value === undefined ? 0 : Number(value);
  if (!Number.isSafeInteger(index) || index < 0) return null;
  return orderSheets(order)[index] || null;
}
