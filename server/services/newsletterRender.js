// TSB Newsletter renderer — turns a block list (jsonb from `newsletters`)
// into email-safe HTML. Design is fixed here; admins edit only content.
//
// Email constraints honored: table layout, inline styles, 640px shell,
// bgcolor attributes for Outlook, no JS, no external CSS, emoji or hosted
// images for icons, alt text everywhere. Tracking/unsubscribe are NOT
// rendered here — sendNewsletterEmail() injects them per recipient using
// the existing campaign infrastructure.

const RED = '#ea580c'; // TSB brand orange (was red)
const DARK = '#111111';
const CHARCOAL = '#1f2937';
const GRAY = '#6b7280';
const LIGHT = '#f4f4f5';
const WIDTH = 640;

// Theme tokens — templates vary these; everything else is fixed design.
// Resolved into module-level T at the top of renderNewsletterHtml (the
// render pass is synchronous, so this cannot race).
export const DEFAULT_THEME = {
  primary: RED,        // CTAs, underlines, highlights
  heading: DARK,       // headings on light surfaces
  heroBg: DARK,        // hero panel background
  specialBg: CHARCOAL, // promo panel background
  footerBg: DARK,
  background: LIGHT,   // page background
  surface: '#ffffff',  // card background
  script: RED,         // handwritten accents on light surfaces
};
let T = { ...DEFAULT_THEME };

const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";
const SCRIPT_FONT = "'Brush Script MT', 'Segoe Script', 'Comic Sans MS', cursive";

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => (
    ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
  ));
}
const e = escapeHtml;

// Only allow http(s) or site-relative CTA destinations.
export function safeUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return `https://tshirtbrothers.com${s}`;
  return '';
}

function btn(label, url, { bg = undefined, color = '#ffffff', size = 15 } = {}) {
  const href = safeUrl(url);
  if (!label || !href) return '';
  if (!bg) bg = T.primary;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;">
      <tr><td bgcolor="${bg}" style="border-radius:8px;">
        <a href="${e(href)}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:${size}px;font-weight:bold;color:${color};text-decoration:none;letter-spacing:0.04em;">${e(label)} &rarr;</a>
      </td></tr>
    </table>`;
}

function scriptNote(text, { color = undefined, size = 22 } = {}) {
  if (!color) color = T.script;
  if (!text) return '';
  const lines = String(text).split('\n').map((l) => e(l)).join('<br/>');
  return `<div style="font-family:${SCRIPT_FONT};font-size:${size}px;line-height:1.35;color:${color};">${lines}</div>`;
}

function sectionTitle(title) {
  return `
    <div style="font-family:${FONT};font-size:24px;font-weight:800;color:${T.heading};letter-spacing:0.01em;">${e(title)}</div>
    <div style="width:56px;height:4px;background:${T.primary};border-radius:2px;margin:8px 0 0;"></div>`;
}

function iconCell(item, { size = 34 } = {}) {
  if (item.image_url) {
    return `<img src="${e(item.image_url)}" alt="${e(item.title || '')}" width="${size}" height="${size}" style="display:inline-block;width:${size}px;height:${size}px;object-fit:contain;" />`;
  }
  return `<span style="font-size:${size - 4}px;line-height:1;">${e(item.icon || '⭐')}</span>`;
}

// Rounded white card wrapper on the light page background.
function card(inner, { pad = 28, bg = undefined } = {}) {
  if (!bg) bg = T.surface;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
      <tr><td bgcolor="${bg}" style="border-radius:14px;padding:${pad}px;">${inner}</td></tr>
    </table>`;
}

/* ── Block renderers ────────────────────────────────────────────────────── */

