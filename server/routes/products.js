import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  fetchProducts as fetchSSProducts,
  fetchStyle, fetchStyleColors, fetchStyleSkus, fetchStyleInventory,
} from '../services/ssActivewear.js';
import { expandRetailCategory, groupIntoRetailCategories } from '../lib/retailCategories.js';

const router = Router();

// Image proxy — serves external images from our domain so canvas/toPng can access them (avoids CORS)
router.get('/image-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  // Only allow S&S Activewear and our own DO Spaces images
  const allowed = url.includes('ssactivewear.com') || url.includes('digitaloceanspaces.com') || url.includes('api.iconify.design') || url.includes('oaidalleapi') || url.includes('blob.core.windows.net') || url.includes('res.cloudinary.com');
  if (!allowed) {
    return res.status(400).json({ error: 'URL not allowed' });
  }
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(response.status).end();
    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Access-Control-Allow-Origin', '*');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch {
    res.status(502).end();
  }
});

// In-memory cache for S&S styles (refreshed hourly)
let stylesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getStyles() {
  if (stylesCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return stylesCache;
  }
  try {
    const result = await fetchSSProducts({ limit: 6000 });
    stylesCache = result.products || [];
    cacheTimestamp = Date.now();
    return stylesCache;
  } catch {
    return stylesCache || [];
  }
}

