import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { checkAIBudget } from '../middleware/aiBudget.js';

const router = Router();
router.use(authenticate);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const base = file.originalname.replace(/[^a-z0-9.\-]/gi, '_');
      cb(null, `${Date.now()}-${base}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

function getClient() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not configured');
  return new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: key });
}

// ── Heuristic PDF text splitter ──────────────────────────────────────────
// pdf-parse separates pages with \f (form-feed). We track page numbers as
// we scan so each entry records page_start and page_end in the PDF.
function splitSpiritualsFromText(text) {
  if (!text) return [];
  const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = norm.split('\n');

  const entries = [];
  let current = null;
  let currentPage = 1;   // 1-indexed page counter

  const numberedRe = /^\s*(\d+)[.)]\s+(.{2,80})$/;
  const allCapsRe = /^\s*([A-Z][A-Z'\- ,.!?]{3,80})\s*$/;

  function commit() {
    if (current && current.lyrics.trim()) {
      current.page_end = currentPage;
      entries.push(current);
    }
  }

  for (const raw of lines) {
    // Detect page break (form-feed char). It can be on its own line OR
    // embedded in a line along with content.
    const ffCount = (raw.match(/\f/g) || []).length;
    if (ffCount > 0) currentPage += ffCount;

    // Strip form-feeds before continuing
    const line = raw.replace(/\f/g, '').replace(/\s+$/, '');
    if (!line) {
      if (current) current.lyrics += '\n';
      continue;
    }

    const numMatch = line.match(numberedRe);
    const capsMatch = !numMatch && line.match(allCapsRe) && line.trim().split(/\s+/).length >= 2;

    if (numMatch) {
      commit();
      current = {
        number: parseInt(numMatch[1], 10),
        title: numMatch[2].trim(),
        lyrics: '',
        page_start: currentPage,
        page_end: currentPage,
      };
      continue;
    }
    if (capsMatch) {
      commit();
      current = {
        number: null,
        title: toTitleCase(line.trim()),
        lyrics: '',
        page_start: currentPage,
        page_end: currentPage,
      };
      continue;
    }
    if (current) current.lyrics += line + '\n';
  }
  commit();

  return entries.map((e, i) => ({
    number: e.number ?? i + 1,
    title: e.title,
    lyrics: e.lyrics.replace(/\n{3,}/g, '\n\n').trim(),
    page_start: e.page_start,
    page_end: e.page_end,
  }));
}

function toTitleCase(s) {
  return s.toLowerCase().split(/(\s+)/).map((w) => {
    if (/\s+/.test(w)) return w;
    if (/^(a|an|the|and|or|but|of|in|on|to|by|for|from|with|at|as|my|o)$/i.test(w) && w.length < 4) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join('').replace(/^./, (c) => c.toUpperCase());
}

// ── LIST / GET / CRUD ────────────────────────────────────────────────────

router.get('/', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, number, title, LEFT(lyrics, 180) AS preview, source, source_file, page_start, page_end
         FROM spirituals
        ORDER BY COALESCE(number, 9999), title
        LIMIT 500`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM spirituals WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { number, title, lyrics, notes = '', source = '', page_start = null, page_end = null } = req.body;
    if (!title || !lyrics) return res.status(400).json({ error: 'title and lyrics are required' });
    const { rows } = await pool.query(
      `INSERT INTO spirituals (number, title, lyrics, notes, source, page_start, page_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [number || null, title, lyrics, notes, source, page_start, page_end]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { number, title, lyrics, notes, source, page_start, page_end } = req.body;
    const { rows } = await pool.query(
      `UPDATE spirituals SET
         number = COALESCE($1, number),
         title = COALESCE($2, title),
         lyrics = COALESCE($3, lyrics),
         notes = COALESCE($4, notes),
         source = COALESCE($5, source),
         page_start = $6,
         page_end = $7,
         updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [number ?? null, title ?? null, lyrics ?? null, notes ?? null, source ?? null, page_start ?? null, page_end ?? null, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM spirituals WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.post('/bulk', async (req, res, next) => {
  try {
    const { entries, source = '', source_file = '', replace_all = false } = req.body;
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'entries array is required' });
    }

    if (replace_all) {
      await pool.query('DELETE FROM spirituals');
    }

    let inserted = 0;
    for (const e of entries) {
      if (!e?.title || !e?.lyrics) continue;
      await pool.query(
        `INSERT INTO spirituals (number, title, lyrics, source, source_file, page_start, page_end)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [e.number ?? null, e.title, e.lyrics, source, source_file, e.page_start ?? null, e.page_end ?? null]
      );
      inserted++;
    }
    res.json({ inserted });
  } catch (err) { next(err); }
});

// ── PDF UPLOAD + PARSE ───────────────────────────────────────────────────
router.post('/upload', upload.single('pdf'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let parsed;
    try {
      const { default: pdfParse } = await import('pdf-parse');
      const dataBuffer = fs.readFileSync(req.file.path);
      parsed = await pdfParse(dataBuffer);
    } catch (err) {
      return res.status(500).json({
        error: `PDF parsing failed: ${err.message}. Make sure pdf-parse is installed (npm install in server/).`,
      });
    }

    const entries = splitSpiritualsFromText(parsed.text);

    res.json({
      pages: parsed.numpages,
      character_count: parsed.text.length,
      entries,
      source_file: `/uploads/${req.file.filename}`,
      filename: req.file.originalname,
    });
  } catch (err) { next(err); }
});

router.post('/parse-text', async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const entries = splitSpiritualsFromText(text);
    res.json({ entries });
  } catch (err) { next(err); }
});

// ── AI THEME SEARCH ──────────────────────────────────────────────────────
router.post('/search', checkAIBudget, async (req, res, next) => {
  try {
    const { theme, count = 5 } = req.body;
    if (!theme) return res.status(400).json({ error: 'theme is required' });
    const safeCount = Math.min(Math.max(parseInt(count) || 5, 1), 10);

    const { rows: all } = await pool.query(
      `SELECT id, number, title, LEFT(lyrics, 260) AS preview FROM spirituals ORDER BY number, title`
    );

    if (all.length === 0) {
      return res.json({ results: [], message: 'No spirituals in the collection yet. Upload a PDF first.' });
    }

    const catalog = all.map((s) => `[${s.id}] ${s.title}: ${s.preview.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n');

    const client = getClient();
    const ai = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a music librarian helping a songwriter find spirituals on a theme.

Given the catalog below, pick the ${safeCount} best matches for the user's theme. Use the numeric IDs in brackets.

Output STRICT JSON:
{
  "results": [
    { "id": 42, "why_it_fits": "one-sentence reason" }
  ]
}

CATALOG:
${catalog}`,
        },
        { role: 'user', content: `Theme: ${theme}\n\nFind ${safeCount} spirituals that fit.` },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    let parsed;
    try { parsed = JSON.parse(ai.choices?.[0]?.message?.content || '{}'); }
    catch { return res.status(502).json({ error: 'AI returned malformed response' }); }

    const ids = (parsed.results || []).map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return res.json({ results: [] });

    const { rows: full } = await pool.query(
      `SELECT * FROM spirituals WHERE id = ANY($1::int[])`,
      [ids]
    );

    const enriched = ids
      .map((id) => {
        const s = full.find((x) => x.id === id);
        const meta = (parsed.results || []).find((r) => r.id === id);
        return s ? { ...s, why_it_fits: meta?.why_it_fits || '' } : null;
      })
      .filter(Boolean);

    try {
      await pool.query(
        'INSERT INTO ai_logs (user_id, feature, input_preview, output_preview) VALUES ($1, $2, $3, $4)',
        [req.user.id, 'spirituals-search', theme.slice(0, 200), enriched.map((e) => e.title).join(' | ').slice(0, 200)]
      );
    } catch { /* noop */ }

    res.json({ results: enriched });
  } catch (err) { next(err); }
});

export default router;
