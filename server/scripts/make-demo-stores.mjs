// Build 10 demo group stores with generated logo art composited onto real
// S&S garment photos. Run on the droplet from /var/www/tshirtbrothers/server:
//   node mkdemo.mjs          -> builds everything
//   node mkdemo.mjs test     -> renders one org's designs + 2 composites only
import 'dotenv/config';
import pkg from 'pg';
import sharp from 'sharp';
import { renderMockupComposite } from './services/composite.js';
import { uploadObject } from './services/spaces.js';
import { fetchStyleColors } from './services/ssActivewear.js';

const { Pool } = pkg;
const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const CDN = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com';

/* ── SVG logo templates ─────────────────────────────────────────────────
 * Each returns a full SVG string on a transparent 1800x1800 canvas.
 * `ink` is the main art color (light for dark garments, dark for light),
 * `accent` is the secondary color.
 */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Per-character arc text — librsvg on the droplet has no <textPath>
// support, so arcs are laid out manually: each character is positioned on
// the circle and rotated to the local tangent.
function arcText(str, { cx, cy, r, fontSize, fill, font = 'Liberation Sans', weight = 'bold', spacing = 1.28, bottom = false }) {
  const chars = [...str];
  const step = (fontSize * 0.62 * spacing) / r * (180 / Math.PI); // deg per char
  const total = step * (chars.length - 1);
  let out = '';
  chars.forEach((ch, i) => {
    const theta = -total / 2 + i * step;
    const rad = (theta * Math.PI) / 180;
    const x = cx + r * Math.sin(rad);
    const y = bottom ? cy + r * Math.cos(rad) : cy - r * Math.cos(rad);
    const rot = bottom ? -theta : theta;
    if (ch !== ' ') {
      out += `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" transform="rotate(${rot.toFixed(2)} ${x.toFixed(1)} ${y.toFixed(1)})" text-anchor="middle" font-family="${font}" font-weight="${weight}" font-size="${fontSize}" fill="${fill}">${esc(ch)}</text>`;
    }
  });
  return out;
}

function svgWrap(inner, w = 1800, h = 1800) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}

// Athletic arch: arched school name, huge mascot word, banner + est.
function tplArch({ top, main, banner, ink, accent }) {
  return svgWrap(`
    ${arcText(top, { cx: 900, cy: 2260, r: 1700, fontSize: 112, fill: ink })}
    <text x="900" y="1040" text-anchor="middle" font-family="Liberation Sans" font-weight="bold"
      font-size="${main.length > 8 ? 300 : 380}" letter-spacing="6"
      fill="${accent}" stroke="${ink}" stroke-width="14">${esc(main)}</text>
    <rect x="330" y="1150" width="1140" height="150" fill="${ink}" rx="8"/>
    <text x="900" y="1258" text-anchor="middle" font-family="Liberation Sans" font-weight="bold"
      font-size="92" letter-spacing="22" fill="${accent}">${esc(banner)}</text>
    <path d="M 200 1160 l 26 52 58 8 -42 41 10 57 -52 -27 -52 27 10 -57 -42 -41 58 -8 z" fill="${accent}"/>
    <path d="M 1560 1160 l 26 52 58 8 -42 41 10 57 -52 -27 -52 27 10 -57 -42 -41 58 -8 z" fill="${accent}"/>
  `);
}

