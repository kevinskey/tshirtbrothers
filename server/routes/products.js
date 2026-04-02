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
        conditions.push(`(name ILIKE $${paramIndex} OR brand ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
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
      const q = search.toLowerCase();
      styles = styles.filter(s => s.name?.toLowerCase().includes(q) || s.brand?.toLowerCase().includes(q));
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
