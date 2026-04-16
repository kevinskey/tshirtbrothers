import { Router } from 'express';
import OpenAI from 'openai';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

function getClient() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not configured');
  return new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: key });
}

// ── CRUD ─────────────────────────────────────────────────────────────────

// List entries (newest first) with optional text search
router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (q) {
      const pattern = `%${String(q).toLowerCase()}%`;
      const { rows } = await pool.query(
        `SELECT id, title, LEFT(body, 220) AS preview, mood, tags, created_at, updated_at
           FROM journal_entries
          WHERE user_id = $1
            AND (LOWER(title) LIKE $2 OR LOWER(body) LIKE $2)
          ORDER BY created_at DESC
          LIMIT 200`,
        [req.user.id, pattern]
      );
      return res.json(rows);
    }
    const { rows } = await pool.query(
      `SELECT id, title, LEFT(body, 220) AS preview, mood, tags, created_at, updated_at
         FROM journal_entries
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 200`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Get a single entry (full body)
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM journal_entries WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Create entry
router.post('/', async (req, res, next) => {
  try {
    const { title = '', body = '', mood, tags } = req.body;
    if (!body && !title) return res.status(400).json({ error: 'Write something first' });
    const { rows } = await pool.query(
      `INSERT INTO journal_entries (user_id, title, body, mood, tags)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, title, body, mood || null, Array.isArray(tags) ? tags : null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// Update entry
router.put('/:id', async (req, res, next) => {
  try {
    const { title, body, mood, tags } = req.body;
    const { rows } = await pool.query(
      `UPDATE journal_entries SET
         title = COALESCE($1, title),
         body = COALESCE($2, body),
         mood = $3,
         tags = COALESCE($4, tags),
         updated_at = NOW()
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [title ?? null, body ?? null, mood ?? null, Array.isArray(tags) ? tags : null, req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Delete entry
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM journal_entries WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── AI: ask about the journal ────────────────────────────────────────────
// Uses the user's recent entries (up to 30) as context so the AI can
// remind, find themes, surface relevant passages, or riff for lyrics.
router.post('/ask', async (req, res, next) => {
  try {
    const { question, mode = 'recall' } = req.body;
    if (!question) return res.status(400).json({ error: 'question is required' });

    const { rows: entries } = await pool.query(
      `SELECT id, title, body, mood, created_at
         FROM journal_entries
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 30`,
      [req.user.id]
    );

    if (entries.length === 0) {
      return res.json({ reply: "You don't have any journal entries yet. Start writing and I can help you recall, connect, and turn your musings into songs." });
    }

    // Compact context — keep each entry short enough
    const context = entries.map((e) => {
      const dateStr = new Date(e.created_at).toLocaleDateString();
      const body = (e.body || '').slice(0, 1200);
      return `[#${e.id} · ${dateStr}${e.mood ? ' · ' + e.mood : ''}] ${e.title ? e.title + ' — ' : ''}${body}`;
    }).join('\n\n---\n\n');

    const modeInstructions = {
      recall: 'Help the user recall what they wrote. When you reference an entry, cite it as [#id from date].',
      themes: 'Identify patterns, recurring themes, emotional arcs. Cite entry IDs.',
      inspire: 'Use entries as raw material for song ideas. Suggest angles, metaphors, or lyric directions.',
    }[mode] || 'Be helpful.';

    const client = getClient();
    const ai = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are the user's journal assistant. You have access to their recent journal entries below. ${modeInstructions}

Be warm, concise, and specific. Quote actual phrases they wrote when useful. Never invent entries — only reference what's in the provided context. If the question isn't answerable from their journal, say so honestly.

JOURNAL ENTRIES (newest first):
${context}`,
        },
        { role: 'user', content: question },
      ],
      temperature: 0.6,
      max_tokens: 900,
    });

    const reply = ai.choices?.[0]?.message?.content || '(no response)';

    try {
      await pool.query(
        'INSERT INTO ai_logs (user_id, feature, input_preview, output_preview) VALUES ($1, $2, $3, $4)',
        [req.user.id, `journal-${mode}`, question.slice(0, 200), reply.slice(0, 200)]
      );
    } catch { /* noop */ }

    res.json({ reply, entry_count: entries.length });
  } catch (err) { next(err); }
});

// ── AI: on this day (from previous years/months) ─────────────────────────
router.get('/on-this-day', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, LEFT(body, 300) AS preview, created_at
         FROM journal_entries
        WHERE user_id = $1
          AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
          AND EXTRACT(DAY FROM created_at) = EXTRACT(DAY FROM NOW())
          AND created_at < NOW() - INTERVAL '1 day'
        ORDER BY created_at DESC
        LIMIT 5`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