// Circle crest: rings, circular text, giant monogram, year.
function tplCrest({ top, bottom, mono, year, ink, accent }) {
  return svgWrap(`
    <circle cx="900" cy="900" r="820" fill="none" stroke="${ink}" stroke-width="34"/>
    <circle cx="900" cy="900" r="740" fill="none" stroke="${ink}" stroke-width="10"/>
    <circle cx="900" cy="900" r="520" fill="none" stroke="${accent}" stroke-width="14"/>
    ${arcText(top, { cx: 900, cy: 900, r: 615, fontSize: 116, fill: ink, font: 'URW Bookman' })}
    ${arcText(bottom, { cx: 900, cy: 900, r: 640, fontSize: 104, fill: ink, font: 'URW Bookman', bottom: true })}
    <text x="900" y="1010" text-anchor="middle" font-family="URW Bookman" font-weight="bold"
      font-size="${mono.length > 2 ? 330 : 430}" fill="${ink}">${esc(mono)}</text>
    <text x="900" y="1240" text-anchor="middle" font-family="URW Bookman" font-size="96"
      letter-spacing="10" fill="${accent}">EST. ${year}</text>
    <circle cx="330" cy="900" r="22" fill="${accent}"/><circle cx="1470" cy="900" r="22" fill="${accent}"/>
  `);
}

// Script stack: elegant script name over letterspaced caps.
function tplScript({ script, caps, sub, ink, accent }) {
  return svgWrap(`
    <text x="900" y="820" text-anchor="middle" font-family="Z003" font-size="330" fill="${ink}">${esc(script)}</text>
    <rect x="360" y="930" width="1080" height="6" fill="${accent}"/>
    <text x="900" y="1075" text-anchor="middle" font-family="Liberation Sans" font-weight="bold"
      font-size="120" letter-spacing="42" fill="${ink}">${esc(caps)}</text>
    <text x="900" y="1200" text-anchor="middle" font-family="Liberation Sans" font-size="70"
      letter-spacing="26" fill="${accent}">${esc(sub)}</text>
  `);
}

// Outdoor badge: compass rose in a bordered roundel + name arcs.
function tplBadge({ top, bottom, center, ink, accent }) {
  const rose = `
    <g transform="translate(900 800) scale(0.82)">
      <path d="M 0 -300 L 55 -55 L 300 0 L 55 55 L 0 300 L -55 55 L -300 0 L -55 -55 Z" fill="${ink}"/>
      <path d="M 0 -300 L 55 -55 L 0 0 Z M 300 0 L 55 55 L 0 0 Z M 0 300 L -55 55 L 0 0 Z M -300 0 L -55 -55 L 0 0 Z" fill="${accent}"/>
      <circle r="52" fill="${ink}" stroke="${accent}" stroke-width="14"/>
    </g>`;
  return svgWrap(`
    <circle cx="900" cy="900" r="800" fill="none" stroke="${ink}" stroke-width="40" stroke-dasharray="4 38" stroke-linecap="round"/>
    <circle cx="900" cy="900" r="700" fill="none" stroke="${ink}" stroke-width="12"/>
    ${arcText(top, { cx: 900, cy: 900, r: 565, fontSize: 108, fill: ink })}
    ${arcText(bottom, { cx: 900, cy: 900, r: 590, fontSize: 96, fill: ink, bottom: true })}
    ${rose}
    <text x="900" y="1180" text-anchor="middle" font-family="Liberation Sans" font-weight="bold"
      font-size="116" letter-spacing="8" fill="${accent}">${esc(center)}</text>
  `);
}

// Corporate wordmark: chevron mark + bold name + thin division line.
function tplCorp({ name, sub, ink, accent }) {
  return svgWrap(`
    <g transform="translate(900 560)">
      <path d="M -170 120 L 0 -120 L 170 120 L 96 120 L 0 -14 L -96 120 Z" fill="${accent}"/>
      <path d="M -96 190 L 0 60 L 96 190 Z" fill="${ink}"/>
    </g>
    <text x="900" y="1010" text-anchor="middle" font-family="Nimbus Sans" font-weight="bold"
      font-size="${name.length > 12 ? 168 : 210}" letter-spacing="8" fill="${ink}">${esc(name)}</text>
    <rect x="470" y="1080" width="860" height="5" fill="${accent}"/>
    <text x="900" y="1190" text-anchor="middle" font-family="Nimbus Sans" font-size="78"
      letter-spacing="34" fill="${ink}">${esc(sub)}</text>
  `);
}