// GET / - List products (DB first, fallback to S&S API)
router.get('/', async (req, res, next) => {
  try {
    const {
      search,
      category,
      brand,
      featured,
      page = 1,
      limit = 24,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 24));

    // Check if DB has products
    const countCheck = await pool.query('SELECT COUNT(*) FROM products');
    const dbCount = parseInt(countCheck.rows[0].count, 10);

    if (dbCount > 0) {
      // Use database
      const offset = (pageNum - 1) * limitNum;
      const conditions = [];
      const params = [];
      let paramIndex = 1;

      if (search) {
        // Garment-type words are CATEGORY intent, not fuzzy text: a search
        // for "tshirts" must return t-shirts — not long-sleeves, chef coats,
        // and anything else whose name or category happens to contain
        // "T-Shirt". Matched phrases become an exact category filter and
        // are removed from the text search; whatever's left ("gildan",
        // "G500", a color) still matches the usual way. Order matters:
        // "long sleeve t-shirt" must resolve before the bare tee intent,
        // "hooded sweatshirt" before the crewneck intent.
        // The S&S tee categories also hold tanks, athletic jerseys,
        // muscle shirts, 3/4-sleeve raglans, etc. A t-shirt search must
        // exclude those by name. "Jersey" is fabric when followed by
        // tee/shirt ("Fine Jersey Tee" stays) and a garment when not
        // ("Basketball Jersey" goes). Static SQL, no user input.
        const NON_TEE_CLAUSE = `NOT (
          name ILIKE '%tank%' OR name ILIKE '%racerback%' OR name ILIKE '%singlet%'
          OR name ILIKE '%muscle%' OR name ILIKE '%camisole%'
          OR name ILIKE '%bodysuit%' OR name ILIKE '%onesie%'
          OR name ILIKE '%3/4%' OR name ILIKE '%three-quarter%'
          OR (name ILIKE '%jersey%' AND name NOT ILIKE '%tee%' AND name NOT ILIKE '%shirt%')
        )`;
        const GARMENT_INTENTS = [
          { re: /\blong[\s-]?sleeves?\b(?:\s+(?:t[\s-]?shirts?|tees?))?/i,
            cats: ['T-Shirts - Long Sleeve'] },
          { re: /\bhood(?:ies?|ed)?\b(?:\s+sweatshirts?)?/i,
            cats: ['Fleece - Core - Hood', 'Fleece - Premium - Hood'] },
          { re: /\b(?:crew\s?necks?|sweatshirts?)\b/i,
            cats: ['Fleece - Core - Crew', 'Fleece - Premium - Crew'] },
          // Tanks share the tee categories, so keep the word as a name
          // match inside them rather than dropping it.
          { re: /\btanks?\b(?:\s+tops?)?/i,
            cats: ['T-Shirts - Core', 'T-Shirts - Premium'], keepTerm: true },
          { re: /\bt[\s-]?shirts?\b|\btees?\b/i,
            cats: ['T-Shirts - Core', 'T-Shirts - Premium'], exclude: NON_TEE_CLAUSE },
          { re: /\bpolos?\b/i, cats: ['Polos'] },
          { re: /\b(?:hats?|caps?|beanies?)\b/i, cats: ['Headwear'] },
        ];
        let remaining = search.trim();
        const intentCats = new Set();
        const intentExcludes = new Set();
        for (const g of GARMENT_INTENTS) {
          if (g.re.test(remaining)) {
            g.cats.forEach((c) => intentCats.add(c));
            if (g.exclude) intentExcludes.add(g.exclude);
            if (!g.keepTerm) {
              remaining = remaining.replace(new RegExp(g.re.source, 'gi'), ' ');
            }
          }
        }
        if (intentCats.size > 0) {
          conditions.push(`category = ANY($${paramIndex})`);
          params.push([...intentCats]);
          paramIndex++;
          intentExcludes.forEach((c) => conditions.push(c));
        }
        // Normalize common terms: "tshirt" → "t-shirt", "hoodie" → "hood".
        // Apostrophes are stripped from both the terms and (below) the
        // compared columns so "womens" matches "Women's".
        let normalized = remaining
          .replace(/[''’]/g, '')
          .replace(/\btshirts?\b/gi, 't-shirt')
          .replace(/\bhoodies?\b/gi, 'hood')
          .replace(/\bpolos?\b/gi, 'polo');
        const terms = normalized.split(/\s+/).filter(Boolean);
        const nameCols = `(REPLACE(name, '''', '') || ' ' || brand || ' ' || category)`;
        // Style codes like "G500" or "g50000" are how brands abbreviate
        // their model numbers. Strip a single-letter prefix (or "PC" / "DT"
        // for non-Gildan brands) so "G500" still matches stored "5000".
        const styleVariants = (t) => {
          const out = new Set([t]);
          const m = t.match(/^([A-Za-z]{1,3})(\d{2,6})$/);
          if (m) out.add(m[2]);
          return [...out];
        };
        // A "size token" is anything that looks like a garment size — XS,
        // S, M, L, XL, 2XL, 3XL, 4XL, 4XLT, 5XL, 6XL, 7XL, plus S/M, L/XL,
        // 2X, 3X, etc. When a term matches, we additionally check whether
        // the product's `sizes` JSONB array contains that token.
        const isSizeToken = (t) => /^([0-9]?xl?t?|[0-9]?xs|s|m|l|xl|sm|md|lg|xs|ot|s\/m|m\/l|l\/xl|xl\/2xl)$/i.test(t);
        for (const term of terms) {
          const upperTerm = term.toUpperCase();
          if (isSizeToken(term)) {
            // Match name/brand/category OR a size in the sizes array.
            // Use containment so "5x" matches "5XL"/"5XLT", "xl" matches
            // "XL"/"2XL"/"3XL"/etc., "s/m" matches "S/M".
            conditions.push(
              `(${nameCols} ILIKE $${paramIndex}
                OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements_text(sizes) sz
                  WHERE UPPER(sz) LIKE $${paramIndex + 1}
                ))`
            );
            params.push(`%${term}%`, `%${upperTerm}%`);
            paramIndex += 2;
          } else {
            // Match the term against name/brand/category, and also against
            // style_number — accepting G500/5000 etc. as variants of the
            // same code so customers can search either way.
            const variants = styleVariants(term);
            const styleClauses = variants.map(() => `style_number ILIKE $${paramIndex++}`);
            conditions.push(
              `(${nameCols} ILIKE $${paramIndex}
                OR ${styleClauses.join(' OR ')})`
            );
            // Style codes get a wildcard so "G500" → strips to "500" →
            // matches Gildan's stored "5000". A bit fuzzy but on-brand
            // for how customers type these.
            for (const v of variants) params.push(`%${v}%`);
            params.push(`%${term}%`); // for name/brand/category ILIKE
            paramIndex++;
          }
        }
      }
      if (category) {
        // Retail labels ("Hoodies") expand to the raw S&S categories they
        // cover; anything else falls back to the old fuzzy raw match.
        const rawSet = expandRetailCategory(category);
        if (rawSet) {
          conditions.push(`category = ANY($${paramIndex})`);
          params.push(rawSet);
        } else {
          conditions.push(`category ILIKE $${paramIndex}`);
          params.push(`%${category}%`);
        }
        paramIndex++;
      }
      if (brand) {
        conditions.push(`brand = $${paramIndex}`);
        params.push(brand);
        paramIndex++;
      }
      if (featured === 'true') {
        conditions.push('is_featured = TRUE');
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const countResult = await pool.query(`SELECT COUNT(*) FROM products ${whereClause}`, params);
      const total = parseInt(countResult.rows[0].count, 10);

      // Pin top 3 featured products when no search is active
      // 1. Gildan Softstyle T-Shirt (ss_id 32)
      // 2. Next Level Cotton T-Shirt (ss_id 3214)
      // 3. Gildan Softstyle Midweight Hooded Sweatshirt (ss_id 9352)
      const orderClause = search
        ? 'name ASC'
        : `CASE ss_id
            WHEN '32' THEN 1
            WHEN '3214' THEN 2
            WHEN '9352' THEN 3
            ELSE 99
          END, name ASC`;

      const dataResult = await pool.query(
        `SELECT * FROM products ${whereClause} ORDER BY ${orderClause} LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limitNum, offset]
      );

      return res.json({ products: dataResult.rows, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
    }

    // Fallback: fetch from S&S API directly
    let styles = await getStyles();

    // Apply filters
    if (search) {
      let normalized = search.toLowerCase().trim()
        .replace(/[''’]/g, '')
        .replace(/\btshirts?\b/g, 't-shirt')
        .replace(/\bhoodies?\b/g, 'hood')
        .replace(/\bpolos?\b/g, 'polo');
      const terms = normalized.split(/\s+/).filter(Boolean);
      styles = styles.filter(s => {
        const haystack = `${s.name ?? ''} ${s.brand ?? ''} ${s.category ?? ''} ${s.style_number ?? ''}`.toLowerCase().replace(/[''’]/g, '');
        return terms.every(term => haystack.includes(term));
      });
    }
    if (brand) {
      styles = styles.filter(s => s.brand === brand);
    }
    if (category) {
      const rawSet = expandRetailCategory(category);
      styles = rawSet
        ? styles.filter(s => rawSet.includes(s.category))
        : styles.filter(s => s.category?.toLowerCase().includes(category.toLowerCase()));
    }

    const total = styles.length;
    const start = (pageNum - 1) * limitNum;
    const pageProducts = styles.slice(start, start + limitNum);

    res.json({ products: pageProducts, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (err) {
    next(err);
  }
});

// GET /brands - All brands with product counts and a sample image
router.get('/brands', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        brand,
        COUNT(*)::int as count,
        (array_agg(image_url ORDER BY name))[1] as image_url
      FROM products
      WHERE brand IS NOT NULL AND brand != ''
      GROUP BY brand
      ORDER BY brand
    `);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /weight/:styleId - Get estimated per-item weight from S&S
router.get('/weight/:styleId', async (req, res, next) => {
  try {
    const { styleId } = req.params;
    const accountNumber = process.env.SS_ACCOUNT_NUMBER;
    const apiKey = process.env.SS_API_KEY;
    if (!accountNumber || !apiKey) return res.json({ weight_oz: null });

    const credentials = Buffer.from(`${accountNumber}:${apiKey}`).toString('base64');
    const response = await fetch(
      `https://api.ssactivewear.com/v2/products/?styleid=${styleId}&fields=caseWeight,caseQty&limit=1`,
      { headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    if (!response.ok) return res.json({ weight_oz: null });

    const data = await response.json();
    if (data.length > 0 && data[0].caseWeight && data[0].caseQty) {
      const perItemLbs = data[0].caseWeight / data[0].caseQty;
      const perItemOz = Math.round(perItemLbs * 16 * 10) / 10;
      res.json({ weight_oz: perItemOz, caseWeight: data[0].caseWeight, caseQty: data[0].caseQty });
    } else {
      res.json({ weight_oz: null });
    }
  } catch (err) {
    next(err);
  }
});

// GET /pricing/:styleId - Get S&S wholesale pricing for a style
// S&S pricing rarely moves intraday; cache per style so a page of 60 sale
// cards costs one upstream sweep every 6h instead of 60 calls per visitor.
const pricingCache = new Map(); // styleId -> { at, body }
const PRICING_TTL_MS = 6 * 60 * 60 * 1000;
const PRICING_CACHE_MAX = 500;

router.get('/pricing/:styleId', async (req, res, next) => {
  try {
    const { styleId } = req.params;
    const cached = pricingCache.get(styleId);
    if (cached && Date.now() - cached.at < PRICING_TTL_MS) {
      return res.json(cached.body);
    }
    const accountNumber = process.env.SS_ACCOUNT_NUMBER;
    const apiKey = process.env.SS_API_KEY;
    if (!accountNumber || !apiKey) return res.json({ pricing: null });

    const credentials = Buffer.from(`${accountNumber}:${apiKey}`).toString('base64');
    const response = await fetch(
      `https://api.ssactivewear.com/v2/products/?styleid=${styleId}&fields=customerPrice,retailPrice,piecePrice,salePrice`,
      { headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) }
    );
    if (!response.ok) return res.json({ pricing: null });

    const data = await response.json();
    const items = Array.isArray(data) ? data : [];
    if (items.length === 0) return res.json({ pricing: null });

    // Get the first item's pricing (prices are same across colors for a style)
    const p = items[0];
    const body = {
      pricing: {
        customerPrice: p.customerPrice || 0,
        retailPrice: p.retailPrice || 0,
        piecePrice: p.piecePrice || 0,
        salePrice: p.salePrice || 0,
      }
    };
    if (pricingCache.size >= PRICING_CACHE_MAX) {
      pricingCache.delete(pricingCache.keys().next().value);
    }
    pricingCache.set(styleId, { at: Date.now(), body });
    res.json(body);
  } catch (err) {
    next(err);
  }
});

// GET /filters - Distinct brands and categories for dropdowns
router.get('/filters', async (req, res, next) => {
  try {
    const [brandsResult, categoriesResult] = await Promise.all([
      pool.query("SELECT DISTINCT brand FROM products WHERE brand != '' ORDER BY brand"),
      pool.query("SELECT DISTINCT category FROM products WHERE category != '' ORDER BY category"),
    ]);
    res.json({
      brands: brandsResult.rows.map(r => r.brand),
      categories: groupIntoRetailCategories(categoriesResult.rows.map(r => r.category)),
    });
  } catch (err) {
    next(err);
  }
});

// GET /featured - Featured products
router.get('/featured', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE is_featured = TRUE ORDER BY created_at DESC LIMIT 10'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// Smart color resolver — parses keywords from color names to approximate hex
const BASE_COLORS = {
  'white': '#FFFFFF', 'black': '#000000', 'navy': '#1B2A4A', 'red': '#CC0000',
  'royal': '#1E3F8F', 'blue': '#2563EB', 'grey': '#808080', 'gray': '#808080',
  'charcoal': '#36454F', 'heather': '#A0A0A0', 'forest': '#1A472A', 'green': '#228B22',
  'kelly': '#00A550', 'maroon': '#6B1C2A', 'cardinal': '#8C1515', 'cherry': '#CC0033',
  'orange': '#FF6600', 'gold': '#CFB53B', 'yellow': '#FFD700', 'sand': '#C2B280',
  'natural': '#F5F0E1', 'carolina': '#57A0D3', 'sapphire': '#0B5394',
  'purple': '#6A0DAD', 'violet': '#8B00FF', 'pink': '#FF69B4', 'azalea': '#D73B7D',
  'heliconia': '#E84A7F', 'brown': '#6F4E37', 'chocolate': '#3C1414', 'military': '#4B5320',
  'olive': '#6B6B3D', 'indigo': '#2E3A87', 'iris': '#5A4FCF', 'ash': '#B2BEB5',
  'safety': '#47FF33', 'lime': '#BFFF00', 'daisy': '#F7E75E', 'coral': '#FF7F7F',
  'mint': '#98FF98', 'sky': '#87CEEB', 'tropical': '#007BB8', 'turf': '#3B7A3B',
  'neon': '#39FF14', 'sunset': '#FAD6A5', 'tangerine': '#FF9966', 'russet': '#80461B',
  'kiwi': '#8EE53F', 'jade': '#467B6B', 'teal': '#008080', 'cyan': '#00CED1',
  'cream': '#FFFDD0', 'ivory': '#FFFFF0', 'khaki': '#C3B091', 'tan': '#D2B48C',
  'beige': '#F5F5DC', 'wine': '#722F37', 'burgundy': '#800020', 'cranberry': '#9B1B30',
  'berry': '#8E4585', 'plum': '#6B3A6B', 'lavender': '#B57EDC', 'lilac': '#C8A2C8',
  'magenta': '#FF00FF', 'fuchsia': '#FF00FF', 'rose': '#FF007F',
  'peach': '#FFCBA4', 'salmon': '#FA8072', 'rust': '#B7410E', 'copper': '#B87333',
  'terra': '#E2725B', 'pewter': '#8E8E8E', 'silver': '#C0C0C0',
  'stone': '#8A8A7E', 'slate': '#708090', 'graphite': '#5C5C5C',
  'iron': '#4A4A4A', 'smoke': '#6E6E6E', 'steel': '#71797E',
  'midnight': '#191970', 'dark': '#2C2C2C', 'deep': '#1A1A3E',
  'ice': '#D6ECF0', 'ocean': '#006994', 'marine': '#004953',
  'aqua': '#00FFFF', 'seafoam': '#93E9BE', 'sage': '#9CAD7F', 'moss': '#6B6B3D',
  'fern': '#4F7942', 'hunter': '#355E3B', 'emerald': '#50C878', 'shamrock': '#009E60',
  'irish': '#009E60', 'spring': '#00FF7F', 'camo': '#5C5B3E', 'denim': '#1560BD',
  'cornsilk': '#FFF8DC', 'galapagos': '#006D6F', 'garnet': '#733635',
  'prairie': '#C4A55A', 'pepper': '#3B3B3B', 'lagoon': '#017A79', 'oatmeal': '#D4C5A9',
  'citrus': '#9FA91F', 'mustard': '#FFDB58', 'paprika': '#8B2500',
  'watermelon': '#FC6C85', 'orchid': '#DA70D6', 'periwinkle': '#CCCCFF',
  'cobalt': '#0047AB', 'chambray': '#547186', 'eggplant': '#614051',
  'sangria': '#92000A', 'merlot': '#73343A', 'espresso': '#3C1414',
  'mocha': '#967969', 'caramel': '#D2691E', 'honey': '#EB9605',
  'amber': '#FFBF00', 'marigold': '#EAA221', 'lemon': '#FFF44F',
  'mango': '#FF8243', 'apricot': '#FBCEB1', 'pumpkin': '#FF7518',
  'cinnamon': '#D2691E', 'mahogany': '#420D09', 'scarlet': '#FF2400',
  'crimson': '#DC143C', 'ruby': '#9B111E', 'flame': '#E25822',
  'blaze': '#FF6700', 'candy': '#FF69B4', 'cotton': '#FFBCD9',
  'fan': '#4169E1', 'texas': '#BF5700', 'vegas': '#C5B358', 'columbia': '#9BDDFF',
  'coyote': '#8B7355', 'harbor': '#3F6D7E', 'dusk': '#4E5481',
  'fig': '#6C3461', 'boysenberry': '#873260', 'cabernet': '#4C1130',
  'latte': '#C8AD7F', 'butterscotch': '#E29D3A', 'sunflower': '#FFDA03',
  'banana': '#FFE135', 'ginger': '#B06500', 'nutmeg': '#7E4A35',
  'cedar': '#6D3B25', 'brick': '#CB4154', 'barn': '#7C0A02',
};

function resolveHex(colorName, rawHex) {
  if (rawHex && rawHex !== '#cccccc' && rawHex !== '') return rawHex;
  if (!colorName) return '#AAAAAA';
  const lower = colorName.toLowerCase().trim();
  // Direct match
  if (BASE_COLORS[lower]) return BASE_COLORS[lower];
  // Try each word (last meaningful color wins)
  const words = lower.split(/[\s\/\-]+/);
  for (let i = words.length - 1; i >= 0; i--) {
    if (BASE_COLORS[words[i]]) return BASE_COLORS[words[i]];
  }
  // Partial/prefix match
  for (const word of words) {
    for (const [key, hex] of Object.entries(BASE_COLORS)) {
      if (key.startsWith(word) || word.startsWith(key)) return hex;
    }
  }
  return '#AAAAAA';
}

// GET /colors/:styleId - Fetch available colors for a style from S&S
router.get('/colors/:styleId', async (req, res, next) => {
  try {
    const { styleId } = req.params;
    const accountNumber = process.env.SS_ACCOUNT_NUMBER;
    const apiKey = process.env.SS_API_KEY;
    if (!accountNumber || !apiKey) {
      return res.json({ colors: [] });
    }

    const credentials = Buffer.from(`${accountNumber}:${apiKey}`).toString('base64');
    // color1 is S&S's real hex field (hex1 doesn't exist and always came
    // back empty); colorSwatchImage is the fabric swatch photo. Styles
    // with no flat colorFrontImage (e.g. Shaka Wear) usually still have
    // per-color ON-MODEL shots — request those as the image fallback so
    // picking a color always switches the photo.
    const response = await fetch(
      `https://api.ssactivewear.com/v2/products/?styleid=${styleId}&fields=colorName,color1,colorSwatchImage,colorFrontImage,colorBackImage,colorSideImage,colorOnModelFrontImage,colorOnModelBackImage,colorOnModelSideImage,sizeName`,
      {
        headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      return res.json({ colors: [] });
    }

    const data = await response.json();
    const items = Array.isArray(data) ? data : [];

    // Deduplicate by color name
    const seen = new Map();
    for (const p of items) {
      const name = p.colorName || '';
      if (!seen.has(name)) {
        const img = (path) => (path ? `https://www.ssactivewear.com/${path}` : null);
        seen.set(name, {
          name,
          hex: resolveHex(name, p.color1),
          swatch: img(p.colorSwatchImage),
          image: img(p.colorFrontImage) || img(p.colorOnModelFrontImage),
          backImage: img(p.colorBackImage) || img(p.colorOnModelBackImage),
          sideImage: img(p.colorSideImage) || img(p.colorOnModelSideImage),
        });
      }
    }

    // Collect unique sizes
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', 'One Size', 'OSFA'];
    const sizeSet = new Set();
    for (const p of items) {
      if (p.sizeName) sizeSet.add(p.sizeName);
    }
    const sizes = Array.from(sizeSet).sort((a, b) => {
      const ai = sizeOrder.indexOf(a);
      const bi = sizeOrder.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });

    res.json({ colors: Array.from(seen.values()), sizes });
  } catch (err) {
    next(err);
  }
});

// GET /by-ssid/:ssId - Find product by ss_id. Also accepts the studio's
// pseudo id "jds:<sku>" (see /jds-search below) so deep links like
// /design?product=jds:LTM952 — used by the Custom Gift Club PDP — land
// on the right JDS blank; the row is shaped exactly like a /jds-search
// result so the studio's isJdsProduct handling kicks in.
router.get('/by-ssid/:ssId', async (req, res, next) => {
  try {
    const ssId = req.params.ssId;
    if (/^jds:/i.test(ssId)) {
      const sku = ssId.slice(4).toUpperCase();
      const { rows } = await pool.query(
        `SELECT id, sku, name, image_url, retail_price_cents
           FROM jds_products WHERE sku = $1 AND active LIMIT 1`,
        [sku],
      );
      if (!rows.length) return res.status(404).json(null);
      const r = rows[0];
      const dims = parseJdsDims(r.name);
      return res.json({
        id: `jds-${r.id}`,
        ss_id: `jds:${r.sku}`,
        name: r.name,
        brand: 'JDS',
        category: 'Gifts & Engraving',
        image_url: r.image_url,
        base_price: null,
        price: r.retail_price_cents / 100,
        colors: [],
        sizes: [],
        est_width_in: dims?.w ?? null,
        est_height_in: dims?.h ?? null,
      });
    }
    const result = await pool.query('SELECT * FROM products WHERE ss_id = $1 LIMIT 1', [ssId]);
    if (result.rows.length === 0) return res.status(404).json(null);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /:id - Single product
// ── GET /jds-search — JDS Industries catalog rows shaped like studio
// products (pseudo ss_id "jds:<sku>", no colorways/sizes) so the Design
// Studio picker can offer drinkware / awards / engraving blanks
// alongside S&S apparel. Must stay above the '/:id' catch-all.
// Physical dimensions from a JDS product name: "6 x 8 Plaque",
// "6 1/2 x 8 ...", '6 x 8" ...', "2.5 x 3.5". ~40% of the catalog names
// carry these; the studio uses them to calibrate its inch ruler.
function parseJdsDims(text) {
  const num = String.raw`(\d+(?:\.\d+)?(?:\s+\d+/\d+)?|\d+/\d+)`;
  const m = new RegExp(`${num}\\s*(?:"|in(?:ch(?:es)?)?\\.?)?\\s*[xX×]\\s*${num}`).exec(text || '');
  if (!m) return null;
  const toNum = (s) => s.trim().split(/\s+/).reduce((sum, part) => {
    if (part.includes('/')) { const [a, b] = part.split('/'); return sum + Number(a) / Number(b); }
    return sum + Number(part);
  }, 0);
  const w = toNum(m[1]);
  const h = toNum(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || w > 60 || h > 60) return null;
  return { w, h };
}

router.get('/jds-search', async (req, res, next) => {
  try {
    const q = String(req.query.search || '').trim();
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const params = [];
    let where = 'active = TRUE';
    if (q) {
      params.push(`%${q}%`);
      where += ` AND (name ILIKE $1 OR sku ILIKE $1 OR description ILIKE $1)`;
    }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT id, sku, name, image_url, retail_price_cents
         FROM jds_products
        WHERE ${where}
        ORDER BY name
        LIMIT $${params.length}`,
      params,
    );
    res.json({
      products: rows.map((r) => {
        const dims = parseJdsDims(r.name);
        return {
          id: `jds-${r.id}`,
          ss_id: `jds:${r.sku}`,
          name: r.name,
          brand: 'JDS',
          category: 'Gifts & Engraving',
          image_url: r.image_url,
          base_price: null,
          price: r.retail_price_cents / 100,
          colors: [],
          sizes: [],
          est_width_in: dims?.w ?? null,
          est_height_in: dims?.h ?? null,
        };
      }),
    });
  } catch (err) { next(err); }
});

// ── GET /detail/:id — full live S&S dossier for one catalog product:
// style info, colorways with swatch/front images, per-SKU wholesale
// pricing, and per-warehouse inventory. Admin-only (wholesale prices).
// Cached per style — S&S data barely moves intraday and one dossier is
// four upstream calls.
const detailCache = new Map(); // ss_id -> { at, body }
const DETAIL_TTL_MS = 10 * 60 * 1000;
router.get('/detail/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const product = rows[0];
    if (!product.ss_id) return res.json({ product, live: null });
    const hit = detailCache.get(product.ss_id);
    if (hit && Date.now() - hit.at < DETAIL_TTL_MS) {
      return res.json({ product, live: hit.body });
    }
    const [style, colors, skus, inventory] = await Promise.all([
      fetchStyle(product.ss_id).catch(() => null),
      fetchStyleColors(product.ss_id).catch(() => []),
      fetchStyleSkus(product.ss_id).catch(() => []),
      fetchStyleInventory(product.ss_id).catch(() => ({})),
    ]);
    const live = { style, colors, skus, inventory };
    if (detailCache.size >= 200) detailCache.delete(detailCache.keys().next().value);
    detailCache.set(product.ss_id, { at: Date.now(), body: live });
    res.json({ product, live });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
