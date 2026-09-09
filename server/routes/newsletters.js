// TSB Newsletter Builder — modular block newsletters that send through the
// existing email_campaigns pipeline (same recipients, tracking, unsubscribe,
// analytics). Mounted at /api/newsletters, admin-only.
import { Router } from 'express';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';
import {
  renderNewsletterHtml, validateNewsletter, defaultBlocks, BLOCK_TYPES, safeUrl,
} from '../services/newsletterRender.js';
import { templateMeta, templateBySlug } from '../services/newsletterTemplates.js';
import { blastNewsletter } from '../services/newsletterBlast.js';

const router = Router();
router.use(authenticate, adminOnly);

// Strip a client-posted blocks array down to known shapes. Data values are
// escaped at render time, so storage keeps raw text; this guards types.
function cleanBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .filter((b) => b && typeof b === 'object' && BLOCK_TYPES.includes(b.type))
    .slice(0, 24)
    .map((b, i) => ({
      id: String(b.id || `blk-${i + 1}`).slice(0, 40),
      type: b.type,
      enabled: b.enabled !== false,
      data: (b.data && typeof b.data === 'object' && !Array.isArray(b.data)) ? b.data : {},
    }));
}

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.name, n.subject, n.status, n.is_template, n.created_at, n.updated_at,
              n.sent_campaign_id,
              c.sent_count, c.recipient_count, c.sent_at
         FROM newsletters n
         LEFT JOIN email_campaigns c ON c.id = n.sent_campaign_id
        ORDER BY n.is_template DESC, n.updated_at DESC
        LIMIT 100`,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// System template library — code-defined; copied into newsletters at create.
router.get('/templates', (_req, res) => {
  res.json({ templates: templateMeta() });
});

router.get('/templates/:slug/preview', (req, res) => {
  const t = templateBySlug(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Unknown template' });
  res.json({ html: renderNewsletterHtml(t.blocks(), { theme: t.theme, preheader: t.description }) });
});

// Create — blank default, or cloned from a template/newsletter (`from_id`),
// or from a library template (`template_slug`).
router.post('/', async (req, res, next) => {
  try {
    const { name, from_id, template_slug } = req.body || {};
    let blocks = defaultBlocks();
    let subject = '';
    let preheader = '';
    let theme = {};
    let slugRecord = null;
    if (template_slug) {
      const t = templateBySlug(template_slug);
      if (!t) return res.status(404).json({ error: 'Unknown template' });
      blocks = t.blocks();
      theme = { ...t.theme };
      slugRecord = t.slug;
      subject = t.defaultSubject;
      preheader = t.defaultPreheader;
    } else if (from_id) {
      const src = await pool.query('SELECT * FROM newsletters WHERE id = $1', [Number(from_id)]);
      if (src.rows.length === 0) return res.status(404).json({ error: 'Source newsletter not found' });
      blocks = src.rows[0].blocks;
      subject = src.rows[0].subject;
      preheader = src.rows[0].preheader;
      theme = src.rows[0].theme || {};
      slugRecord = src.rows[0].template_slug || null;
    }
    const { rows } = await pool.query(
      `INSERT INTO newsletters (name, subject, preheader, blocks, theme, template_slug, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7) RETURNING *`,
      [String(name || 'Untitled newsletter').slice(0, 160), subject, preheader,
        JSON.stringify(blocks), JSON.stringify(theme), slugRecord, req.user?.id || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM newsletters WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id(\\d+)', async (req, res, next) => {
  try {
    const { name, subject, preheader, blocks } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE newsletters
          SET name = COALESCE($1, name),
              subject = COALESCE($2, subject),
              preheader = COALESCE($3, preheader),
              blocks = COALESCE($4::jsonb, blocks),
              updated_at = NOW()
        WHERE id = $5 RETURNING *`,
      [name != null ? String(name).slice(0, 160) : null,
        subject != null ? String(subject).slice(0, 255) : null,
        preheader != null ? String(preheader).slice(0, 255) : null,
        blocks != null ? JSON.stringify(cleanBlocks(blocks)) : null,
        req.params.id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id(\\d+)', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM newsletters WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:id(\\d+)/duplicate', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `INSERT INTO newsletters (name, subject, preheader, blocks, theme, template_slug, created_by)
       SELECT name || ' (copy)', subject, preheader, blocks, theme, template_slug, $2
         FROM newsletters WHERE id = $1
       RETURNING *`,
      [req.params.id, req.user?.id || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/:id(\\d+)/save-as-template', async (req, res, next) => {
  try {
    const { name } = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO newsletters (name, subject, preheader, blocks, theme, template_slug, is_template, created_by)
       SELECT $2, subject, preheader, blocks, theme, template_slug, true, $3
         FROM newsletters WHERE id = $1
       RETURNING *`,
      [req.params.id, String(name || 'Saved template').slice(0, 160), req.user?.id || null],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// Preview — render blocks posted from the editor (unsaved edits included).
router.post('/preview', async (req, res, next) => {
  try {
    const { blocks, preheader, theme } = req.body || {};
    const html = renderNewsletterHtml(cleanBlocks(blocks), { preheader: preheader || '', theme: theme || {} });
    res.json({ html });
  } catch (err) { next(err); }
});

// Send — test email or a real segment blast (shared engine, also used by
// the schedule runner).
router.post('/:id(\\d+)/send', async (req, res, next) => {
  try {
    const { filter = 'all', test_email } = req.body || {};
    const blast = await blastNewsletter({
      newsletterId: Number(req.params.id),
      filter,
      testEmail: test_email || null,
      userId: req.user?.id || null,
    });
    // Fire-and-forget: the worker finishes in the background.
    blast.done.catch(() => {});
    res.status(202).json({ campaign_id: blast.campaignId, recipient_count: blast.recipientCount, test: blast.isTest });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message, details: err.details });
    next(err);
  }
});

// ── Scheduled + recurring sends ─────────────────────────────────────────

const VALID_FILTERS = ['all', 'recent_quoted', 'past_invoiced', 'new_30', 'prospects'];

router.get('/schedules', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.newsletter_id, s.filter, s.recurrence, s.next_run_at, s.active,
              s.last_run_at, s.last_campaign_id, n.name, n.subject
         FROM newsletter_schedules s JOIN newsletters n ON n.id = s.newsletter_id
        WHERE s.active ORDER BY s.next_run_at LIMIT 50`,
    );
    res.json({ schedules: rows });
  } catch (err) { next(err); }
});