// Reunion: arched family name, huge year, banner.
function tplReunion({ family, year, place, ink, accent }) {
  return svgWrap(`
    ${arcText(family, { cx: 900, cy: 1960, r: 1400, fontSize: 112, fill: ink, font: 'URW Bookman', spacing: 1.12 })}
    <text x="900" y="1050" text-anchor="middle" font-family="Liberation Sans" font-weight="bold"
      font-size="400" fill="${accent}" stroke="${ink}" stroke-width="12">${esc(year)}</text>
    <rect x="360" y="1150" width="1080" height="140" fill="${ink}" rx="70"/>
    <text x="900" y="1240" text-anchor="middle" font-family="Liberation Sans" font-weight="bold"
      font-size="86" letter-spacing="16" fill="${accent}">${esc(place)}</text>
  `);
}

const TEMPLATES = { arch: tplArch, crest: tplCrest, script: tplScript, badge: tplBadge, corp: tplCorp, reunion: tplReunion };

/* ── The 10 organizations ──────────────────────────────────────────────── */
// inkLight/inkDark: art colors for dark vs light garments.

const TOTE_IMG = 'https://cdn.ssactivewear.com/Images/Style/5687_fl.jpg';

const ORGS = [
  {
    slug: 'ridgewood-wolves', name: 'Ridgewood Heights Athletics', tagline: 'Official spirit wear of the Ridgewood Heights Wolves.',
    primary: '#1e3a8a', tpl: 'arch',
    args: { top: 'RIDGEWOOD HEIGHTS', main: 'WOLVES', banner: 'ATHLETICS' },
    light: { ink: '#ffffff', accent: '#fbbf24' }, dark: { ink: '#1e3a8a', accent: '#f59e0b' },
    products: [
      { ss: '16', color: 'Navy', v: 'light', title: 'Wolves Spirit Tee', price: 2200 },
      { ss: '395', color: 'Navy', v: 'light', title: 'Wolves Hooded Sweatshirt', price: 4200 },
      { ss: '135', color: 'Sport Grey', v: 'dark', title: 'Wolves Long Sleeve', price: 2800 },
      { ss: '4332', color: null, v: 'dark', title: 'Wolves Trucker Cap', price: 2500, cap: true },
    ],
  },
  {
    slug: 'fairburn-thunder', name: 'Fairburn Thunder Baseball', tagline: '10U–14U travel baseball, Fairburn GA.',
    primary: '#1d4ed8', tpl: 'arch',
    args: { top: 'FAIRBURN', main: 'THUNDER', banner: 'BASEBALL CLUB' },
    light: { ink: '#ffffff', accent: '#93c5fd' }, dark: { ink: '#1d4ed8', accent: '#111827' },
    products: [
      { ss: '16', color: 'Royal', v: 'light', title: 'Thunder Team Tee', price: 2200 },
      { ss: '372', color: 'Royal', v: 'light', title: 'Thunder Crewneck', price: 3800 },
      { ss: '16', color: 'White', v: 'dark', title: 'Thunder Fan Tee', price: 2200 },
      { ss: '4332', color: null, v: 'dark', title: 'Thunder Snapback', price: 2500, cap: true },
    ],
  },
  {
    slug: 'creekside-pto', name: 'Creekside Elementary PTO', tagline: 'Every purchase supports Creekside classrooms.',
    primary: '#15803d', tpl: 'crest',
    args: { top: 'CREEKSIDE ELEMENTARY', bottom: 'PARENT TEACHER ORG', mono: 'CE', year: '1998' },
    light: { ink: '#ffffff', accent: '#86efac' }, dark: { ink: '#15803d', accent: '#166534' },
    products: [
      { ss: '32', color: 'Irish Green', v: 'light', title: 'Creekside Spirit Tee', price: 2000 },
      { ss: '32', color: 'White', v: 'dark', title: 'Creekside Staff Tee', price: 2000 },
      { ss: '395', color: 'Forest', v: 'light', title: 'Creekside Hoodie', price: 4200 },
      { ss: 'TOTE', color: null, v: 'dark', title: 'Creekside Library Tote', price: 1800 },
    ],
  },
  {
    slug: 'peachtree-brass', name: 'The Peachtree Brass Band', tagline: 'Atlanta’s premier community brass ensemble.',
    primary: '#b45309', tpl: 'script',
    args: { script: 'Peachtree', caps: 'BRASS BAND', sub: 'ATLANTA · GEORGIA' },
    light: { ink: '#fef3c7', accent: '#f59e0b' }, dark: { ink: '#78350f', accent: '#b45309' },
    products: [
      { ss: '16', color: 'Black', v: 'light', title: 'Brass Band Tee', price: 2200 },
      { ss: '372', color: 'Black', v: 'light', title: 'Brass Band Crewneck', price: 3800 },
      { ss: 'TOTE', color: null, v: 'dark', title: 'Sheet Music Tote', price: 1800 },
      { ss: '135', color: 'Black', v: 'light', title: 'Brass Band Long Sleeve', price: 2800 },
    ],
  },
  {
    slug: 'trailhead-214', name: 'Trailhead Adventure Troop 214', tagline: 'Outdoor skills, service, and adventure since 1987.',
    primary: '#166534', tpl: 'badge',
    args: { top: 'TRAILHEAD ADVENTURE', bottom: 'FAIRBURN · GEORGIA', center: 'TROOP 214' },
    light: { ink: '#fef9c3', accent: '#4ade80' }, dark: { ink: '#14532d', accent: '#ca8a04' },
    products: [
      { ss: '16', color: 'Forest', v: 'light', title: 'Troop 214 Tee', price: 2200 },
      { ss: '395', color: 'Forest', v: 'light', title: 'Troop 214 Hoodie', price: 4200 },
      { ss: '16', color: 'Natural', v: 'dark', title: 'Camp Tee', price: 2200 },
      { ss: '135', color: 'Forest', v: 'light', title: 'Trail Long Sleeve', price: 2800 },
    ],
  },
  {
    slug: 'velocity-dance', name: 'Velocity Dance Collective', tagline: 'Competition dance · ages 6–18.',
    primary: '#db2777', tpl: 'script',
    args: { script: 'Velocity', caps: 'DANCE COLLECTIVE', sub: 'DREAM · TRAIN · SHINE' },
    light: { ink: '#ffffff', accent: '#f472b6' }, dark: { ink: '#111827', accent: '#db2777' },
    products: [
      { ss: '16', color: 'Black', v: 'light', title: 'Velocity Team Tee', price: 2200 },
      { ss: '2766', color: 'Black', v: 'light', title: 'Rehearsal Tank', price: 2400 },
      { ss: '395', color: 'Black', v: 'light', title: 'Velocity Hoodie', price: 4200 },
      { ss: '16', color: 'White', v: 'dark', title: 'Recital Tee', price: 2200 },
    ],
  },
  {
    slug: 'new-harvest-choir', name: 'New Harvest Community Choir', tagline: 'Lifting every voice across south Atlanta.',
    primary: '#7c3aed', tpl: 'script',
    args: { script: 'New Harvest', caps: 'COMMUNITY CHOIR', sub: 'FOUNDED 2004' },
    light: { ink: '#ffffff', accent: '#c4b5fd' }, dark: { ink: '#4c1d95', accent: '#7c3aed' },
    products: [
      { ss: '16', color: 'Purple', v: 'light', title: 'Choir Tee', price: 2200 },
      { ss: '372', color: 'Purple', v: 'light', title: 'Choir Crewneck', price: 3800 },
      { ss: '16', color: 'White', v: 'dark', title: 'Concert Tee', price: 2200 },
      { ss: 'TOTE', color: null, v: 'dark', title: 'Music Folder Tote', price: 1800 },
    ],
  },
  {
    slug: 'southside-grind', name: 'Southside Grind Coffee Co.', tagline: 'Small-batch roasts · Fairburn, GA.',
    primary: '#78350f', tpl: 'crest',
    args: { top: 'SOUTHSIDE GRIND', bottom: 'COFFEE COMPANY', mono: 'SG', year: '2019' },
    light: { ink: '#fde68a', accent: '#d97706' }, dark: { ink: '#78350f', accent: '#b45309' },
    products: [
      { ss: '1822', color: 'Espresso', v: 'light', title: 'Roaster Tee', price: 2800 },
      { ss: '4332', color: null, v: 'dark', title: 'Barista Cap', price: 2500, cap: true },
      { ss: 'TOTE', color: null, v: 'dark', title: 'Bean Tote', price: 1800 },
      { ss: '395', color: 'Dark Chocolate', v: 'light', title: 'Grind Hoodie', price: 4200 },
    ],
  },
  {
    slug: 'summit-logistics', name: 'Summit Ridge Logistics', tagline: 'Company crew gear — employees order direct.',
    primary: '#334155', tpl: 'corp',
    args: { name: 'SUMMIT RIDGE', sub: 'LOGISTICS' },
    light: { ink: '#ffffff', accent: '#fb923c' }, dark: { ink: '#1e293b', accent: '#ea580c' },
    products: [
      { ss: '16', color: 'Charcoal', v: 'light', title: 'Crew Tee', price: 2200 },
      { ss: '395', color: 'Charcoal', v: 'light', title: 'Warehouse Hoodie', price: 4200 },
      { ss: '135', color: 'Safety Orange', v: 'dark', title: 'Hi-Vis Long Sleeve', price: 2800 },
      { ss: '4332', color: null, v: 'dark', title: 'Driver Cap', price: 2500, cap: true },
    ],
  },
  {
    slug: 'johnson-reunion', name: 'Johnson Family Reunion 2027', tagline: 'One family · one legacy · Atlanta 2027.',
    primary: '#b91c1c', tpl: 'reunion',
    args: { family: 'JOHNSON FAMILY REUNION', year: '2027', place: 'ATLANTA · GEORGIA' },
    light: { ink: '#ffffff', accent: '#fca5a5' }, dark: { ink: '#7f1d1d', accent: '#b91c1c' },
    products: [
      { ss: '16', color: 'Cardinal', v: 'light', title: 'Reunion Tee', price: 2000 },
      { ss: '16', color: 'White', v: 'dark', title: 'Reunion Tee (White)', price: 2000 },
      { ss: '395', color: 'Cardinal', v: 'light', title: 'Reunion Hoodie', price: 4000 },
      { ss: 'TOTE', color: null, v: 'dark', title: 'Cookout Tote', price: 1800 },
    ],
  },
];

