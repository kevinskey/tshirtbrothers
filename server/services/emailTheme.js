// Shared branded email design system — the TSB customer-facing template
// look (2026-09 redesign): navy hero, orange accents, info panels, product
// tables, financial summary, coupon panel, branded footer. Used by the
// quote, invoice, and paid-receipt templates so they stay consistent.
//
// Email-safe rules observed throughout: tables + inline styles only, a
// single <style> block for mobile stacking (progressive enhancement — the
// desktop layout survives clients that strip it), no flex/grid, real text
// everywhere so the message reads with images blocked.
import pool from '../db.js';

export const ORANGE = '#f97316';
export const NAVY = '#0f172a';
export const NAVY_SOFT = '#1e293b';
export const INK = '#111827';
export const GRAY = '#6b7280';
export const LIGHT = '#f8fafc';
export const LINE = '#e5e7eb';
export const CREAM = '#fff4ec';

export const LOGO_URL = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png';
export const SHOP_ADDRESS_LINES = ['6010 Renaissance Parkway', 'Fairburn, GA 30213'];
export const SHOP_PHONE = '(470) 622-1392';
export const SHOP_EMAIL = 'info@tshirtbrothers.com';
export const SHOP_SITE = 'www.tshirtbrothers.com';
export const SHOP_HOURS_LINES = ['Mon – Sat: 8:00 AM – 8:00 PM', 'Sun: Closed'];

export function money(v) {
  return `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
export { esc as escapeHtml };

// ── Building blocks ─────────────────────────────────────────────────────────

// Logo lockup: real splat logo + wordmark as live text.
export function brandLockup({ dark = false, size = 'lg' } = {}) {
  const nameColor = dark ? '#ffffff' : NAVY;
  const h = size === 'lg' ? 54 : 42;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;padding-right:12px;"><img src="${LOGO_URL}" alt="TSB" width="${h}" style="display:block;height:${h}px;width:${h}px;" /></td>
    <td style="vertical-align:middle;border-left:3px solid ${ORANGE};padding-left:12px;">
      <div style="font-size:${size === 'lg' ? 20 : 16}px;font-weight:800;letter-spacing:0.5px;color:${nameColor};line-height:1.15;">T-SHIRT<br/>BROTHERS</div>
      <div style="font-size:8px;letter-spacing:2px;color:${dark ? '#94a3b8' : GRAY};margin-top:3px;">CUSTOM APPAREL. STRONGER TOGETHER.</div>
    </td>
  </tr></table>`;
}

export function statusPill(text, tone = 'orange') {
  const bg = tone === 'green' ? '#16a34a' : tone === 'navy' ? NAVY : ORANGE;
  return `<span style="display:inline-block;background:${bg};color:#ffffff;font-size:13px;font-weight:700;padding:8px 18px;border-radius:999px;white-space:nowrap;">&#10003;&nbsp; ${esc(text)}</span>`;
}

// Header band: lockup left, document meta + status pill right.
export function docHeader({ metaLines = [], pill = null } = {}) {
  const meta = metaLines.filter(Boolean).map(
    (l) => `<div style="font-size:13px;color:${GRAY};line-height:1.5;">${l}</div>`,
  ).join('');
  return `
  <tr><td style="padding:26px 32px 20px;background:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:middle;">${brandLockup()}</td>
      <td style="vertical-align:middle;text-align:right;">
        ${meta}
        ${pill ? `<div style="margin-top:8px;">${pill}</div>` : ''}
      </td>
    </tr></table>
  </td></tr>`;
}