router.post('/:id(\\d+)/schedule', async (req, res, next) => {
  try {
    const { send_at, recurrence = 'once', filter = 'all' } = req.body || {};
    const when = new Date(send_at);
    if (isNaN(when) || when.getTime() < Date.now() - 60_000) {
      return res.status(400).json({ error: 'Pick a date and time in the future.' });
    }
    if (!['once', 'weekly', 'monthly'].includes(recurrence)) return res.status(400).json({ error: 'Bad recurrence' });
    if (!VALID_FILTERS.includes(filter)) return res.status(400).json({ error: 'Bad audience filter' });
    const nl = await pool.query('SELECT id, subject, blocks FROM newsletters WHERE id = $1', [req.params.id]);
    if (nl.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const errors = validateNewsletter({ subject: nl.rows[0].subject, blocks: nl.rows[0].blocks });
    if (errors.length) return res.status(400).json({ error: 'Newsletter is not ready to schedule.', details: errors });
    const { rows } = await pool.query(
      `INSERT INTO newsletter_schedules (newsletter_id, filter, recurrence, next_run_at, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, filter, recurrence, when.toISOString(), req.user?.id || null],
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/schedules/:sid(\\d+)', async (req, res, next) => {
  try {
    await pool.query('UPDATE newsletter_schedules SET active = false WHERE id = $1', [req.params.sid]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Product picker — light search over the catalog so admins can drop real
// products into the Featured Products block without retyping details.
router.get('/product-search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ products: [] });
    const { rows } = await pool.query(
      `SELECT id, ss_id, name, brand, category, image_url
         FROM products
        WHERE name ILIKE $1 OR brand ILIKE $1 OR style_number ILIKE $1
        ORDER BY brand, name LIMIT 12`,
      [`%${q}%`],
    );
    res.json({
      products: rows.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        image_url: p.image_url ? p.image_url.replace('www.ssactivewear.com/Images', 'cdn.ssactivewear.com/Images') : '',
        url: safeUrl(`/shop?search=${encodeURIComponent(`${p.brand} ${p.name}`)}`),
      })),
    });
  } catch (err) { next(err); }
});

export default router;