/* ── Build ─────────────────────────────────────────────────────────────── */

const colorCache = new Map();
async function garmentImage(ss, colorName) {
  if (ss === 'TOTE') return TOTE_IMG;
  if (!colorName) return `https://cdn.ssactivewear.com/Images/Style/${ss}_fl.jpg`;
  if (!colorCache.has(ss)) colorCache.set(ss, await fetchStyleColors(ss));
  const colors = colorCache.get(ss);
  const hit = colors.find((c) => c.name.toLowerCase() === colorName.toLowerCase())
    || colors.find((c) => c.name.toLowerCase().includes(colorName.toLowerCase()));
  if (!hit?.image) {
    console.warn(`  ! no color image for ${ss}/${colorName}, using style shot`);
    return `https://cdn.ssactivewear.com/Images/Style/${ss}_fl.jpg`;
  }
  return hit.image.replace('www.ssactivewear.com/Images', 'cdn.ssactivewear.com/Images');
}

async function renderLogo(org, variant) {
  const svg = TEMPLATES[org.tpl]({ ...org.args, ...org[variant] });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  // Version suffix busts the Spaces CDN cache between iterations.
  const key = `stores/demo/${org.slug}/logo-${variant}-${process.env.DEMO_V || 'v2'}.png`;
  const url = await uploadObject({ key, body: png, contentType: 'image/png' });
  return typeof url === 'string' ? url : `${CDN}/${key}`;
}

