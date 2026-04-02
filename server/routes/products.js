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
        conditions.push(`category = $${paramIndex}`);
        params.push(category);
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
        `SELECT * FROM products ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
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
      `https://api.ssactivewear.com/v2/products/?styleid=${styleId}&fields=colorName,hex1,colorFrontImage,colorBackImage`,
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
          hex: p.hex1 || '#cccccc',
          image: p.colorFrontImage ? `https://www.ssactivewear.com/${p.colorFrontImage}` : null,
          backImage: p.colorBackImage ? `https://www.ssactivewear.com/${p.colorBackImage}` : null,
        });
      }
    }

    res.json({ colors: Array.from(seen.values()) });
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