// Navy hero: headline with an orange accent phrase, script flourish, intro copy.
export function hero({ titleTop, titleAccent, greeting, copy }) {
  return `
  <tr><td style="background:${NAVY};padding:36px 32px;border-radius:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="vertical-align:top;">
        <div style="font-size:32px;line-height:1.15;font-weight:800;color:#ffffff;">${esc(titleTop)}<br/><span style="color:${ORANGE};">${esc(titleAccent)}</span></div>
        ${greeting ? `<p style="margin:18px 0 0;font-size:15px;font-weight:700;color:#ffffff;">${esc(greeting)}</p>` : ''}
        ${copy ? `<p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#cbd5e1;max-width:420px;">${copy}</p>` : ''}
      </td>
      <td width="120" style="vertical-align:top;text-align:right;">
        <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:17px;color:#ffffff;white-space:nowrap;">More Than Shirts.</div>
        <div style="margin-top:14px;display:inline-block;border:2px solid ${ORANGE};border-radius:8px;padding:8px 10px;">
          <div style="font-size:16px;font-weight:800;color:#ffffff;letter-spacing:1px;">TSB</div>
          <div style="font-size:8px;font-weight:700;color:#cbd5e1;letter-spacing:1px;line-height:1.4;">GOOD PEOPLE<br/>GREAT <span style="color:${ORANGE};">SHIRTS</span></div>
        </div>
      </td>
    </tr></table>
  </td></tr>`;
}

// Section heading with the short orange underline from the references.
export function sectionTitle(text) {
  return `
  <div style="margin:0 0 4px;font-size:20px;font-weight:800;color:${INK};">${esc(text)}</div>
  <div style="width:44px;height:4px;background:${ORANGE};border-radius:2px;margin:0 0 16px;"></div>`;
}

// Info panel grid — [{label, lines:[..]}, ...]; stacks on mobile.
export function infoPanels(items) {
  const cells = items.filter((i) => i && i.lines && i.lines.filter(Boolean).length).map((i) => `
    <td class="stack" width="33%" style="vertical-align:top;padding:10px 14px;">
      <div style="font-size:12px;font-weight:800;color:${INK};">${esc(i.label)}</div>
      ${i.lines.filter(Boolean).map((l) => `<div style="font-size:13px;color:${GRAY};line-height:1.5;">${l}</div>`).join('')}
    </td>`);
  const rows = [];
  for (let i = 0; i < cells.length; i += 3) rows.push(`<tr>${cells.slice(i, i + 3).join('')}</tr>`);
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${LIGHT};border:1px solid ${LINE};border-radius:12px;padding:8px;">
    ${rows.join('')}
  </table>`;
}

// Product/items table. rows: [{img, name, detail, color, size, qty, unit, subtotal}]
export function itemsTable(rows, { unitLabel = 'Unit Price' } = {}) {
  const th = (t, align = 'left', w = '') => `<th ${w ? `width="${w}"` : ''} style="background:${NAVY};color:#ffffff;font-size:12px;font-weight:700;padding:10px 10px;text-align:${align};">${t}</th>`;
  const body = rows.map((r, i) => `
    <tr style="background:${i % 2 ? LIGHT : '#ffffff'};">
      <td style="padding:10px;border-bottom:1px solid ${LINE};">
        ${r.img ? `<img src="${r.img}" alt="" width="44" style="display:inline-block;vertical-align:middle;width:44px;height:44px;object-fit:contain;border-radius:6px;background:#f3f4f6;margin-right:10px;" />` : ''}
        <span style="display:inline-block;vertical-align:middle;">
          <span style="display:block;font-size:13px;font-weight:700;color:${INK};">${esc(r.name)}</span>
          ${r.detail ? `<span style="display:block;font-size:11px;color:${GRAY};">${esc(r.detail)}</span>` : ''}
        </span>
      </td>
      <td style="padding:10px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};">${esc(r.color || '—')}</td>
      <td style="padding:10px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};text-align:center;">${esc(r.size || '—')}</td>
      <td style="padding:10px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};text-align:center;">${r.qty}</td>
      <td style="padding:10px;border-bottom:1px solid ${LINE};font-size:12px;color:${INK};text-align:right;">${money(r.unit)}</td>
      <td style="padding:10px;border-bottom:1px solid ${LINE};font-size:13px;font-weight:700;color:${INK};text-align:right;">${money(r.subtotal)}</td>
    </tr>`).join('');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${LINE};border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;">
    <tr>${th('Product')}${th('Color', 'left', 90)}${th('Size', 'center', 50)}${th('Qty', 'center', 44)}${th(unitLabel, 'right', 80)}${th('Subtotal', 'right', 84)}</tr>
    ${body}
  </table>`;
}

// Financial summary. rows: [{label, value, color?}], total: {label, value}
export function summaryTable(rows, total) {
  const body = rows.filter(Boolean).map((r) => `
    <tr>
      <td style="padding:6px 0;font-size:14px;color:${r.color || GRAY};">${r.label}</td>
      <td style="padding:6px 0;font-size:14px;color:${r.color || INK};text-align:right;font-weight:${r.bold ? 700 : 400};">${r.value}</td>
    </tr>`).join('');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    ${body}
    <tr>
      <td style="padding:12px 14px;font-size:17px;font-weight:800;color:${INK};background:#eef2f7;border-radius:8px 0 0 8px;">${esc(total.label)}</td>
      <td style="padding:12px 14px;font-size:19px;font-weight:800;color:${total.color || INK};background:#eef2f7;text-align:right;border-radius:0 8px 8px 0;">${total.value}</td>
    </tr>
  </table>`;
}

