import { Router } from 'express';
import pool from '../db.js';
import { fetchProducts as fetchSSProducts } from '../services/ssActivewear.js';

const router = Router();

// Image proxy — serves external images from our domain so canvas/toPng can access them (avoids CORS)
router.get('/image-proxy', async (req, res) => {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Invalid URL' });
  }
  // Only allow S&S Activewear and our own DO Spaces images
  const allowed = url.includes('ssactivewear.com') || url.includes('digitaloceanspaces.com') || url.includes('api.iconify.design') || url.includes('oaidalleapi') || url.includes('blob.core.windows.net');
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
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));

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
        // Normalize common terms: "tshirt" → "t-shirt", "hoodie" → "hood"
        let normalized = search.trim()
          .replace(/\btshirts?\b/gi, 't-shirt')
          .replace(/\bhoodies?\b/gi, 'hood')
          .replace(/\bpolos?\b/gi, 'polo');
        const terms = normalized.split(/\s+/).filter(Boolean);
        for (const term of terms) {
          conditions.push(`(name ILIKE $${paramIndex} OR brand ILIKE $${paramIndex} OR category ILIKE $${paramIndex})`);
          params.push(`%${term}%`);
          paramIndex++;
        }
      }
      if (category) {
        conditions.push(`category ILIKE $${paramIndex}`);
        params.push(`%${category}%`);
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
        .replace(/\btshirts?\b/g, 't-shirt')
        .replace(/\bhoodies?\b/g, 'hood')
        .replace(/\bpolos?\b/g, 'polo');
      const terms = normalized.split(/\s+/).filter(Boolean);
      styles = styles.filter(s => {
        const haystack = `${s.name ?? ''} ${s.brand ?? ''} ${s.category ?? ''} ${s.style_number ?? ''}`.toLowerCase();
        return terms.every(term => haystack.includes(term));
      });
    }
    if (brand) {
      styles = styles.filter(s => s.brand === brand);
    }
    if (category) {
      styles = styles.filter(s => s.category?.toLowerCase().includes(category.toLowerCase()));
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
router.get('/pricing/:styleId', async (req, res, next) => {
  try {
    const { styleId } = req.params;
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
    res.json({
      pricing: {
        customerPrice: p.customerPrice || 0,
        retailPrice: p.retailPrice || 0,
        piecePrice: p.piecePrice || 0,
        salePrice: p.salePrice || 0,
      }
    });
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
      categories: categoriesResult.rows.map(r => r.category),
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
    const response = await fetch(
      `https://api.ssactivewear.com/v2/products/?styleid=${styleId}&fields=colorName,hex1,colorFrontImage,colorBackImage,sizeName`,
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
        seen.set(name, {
          name,
          hex: resolveHex(name, p.hex1),
          image: p.colorFrontImage ? `https://www.ssactivewear.com/${p.colorFrontImage}` : null,
          backImage: p.colorBackImage ? `https://www.ssactivewear.com/${p.colorBackImage}` : null,
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

// GET /by-ssid/:ssId - Find product by ss_id
router.get('/by-ssid/:ssId', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE ss_id = $1 LIMIT 1', [req.params.ssId]);
    if (result.rows.length === 0) return res.status(404).json(null);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /:id - Single product
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