function renderHeader(d) {
  return card(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="stk" valign="middle">
        <table role="presentation" cellpadding="0" cellspacing="0" align="left" class="mob-center" style="margin:0;"><tr>
          ${d.logo_url ? `<td valign="middle" style="padding-right:12px;"><img src="${e(d.logo_url)}" alt="${e(d.company || 'T-Shirt Brothers')}" width="52" style="display:block;width:52px;" /></td>` : ''}
          <td valign="middle">
            <div style="font-family:${FONT};font-size:24px;font-weight:900;color:${T.heading};letter-spacing:0.01em;">${e(d.company || 'T-SHIRT BROTHERS').replace(/BROTHERS/, `<span style="color:${T.primary};">BROTHERS</span>`)}</div>
            ${d.subtitle ? `<div style="font-family:${FONT};font-size:12px;font-weight:bold;color:${GRAY};margin-top:2px;">${e(d.subtitle)}</div>` : ''}
          </td>
        </tr></table>
      </td>
      <td class="mob-hide" valign="middle" align="right" style="padding-left:12px;">
        ${d.right_image_url ? `<img src="${e(d.right_image_url)}" alt="" width="90" style="display:inline-block;width:90px;" />` : scriptNote(d.right_message, { size: 19 })}
      </td>
    </tr></table>`, { pad: 20 });
}

function renderHero(d) {
  const bg = d.image_url;
  const inner = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="stk">
        ${d.eyebrow ? `<div style="font-family:${FONT};font-size:12px;font-weight:bold;letter-spacing:0.28em;color:#e5e7eb;margin:0 0 12px;">${e(d.eyebrow)}</div>` : ''}
        <div style="font-family:${FONT};font-size:42px;line-height:1.02;font-weight:900;color:#ffffff;">${e(d.headline || '')}</div>
        ${d.highlight ? `<div style="font-family:${SCRIPT_FONT};font-size:46px;line-height:1.05;color:${T.primary};margin:2px 0 0;">${e(d.highlight)}</div>` : ''}
        ${d.body ? `<div style="font-family:${FONT};font-size:15px;line-height:1.6;color:#d1d5db;margin:16px 0 0;max-width:420px;">${e(d.body)}</div>` : ''}
        <div style="margin:22px 0 0;">${btn(d.cta_label, d.cta_url)}</div>
        ${d.tagline ? `<div style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:0.24em;color:#9ca3af;margin:18px 0 0;">${e(d.tagline)}</div>` : ''}
      </td>
      ${d.side_note ? `<td class="stk stk-right" valign="top" align="right" style="padding-left:12px;">${scriptNote(d.side_note, { color: '#ffffff', size: 20 })}</td>` : ''}
    </tr></table>
    ${bg ? `<img src="${e(bg)}" alt="${e(d.image_alt || d.headline || 'Featured apparel')}" width="${WIDTH - 56}" style="display:block;width:100%;border-radius:10px;margin:22px 0 0;" />` : ''}`;
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
      <tr><td bgcolor="${T.heroBg}" style="border-radius:14px;padding:28px;">${inner}</td></tr>
    </table>`;
}

function renderEvents(d) {
  const items = (d.items || []).slice(0, 6);
  const cols = items.map((it) => `
    <td class="stk" valign="top" align="center" width="${Math.floor(100 / Math.max(items.length, 1))}%" style="padding:10px 8px;border-left:1px solid #e5e7eb;">
      <div>${iconCell(it)}</div>
      <div style="font-family:${FONT};font-size:14px;font-weight:800;color:${T.heading};margin:8px 0 4px;">${it.url ? `<a href="${e(safeUrl(it.url))}" style="color:${T.heading};text-decoration:none;">${e(it.title || '')}</a>` : e(it.title || '')}</div>
      ${it.date ? `<div style="font-family:${FONT};font-size:11px;font-weight:bold;color:${T.primary};margin:0 0 3px;">${e(it.date)}</div>` : ''}
      ${it.description ? `<div style="font-family:${FONT};font-size:12px;line-height:1.5;color:${GRAY};">${e(it.description)}</div>` : ''}
    </td>`).join('');
  return card(`
    ${sectionTitle(d.title || "WHAT'S COMING UP?")}
    ${d.intro ? `<div style="font-family:${FONT};font-size:14px;color:${GRAY};margin:12px 0 0;">${e(d.intro)}</div>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;"><tr>${cols}</tr></table>
    ${d.cta_label ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0;"><tr>
        <td align="center">
          ${btn(d.cta_label, d.cta_url)}
          ${d.cta_note ? `<div style="font-family:${FONT};font-size:11px;font-weight:bold;letter-spacing:0.2em;color:${GRAY};margin:10px 0 0;">${e(d.cta_note)}</div>` : ''}
        </td>
      </tr></table>` : ''}`);
}

function renderProducts(d) {
  const items = (d.items || []).slice(0, 3);
  const cols = items.map((p) => {
    const href = safeUrl(p.cta_url || '/shop');
    return `
    <td class="stk" valign="top" width="${Math.floor(100 / Math.max(items.length, 1))}%" style="padding:6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;">
        <tr><td style="padding:14px;" align="center">
          ${p.image_url ? `<a href="${e(href)}"><img src="${e(p.image_url)}" alt="${e(p.name || 'Product')}" width="150" style="display:inline-block;width:100%;max-width:150px;border-radius:8px;" /></a>` : ''}
          <div style="font-family:${FONT};font-size:15px;font-weight:800;color:${T.heading};margin:10px 0 4px;">${e(p.name || '')}</div>
          ${p.description ? `<div style="font-family:${FONT};font-size:12px;line-height:1.5;color:${GRAY};">${e(p.description)}</div>` : ''}
          ${p.price ? `<div style="font-family:${FONT};font-size:13px;font-weight:bold;color:${T.primary};margin:6px 0 0;">${e(p.price)}</div>` : ''}
          <div style="margin:10px 0 2px;"><a href="${e(href)}" style="font-family:${FONT};font-size:13px;font-weight:bold;color:${T.primary};text-decoration:none;">${e(p.cta_label || 'Shop now')} &rarr;</a></div>
        </td></tr>
      </table>
    </td>`;
  }).join('');
  return card(`
    ${sectionTitle(d.title || 'FEATURED PRODUCTS')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 0;"><tr>${cols}</tr></table>`);
}

function renderDidYouKnow(d) {
  const items = (d.items || []).slice(0, 6);
  const cols = items.map((it) => `
    <td class="stk-half" valign="top" align="center" style="padding:8px 6px;">
      <div>${iconCell(it, { size: 30 })}</div>
      <div style="font-family:${FONT};font-size:12px;font-weight:800;color:${T.heading};margin:6px 0 0;white-space:nowrap;">${it.url ? `<a href="${e(safeUrl(it.url))}" style="color:${T.heading};text-decoration:none;">${e(it.title || '')}</a>` : e(it.title || '')}</div>
      ${it.description ? `<div style="font-family:${FONT};font-size:11px;color:${GRAY};margin:2px 0 0;">${e(it.description)}</div>` : ''}
    </td>`).join('');
  return card(`
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td class="stk" valign="top">
        ${sectionTitle(d.title || 'DID YOU KNOW?')}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 0;"><tr>${cols}</tr></table>
      </td>
      ${d.right_message ? `<td class="stk stk-right" valign="middle" align="right" style="padding-left:14px;">${scriptNote(d.right_message, { size: 20 })}</td>` : ''}
    </tr></table>
    ${d.cta_label ? `<div style="margin:16px 0 0;" align="center">${btn(d.cta_label, d.cta_url)}</div>` : ''}`);
}

function renderSpecial(d) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
      <tr><td bgcolor="${T.specialBg}" style="border-radius:14px;padding:28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td class="stk" valign="middle">
            <div style="font-family:${FONT};font-size:28px;font-weight:900;color:#ffffff;">
              ${e(d.headline || '')} ${d.highlight ? `<span style="font-family:${SCRIPT_FONT};font-weight:normal;font-size:32px;color:${T.primary};">${e(d.highlight)}</span>` : ''}
            </div>
            ${d.description ? `<div style="font-family:${FONT};font-size:14px;line-height:1.6;color:#d1d5db;margin:10px 0 0;max-width:340px;">${e(d.description)}</div>` : ''}
            ${d.coupon_code ? `<div style="font-family:${FONT};font-size:13px;font-weight:bold;color:#ffffff;background:#374151;display:inline-block;padding:6px 14px;border-radius:6px;margin:12px 0 0;letter-spacing:0.12em;">CODE: ${e(d.coupon_code)}</div>` : ''}
            <div style="margin:18px 0 0;">${btn(d.cta_label, d.cta_url)}</div>
            ${d.expires ? `<div style="font-family:${FONT};font-size:11px;color:#9ca3af;margin:12px 0 0;">${e(d.expires)}</div>` : ''}
            ${d.terms ? `<div style="font-family:${FONT};font-size:10px;color:#6b7280;margin:6px 0 0;">${e(d.terms)}</div>` : ''}
          </td>
          <td class="stk stk-right" valign="middle" align="right" style="padding-left:14px;" width="220">
            ${d.image_url ? `<img src="${e(d.image_url)}" alt="${e(d.image_alt || 'Special offer')}" width="200" style="display:inline-block;width:200px;border-radius:10px;" />` : ''}
            ${d.note ? `<div style="margin:10px 0 0;">${scriptNote(d.note, { color: '#ffffff', size: 18 })}</div>` : ''}
          </td>
        </tr></table>
      </td></tr>
    </table>`;
}

function renderClosing(d) {
  const buttons = (d.buttons || []).slice(0, 3).map((b, i) =>
    `<span style="display:inline-block;margin:4px 6px 4px 0;">${btn(b.label, b.url, i === 0 ? {} : { bg: T.heading })}</span>`).join('');
  const values = (d.values || []).slice(0, 3).map((v) => `
    <td align="center" valign="top" style="padding:8px 10px;border-left:1px solid #e5e7eb;">
      <div style="font-size:22px;line-height:1;">${e(v.icon || '★')}</div>
      <div style="font-family:${FONT};font-size:10px;font-weight:800;letter-spacing:0.14em;color:${CHARCOAL};margin:6px 0 0;">${e(v.title || '')}</div>
    </td>`).join('');
  return card(`
    ${sectionTitle(d.headline || 'WHAT ARE YOU PRINTING NEXT?')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;"><tr>
      <td class="stk" valign="middle">${buttons}</td>
      ${values ? `<td class="stk stk-right" valign="middle" align="right"><table role="presentation" cellpadding="0" cellspacing="0" class="mob-center"><tr>${values}</tr></table></td>` : ''}
    </tr></table>`);
}

function renderFooter(d) {
  const socials = [
    ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'],
  ].filter(([k]) => d[k]).map(([k, label]) =>
    `<a href="${e(safeUrl(d[k]))}" style="font-family:${FONT};font-size:12px;font-weight:bold;color:#ffffff;text-decoration:underline;margin-left:10px;">${label}</a>`).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td bgcolor="${T.footerBg}" style="border-radius:14px;padding:24px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td class="stk" valign="middle">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              ${d.logo_url ? `<td valign="middle" style="padding-right:10px;"><img src="${e(d.logo_url)}" alt="" width="40" style="display:block;width:40px;" /></td>` : ''}
              <td valign="middle">
                <div style="font-family:${FONT};font-size:16px;font-weight:900;color:#ffffff;">${e(d.company || 'T-Shirt Brothers')}</div>
                ${d.tagline ? `<div style="font-family:${FONT};font-size:11px;color:#9ca3af;">${e(d.tagline)}</div>` : ''}
              </td>
            </tr></table>
          </td>
          <td class="stk stk-right" valign="middle" align="right">${socials}</td>
        </tr></table>
        <div style="border-top:1px solid #374151;margin:16px 0 0;padding:14px 0 0;font-family:${FONT};font-size:12px;line-height:1.9;color:#d1d5db;">
          ${d.email ? `✉️ <a href="mailto:${e(d.email)}" style="color:#d1d5db;text-decoration:none;">${e(d.email)}</a> &nbsp; ` : ''}
          ${d.phone ? `📞 <a href="tel:${e(String(d.phone).replace(/[^+\d]/g, ''))}" style="color:#d1d5db;text-decoration:none;">${e(d.phone)}</a> &nbsp; ` : ''}
          ${d.website ? `🌐 <a href="${e(safeUrl(d.website))}" style="color:#d1d5db;text-decoration:none;">${e(String(d.website).replace(/^https?:\/\//, ''))}</a>` : ''}
          ${d.address ? `<br/>📍 ${e(d.address)}` : ''}
        </div>
      </td></tr>
    </table>`;
}

const RENDERERS = {
  header: renderHeader,
  hero: renderHero,
  events: renderEvents,
  products: renderProducts,
  didyouknow: renderDidYouKnow,
  special: renderSpecial,
  closing: renderClosing,
  footer: renderFooter,
};

export const BLOCK_TYPES = Object.keys(RENDERERS);

/**
 * Render the full newsletter document.
 * `extras.unsubHtml` / `extras.openPixelHtml` are appended by the sender —
 * pass nothing for admin previews.
 */
// Some email clients (and proxies) ignore <meta charset> and decode the
// body as Latin-1, turning "\u2022" into mojibake and mangling emoji.
// Encoding every non-ASCII code point as a numeric entity makes the
// document charset-proof — entities decode identically everywhere.
function entityEncodeNonAscii(html) {
  return html.replace(/[\u0080-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]/g,
    (ch) => `&#${ch.codePointAt(0)};`);
}

export function renderNewsletterHtml(blocks, { preheader = '', unsubHtml = '', openPixelHtml = '', theme = {} } = {}) {
  T = { ...DEFAULT_THEME, ...(theme && typeof theme === 'object' ? theme : {}) };
  const body = (blocks || [])
    .filter((b) => b && b.enabled !== false && RENDERERS[b.type])
    .map((b) => RENDERERS[b.type](b.data || {}))
    .join('\n');

  return entityEncodeNonAscii(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>T-Shirt Brothers</title>
<style>
@media only screen and (max-width:640px) {
  .stk { display:block !important; width:100% !important; box-sizing:border-box !important;
         border-left:none !important; padding:10px 0 !important; }
  .stk-half { display:inline-block !important; width:46% !important; box-sizing:border-box !important;
              border-left:none !important; padding:10px 2% !important; }
  .stk-right { text-align:left !important; padding-left:0 !important; padding-top:14px !important; }
  .mob-center { text-align:center !important; }
  .mob-hide { display:none !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${T.background};">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${T.background};">${e(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${T.background}">
  <tr><td align="center" style="padding:18px 10px;">
    <table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" style="width:100%;max-width:${WIDTH}px;">
      <tr><td>
${body}
${unsubHtml}
${openPixelHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`);
}

/**
 * Validate a newsletter before send. Returns array of human messages;
 * empty array means good to go.
 */
export function validateNewsletter({ subject, blocks }) {
  const errors = [];
  if (!String(subject || '').trim()) errors.push('Email subject is required.');
  const enabled = (blocks || []).filter((b) => b && b.enabled !== false);
  if (enabled.length === 0) errors.push('The newsletter has no enabled blocks.');
  for (const b of enabled) {
    const d = b.data || {};
    if (b.type === 'hero') {
      if (!String(d.headline || '').trim()) errors.push('Hero: headline is required.');
      if (d.cta_label && !safeUrl(d.cta_url)) errors.push('Hero: CTA has a label but no valid URL.');
    }
    if (b.type === 'events' && d.cta_label && !safeUrl(d.cta_url)) errors.push("What's Coming Up: CTA has a label but no valid URL.");
    if (b.type === 'special' && d.cta_label && !safeUrl(d.cta_url)) errors.push('Customer Special: CTA has a label but no valid URL.');
    if (b.type === 'closing') {
      for (const btn2 of d.buttons || []) {
        if (btn2.label && !safeUrl(btn2.url)) errors.push(`Closing CTA "${btn2.label}": missing or invalid URL.`);
      }
    }
  }
  return errors;
}

/** The polished default TSB newsletter, pre-filled with sample content. */
export function defaultBlocks() {
  const id = (() => { let n = 0; return () => `blk-${++n}`; })();
  const LOGO = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png';
  return [
    { id: id(), type: 'header', enabled: true, data: {
      logo_url: LOGO,
      company: 'T-SHIRT BROTHERS',
      subtitle: 'Best Printing. Best Service!',
      right_message: 'People.\nShirts.\nCommunities.\nStronger Together.',
    } },
    { id: id(), type: 'hero', enabled: true, data: {
      eyebrow: 'SAME PEOPLE. BIGGER IDEAS.',
      headline: 'FALL ORDERS',
      highlight: 'Start Now',
      body: 'Get custom shirts, hoodies, hats, and more for homecoming, reunions, churches, schools, teams, and businesses.',
      image_url: '',
      image_alt: 'Custom fall apparel',
      cta_label: 'GET A QUICK QUOTE',
      cta_url: '/quote',
      tagline: 'CUSTOM GEAR FOR THE MOMENTS THAT MATTER.',
      side_note: 'Fall Looks\nBetter Together.',
    } },
    { id: id(), type: 'events', enabled: true, data: {
      title: "WHAT'S COMING UP?",
      items: [
        { icon: '📣', title: 'Homecoming', description: 'Alumni shirts, class-year shirts, tailgate gear' },
        { icon: '🎃', title: 'Halloween', description: 'Event shirts, themed apparel, staff tees' },
        { icon: '🇺🇸', title: 'Veterans Day', description: 'Military appreciation and family shirts' },
        { icon: '⛪', title: 'Church & School Events', description: 'Program shirts, polos, and hoodies' },
      ],
      cta_label: 'PLAN YOUR ORDER',
      cta_url: '/quote',
      cta_note: 'BIG EVENTS. BIGGER MEMORIES.',
    } },
    { id: id(), type: 'products', enabled: true, data: {
      title: 'FEATURED PRODUCTS',
      items: [
        { name: 'Premium T-Shirts', description: 'Great for events and organizations', image_url: '', cta_label: 'Shop tees', cta_url: '/shop?category=T-Shirts' },
        { name: 'Embroidered Caps', description: 'Perfect for brands, teams, and staff', image_url: '', cta_label: 'Shop caps', cta_url: '/shop?category=Headwear' },
        { name: 'Hoodies & Sweatshirts', description: 'Ideal for fall weather', image_url: '', cta_label: 'Shop hoodies', cta_url: '/shop?category=Fleece' },
      ],
    } },
    { id: id(), type: 'didyouknow', enabled: true, data: {
      title: 'DID YOU KNOW?',
      items: [
        { icon: '🧵', title: 'Embroidery' },
        { icon: '📄', title: 'DTF Transfers' },
        { icon: '👕', title: 'Custom Jerseys' },
        { icon: '✏️', title: 'Design Help' },
        { icon: '📦', title: 'Bulk Orders' },
      ],
      right_message: 'Your Vision.\nOur Brotherly Support.',
    } },
    { id: id(), type: 'special', enabled: true, data: {
      headline: 'PAST CUSTOMER',
      highlight: 'Special',
      description: 'Free basic artwork setup on qualifying orders placed this month.',
      image_url: '',
      cta_label: 'CLAIM OFFER',
      cta_url: '/quote',
      note: 'Thanks for being part of\nthe T-Shirt Brothers family!',
    } },
    { id: id(), type: 'closing', enabled: true, data: {
      headline: 'WHAT ARE YOU PRINTING NEXT?',
      buttons: [
        { label: 'QUICK QUOTE', url: '/quote' },
        { label: 'DESIGN STUDIO', url: '/design' },
      ],
      values: [
        { icon: '🏆', title: 'QUALITY APPAREL' },
        { icon: '🤝', title: 'REAL PEOPLE' },
        { icon: '❤️', title: 'STRONGER COMMUNITIES' },
      ],
    } },
    { id: id(), type: 'footer', enabled: true, data: {
      logo_url: LOGO,
      company: 'T-Shirt Brothers',
      tagline: 'Custom Apparel for a Brighter Tomorrow.',
      email: 'kevin@tshirtbrothers.com',
      phone: '(470) 622-1392',
      website: 'https://tshirtbrothers.com',
      address: '6010 Renaissance Pkwy, Fairburn, GA 30213',
      facebook: '', instagram: '', tiktok: '', youtube: '',
    } },
  ];
}