// Next-order coupon panel driven by the live promotions table.
export function couponPanel(promo) {
  if (!promo) return '';
  const offer = promo.discount_type === 'percent'
    ? `Save ${Number(promo.discount_value)}%`
    : `Save ${money(promo.discount_value)}`;
  const restrictions = [
    promo.expires_at ? `Valid through ${fmtDate(promo.expires_at)}.` : null,
    Number(promo.min_order_amount) > 0 ? `Orders over ${money(promo.min_order_amount)}.` : null,
    'One use per customer.',
  ].filter(Boolean).join(' ');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};border:1px solid #fed7aa;border-radius:12px;">
    <tr><td style="padding:20px 22px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:2px;color:${INK};">&#127991;&nbsp; A LITTLE THANK YOU</div>
      <div style="font-size:24px;font-weight:800;color:${ORANGE};margin-top:4px;">${esc(offer)} <span style="color:${INK};">on your next order!</span></div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;"><tr>
        <td class="stack" style="vertical-align:middle;">
          <div style="display:inline-block;border:2px dashed ${ORANGE};border-radius:10px;padding:10px 22px;background:#ffffff;text-align:center;">
            <div style="font-size:11px;color:${GRAY};">Use code:</div>
            <div style="font-size:22px;font-weight:800;color:${ORANGE};letter-spacing:1px;">${esc(promo.code)}</div>
          </div>
        </td>
        <td class="stack" style="vertical-align:middle;padding-left:16px;">
          <div style="font-size:13px;color:${INK};font-weight:600;">${esc(promo.headline || 'Good for your next custom apparel order.')}</div>
          <div style="font-size:12px;color:${GRAY};margin-top:4px;">${esc(restrictions)}</div>
        </td>
      </tr></table>
    </td></tr>
  </table>`;
}

// Big action buttons. buttons: [{label, href, style: 'primary'|'navy'|'outline'}]
export function buttonRow(buttons) {
  const btn = (b) => {
    const base = 'display:block;text-align:center;padding:15px 18px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;';
    const styles = b.style === 'navy'
      ? `background:${NAVY};color:#ffffff;`
      : b.style === 'outline'
      ? `background:#ffffff;color:${INK};border:2px solid ${LINE};`
      : `background:${ORANGE};color:#ffffff;`;
    return `<td class="stack" style="padding:6px;vertical-align:top;"><a href="${b.href}" target="_blank" style="${base}${styles}">${b.label}</a></td>`;
  };
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${buttons.map(btn).join('')}</tr></table>`;
}

// Follow-up cards (review / photo). card: {icon, heading, copy, button:{label, href}, link}
export function followUpCard({ icon, heading, copy, button, link, tone = 'cream' }) {
  const bg = tone === 'blue' ? '#eff6ff' : CREAM;
  const border = tone === 'blue' ? '#bfdbfe' : '#fed7aa';
  return `
  <td class="stack" width="50%" style="vertical-align:top;padding:6px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};border:1px solid ${border};border-radius:12px;"><tr><td style="padding:18px 20px;">
      <div style="font-size:15px;font-weight:800;color:${INK};">${icon}&nbsp; ${esc(heading)}</div>
      <p style="margin:8px 0 14px;font-size:13px;color:${GRAY};line-height:1.55;">${esc(copy)}</p>
      <a href="${button.href}" target="_blank" style="display:inline-block;background:${ORANGE};color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;padding:11px 18px;border-radius:9px;">${esc(button.label)}</a>
      ${link ? `<div style="margin-top:10px;"><a href="${link}" target="_blank" style="font-size:12px;color:${ORANGE};">${esc(link.replace(/^https?:\/\//, ''))}</a></div>` : ''}
    </td></tr></table>
  </td>`;
}

// Branded navy footer with the real business settings.
export function brandFooter() {
  return `
  <tr><td style="background:${NAVY};padding:28px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="stack" style="vertical-align:top;">${brandLockup({ dark: true, size: 'sm' })}</td>
      <td class="stack" style="vertical-align:top;padding:4px 10px;">
        ${SHOP_ADDRESS_LINES.map((l) => `<div style="font-size:12px;color:#cbd5e1;line-height:1.6;">${l}</div>`).join('')}
        <div style="font-size:12px;color:#cbd5e1;line-height:1.6;">${SHOP_PHONE}</div>
        <div style="font-size:12px;line-height:1.6;"><a href="mailto:${SHOP_EMAIL}" style="color:#cbd5e1;text-decoration:none;">${SHOP_EMAIL}</a></div>
        <div style="font-size:12px;line-height:1.6;"><a href="https://${SHOP_SITE}" style="color:#cbd5e1;text-decoration:none;">${SHOP_SITE}</a></div>
      </td>
      <td class="stack" style="vertical-align:top;padding:4px 0;">
        <div style="font-size:12px;font-weight:700;color:#ffffff;">&#128337;&nbsp; Business Hours</div>
        ${SHOP_HOURS_LINES.map((l) => `<div style="font-size:12px;color:#cbd5e1;line-height:1.6;">${l}</div>`).join('')}
      </td>
    </tr></table>
    <div style="margin-top:20px;padding-top:14px;border-top:1px solid ${NAVY_SOFT};text-align:center;font-size:10px;letter-spacing:2px;color:#64748b;">CUSTOM APPAREL. STRONGER TOGETHER.</div>
  </td></tr>`;
}

// Full page shell. sections is the array of <tr> strings between header and footer.
export function emailShell({ title, headerTr, sections }) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  @media only screen and (max-width: 540px) {
    .container { width: 100% !important; border-radius: 0 !important; }
    .stack { display: block !important; width: 100% !important; box-sizing: border-box; padding-left: 0 !important; }
    .pad { padding-left: 18px !important; padding-right: 18px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f5;padding:28px 0;">
<tr><td align="center">
<table role="presentation" width="640" class="container" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,0.12);">
  ${headerTr}
  ${sections.join('\n')}
  ${brandFooter()}
</table>
</td></tr>
</table>
</body></html>`;
}

// Standard white body section wrapper.
export function bodySection(inner) {
  return `<tr><td class="pad" style="padding:26px 32px 6px;background:#ffffff;">${inner}</td></tr>`;
}

// Live "next order" promotion — the most-soon-expiring active one, or null.
// Best effort: an email must never fail because the coupon lookup did.
export async function getActivePromotion() {
  try {
    const { rows } = await pool.query(
      `SELECT code, headline, subtext, discount_type, discount_value, min_order_amount, expires_at
         FROM promotions
        WHERE active = TRUE
          AND (starts_at IS NULL OR starts_at <= NOW())
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY expires_at ASC NULLS LAST
        LIMIT 1`,
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}
