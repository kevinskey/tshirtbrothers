import { Router } from 'express';
import pool from '../db.js';
import { fetchProducts as fetchSSProducts } from '../services/ssActivewear.js';

const router = Router();

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
      const dataResult = await pool.query(
        `SELECT * FROM products ${whereClause} ORDER BY name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
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

// Color name → hex fallback map for when S&S returns empty hex values
const COLOR_HEX_MAP = {
  'white': '#FFFFFF', 'black': '#000000', 'navy': '#1B2A4A', 'red': '#CC0000',
  'royal': '#1E3F8F', 'royal blue': '#1E3F8F', 'sport grey': '#90949A', 'gray': '#808080',
  'grey': '#808080', 'charcoal': '#36454F', 'dark heather': '#3C3C3C', 'heather grey': '#B0B0B0',
  'forest green': '#1A472A', 'green': '#228B22', 'kelly green': '#00A550',
  'maroon': '#6B1C2A', 'cardinal red': '#8C1515', 'cherry red': '#CC0033',
  'orange': '#FF6600', 'gold': '#FFD700', 'yellow': '#FFFF00', 'sand': '#C2B280',
  'natural': '#F5F0E1', 'light blue': '#ADD8E6', 'carolina blue': '#57A0D3',
  'sapphire': '#0B5394', 'purple': '#6A0DAD', 'violet': '#8B00FF',
  'light pink': '#FFB6C1', 'pink': '#FF69B4', 'azalea': '#D73B7D', 'heliconia': '#E84A7F',
  'brown': '#6F4E37', 'chocolate': '#3C1414', 'dark chocolate': '#2C1608',
  'military green': '#4B5320', 'olive': '#6B6B3D', 'indigo blue': '#2E3A87',
  'iris': '#5A4FCF', 'ice grey': '#C9D1D3', 'ash': '#B2BEB5', 'safety green': '#47FF33',
  'safety orange': '#FF6600', 'safety pink': '#FF7098', 'lime': '#BFFF00',
  'daisy': '#F7E75E', 'coral silk': '#FF7F7F', 'mint green': '#98FF98',
  'sky': '#87CEEB', 'heather navy': '#2F4F6F', 'heather red': '#B24444',
  'heather sapphire': '#4A7FB5', 'heather military green': '#5A6B3A',
  'tropical blue': '#007BB8', 'turf green': '#3B7A3B', 'neon blue': '#4666FF',
  'neon green': '#39FF14', 'sunset': '#FAD6A5', 'tangerine': '#FF9966',
  'old gold': '#CFB53B', 'russet': '#80461B', 'kiwi': '#8EE53F',
  'antique cherry red': '#9B1B30', 'antique sapphire': '#2F5496', 'antique heliconia': '#C04E81',
  'antique irish green': '#3A7D4B', 'antique jade dome': '#467B6B', 'antique orange': '#C55B2C',
};

function resolveHex(colorName, rawHex) {
  if (rawHex && rawHex !== '#cccccc' && rawHex !== '') return rawHex;
  const lower = (colorName || '').toLowerCase().trim();
  return COLOR_HEX_MAP[lower] || COLOR_HEX_MAP[lower.replace(/\s+/g, ' ')] || '#AAAAAA';
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