function placementFor(p) {
  if (p.ss === 'TOTE') return { x: 31, y: 32, width: 38 };
  if (p.cap) return { x: 36, y: 22, width: 28 };
  if (p.ss === '395') return { x: 33, y: 22, width: 30 }; // hoodie: above pouch
  return { x: 32, y: 22, width: 34 }; // tees / crews / long sleeves
}

async function buildOrg(org, { testOnly = false } = {}) {
  console.log(`\n== ${org.name}`);
  const logos = {
    light: await renderLogo(org, 'light'),
    dark: await renderLogo(org, 'dark'),
  };
  console.log('  logos:', logos.light);

  const limit = testOnly ? 2 : org.products.length;
  const covers = [];
  for (const p of org.products.slice(0, limit)) {
    const productImageUrl = await garmentImage(p.ss, p.color);
    const cover = await renderMockupComposite({
      productImageUrl,
      graphicUrl: logos[p.v],
      placement: placementFor(p),
      trim: true,
    });
    covers.push({ ...p, cover });
    console.log(`  cover: ${p.title} -> ok`);
  }
  if (testOnly) return { logos, covers };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const storeRes = await client.query(
      `INSERT INTO stores (slug, name, owner_email, brand_json, status, store_type, fulfillment_mode)
       VALUES ($1, $2, 'kevin@tshirtbrothers.com', $3::jsonb, 'active', 'group', 'both')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, brand_json = EXCLUDED.brand_json
       RETURNING id`,
      [org.slug, org.name, JSON.stringify({
        primary_color: org.primary,
        tagline: org.tagline,
        logo_url: logos.light,
        footer_note: 'Store powered by T-Shirt Brothers, Fairburn GA.',
      })],
    );
    const storeId = storeRes.rows[0].id;
    let agRes = await client.query(
      `SELECT id FROM store_agreements WHERE store_id = $1 AND kind = 'store' LIMIT 1`, [storeId]);
    if (agRes.rows.length === 0) {
      agRes = await client.query(
        `INSERT INTO store_agreements (store_id, kind, fee_config_json, payout_terms_json, accepted_by_email)
         VALUES ($1, 'store', '{"contribution_type":"percent","contribution_value":10}',
                 '{"method":"ach","cadence":"monthly"}', 'kevin@tshirtbrothers.com')
         RETURNING id`, [storeId]);
    }
    const agreementId = agRes.rows[0].id;
    for (const p of covers) {
      const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const variants = p.cap || p.ss === 'TOTE'
        ? { sizes: ['One Size'], colors: p.color ? [p.color] : [] }
        : { sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'], colors: p.color ? [p.color] : [] };
      await client.query(
        `INSERT INTO store_products
           (store_id, tsb_blank_ss_id, title, slug, cover_image, retail_price_cents,
            variants_json, active_agreement_id, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, true)
         ON CONFLICT (store_id, slug) DO UPDATE SET cover_image = EXCLUDED.cover_image,
           retail_price_cents = EXCLUDED.retail_price_cents, title = EXCLUDED.title`,
        [storeId, p.ss === 'TOTE' ? '13730' : p.ss, p.title, slug, p.cover, p.price,
          JSON.stringify(variants), agreementId],
      );
    }
    await client.query('COMMIT');
    console.log(`  store #${storeId} committed with ${covers.length} products`);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { logos, covers };
}

const testOnly = process.argv[2] === 'test';
if (testOnly) {
  const r = await buildOrg(ORGS[0], { testOnly: true });
  console.log(JSON.stringify(r, null, 2));
} else {
  for (const org of ORGS) await buildOrg(org);
}
await pool.end();
console.log('\nDone.');
