import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import pool from '../db.js';

const router = Router();

// Ensure blog_posts table exists
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug VARCHAR(500) UNIQUE NOT NULL,
        title VARCHAR(500) NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        excerpt TEXT,
        cover_image TEXT,
        author VARCHAR(200) DEFAULT 'TShirt Brothers',
        tags TEXT[] DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'draft',
        meta_title VARCHAR(200),
        meta_description VARCHAR(500),
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch (err) {
    console.error('Blog table creation error:', err.message);
  }
})();

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

// GET / - List published posts (public)
router.get('/', async (req, res, next) => {
  try {
    const { tag } = req.query;
    let query = `
      SELECT id, slug, title, excerpt, cover_image, author, tags, published_at
      FROM blog_posts
      WHERE status = 'published'
    `;
    const params = [];

    if (tag) {
      params.push(tag);
      query += ` AND $${params.length} = ANY(tags)`;
    }

    query += ' ORDER BY published_at DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /admin/all - List ALL posts including drafts (admin only)
router.get('/admin/all', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, slug, title, excerpt, cover_image, author, tags, status, meta_title, meta_description, published_at, created_at, updated_at
       FROM blog_posts
       ORDER BY updated_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /:slug - Get single post by slug (public, only published)
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const { rows } = await pool.query(
      `SELECT id, slug, title, content, excerpt, cover_image, author, tags, status, meta_title, meta_description, published_at, created_at, updated_at
       FROM blog_posts
       WHERE slug = $1 AND status = 'published'`,
      [slug]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST / - Create post (admin only)
router.post('/', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { title, content, excerpt, cover_image, tags, status, meta_title, meta_description } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    let slug = slugify(title);

    // Ensure slug is unique
    const existing = await pool.query('SELECT id FROM blog_posts WHERE slug = $1', [slug]);
    if (existing.rows.length > 0) {
      slug = `${slug}-${Date.now()}`;
    }

    const publishedAt = status === 'published' ? new Date().toISOString() : null;
    const tagsArray = Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []);

    const { rows } = await pool.query(
      `INSERT INTO blog_posts (slug, title, content, excerpt, cover_image, author, tags, status, meta_title, meta_description, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [slug, title, content || '', excerpt || null, cover_image || null, 'TShirt Brothers', tagsArray, status || 'draft', meta_title || null, meta_description || null, publishedAt]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /:id - Update post (admin only)
router.put('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, slug, content, excerpt, cover_image, tags, status, meta_title, meta_description } = req.body;

    const tagsArray = tags !== undefined
      ? (Array.isArray(tags) ? tags : tags.split(',').map(t => t.trim()).filter(Boolean))
      : undefined;

    const { rows } = await pool.query(
      `UPDATE blog_posts SET
        title = COALESCE($1, title),
        slug = COALESCE($2, slug),
        content = COALESCE($3, content),
        excerpt = COALESCE($4, excerpt),
        cover_image = COALESCE($5, cover_image),
        tags = COALESCE($6, tags),
        status = COALESCE($7, status),
        meta_title = COALESCE($8, meta_title),
        meta_description = COALESCE($9, meta_description),
        updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [title, slug, content, excerpt, cover_image, tagsArray, status, meta_title, meta_description, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id - Delete post (admin only)
router.delete('/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM blog_posts WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// POST /:id/publish - Publish post (admin only)
router.post('/:id/publish', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE blog_posts SET status = 'published', published_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router;
