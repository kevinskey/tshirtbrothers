import { Router } from 'express';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Try again in a few minutes.' },
});
router.use(limiter);

function getClient() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not configured');
  return new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: key });
}

const MODEL = 'deepseek-chat';

async function callAI({ system, user, responseFormat, temperature = 0.8, maxTokens = 800 }) {
  const client = getClient();
  const req = {
    model: MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    max_tokens: maxTokens,
  };
  if (responseFormat === 'json') req.response_format = { type: 'json_object' };
  const res = await client.chat.completions.create(req);
  return res.choices?.[0]?.message?.content || '';
}

async function logAI(userId, feature, input, output) {
  try {
    await pool.query(
      'INSERT INTO ai_logs (user_id, feature, input_preview, output_preview) VALUES ($1, $2, $3, $4)',
      [userId, feature, String(input || '').slice(0, 300), String(output || '').slice(0, 300)]
    );
  } catch (err) {
    console.error('[ai_logs] insert failed:', err.message);
  }
}

// Rhymes for a word (with optional context + style)
router.post('/rhymes', async (req, res, next) => {
  try {
    const { word, context = '', style = '' } = req.body;
    if (!word) return res.status(400).json({ error: 'word is required' });

    const system = `You are a songwriter's rhyme assistant. Return diverse, useful rhymes — mix perfect rhymes, near rhymes (slant/assonance), and multi-syllable rhymes. Prefer rhymes that fit the song's mood.

Output STRICT JSON:
{
  "perfect": ["word1", "word2", ...],
  "near": ["word1", "word2", ...],
  "multi": ["two word", "multi syllable", ...]
}
Give 8-12 options per category when possible. No explanations.`;

    const user = `Word: ${word}
${context ? `Line context: ${context}\n` : ''}${style ? `Song style/mood: ${style}` : ''}`;

    const raw = await callAI({ system, user, responseFormat: 'json', temperature: 0.7, maxTokens: 600 });
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(500).json({ error: 'Failed to parse AI response' }); }

    logAI(req.user.id, 'rhymes', word, JSON.stringify(parsed).slice(0, 200));
    res.json(parsed);
  } catch (err) { next(err); }
});

// Suggest the next line given previous lines
router.post('/next-line', async (req, res, next) => {
  try {
    const { previous_lines = [], section_type = 'verse', style = '', count = 3 } = req.body;
    if (!Array.isArray(previous_lines) || previous_lines.length === 0) {
      return res.status(400).json({ error: 'previous_lines array is required' });
    }

    const system = `You are a songwriting co-writer. Given prior lines of a ${section_type}, suggest the next line.
Match the meter, rhyme scheme, and emotional tone. Do NOT repeat or paraphrase existing lines.

Output STRICT JSON: { "suggestions": ["line 1", "line 2", "line 3"] }
Give ${count} distinct suggestions. Lyrics only — no quotes, no numbering, no commentary.`;

    const user = `Style/mood: ${style || 'not specified'}
Previous lines:
${previous_lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}

Write ${count} options for the next line.`;

    const raw = await callAI({ system, user, responseFormat: 'json', temperature: 0.9, maxTokens: 500 });
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(500).json({ error: 'Failed to parse AI response' }); }

    logAI(req.user.id, 'next-line', previous_lines.join(' / '), (parsed.suggestions || []).join(' / '));
    res.json(parsed);
  } catch (err) { next(err); }
});

// Rewrite a specific line
router.post('/rewrite', async (req, res, next) => {
  try {
    const { line, instruction = 'make it stronger', context = '', count = 3 } = req.body;
    if (!line) return res.status(400).json({ error: 'line is required' });

    const system = `You are a songwriting editor. Rewrite the given line per the instruction. Keep roughly the same syllable count unless the instruction says otherwise. Preserve the line's function in the song.

Output STRICT JSON: { "rewrites": ["version 1", "version 2", "version 3"] }
Give ${count} distinct rewrites. Lyrics only.`;

    const user = `Context: ${context || 'none'}
Original line: ${line}
Instruction: ${instruction}`;

    const raw = await callAI({ system, user, responseFormat: 'json', temperature: 0.85, maxTokens: 400 });
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(500).json({ error: 'Failed to parse AI response' }); }

    logAI(req.user.id, 'rewrite', line, (parsed.rewrites || []).join(' / '));
    res.json(parsed);
  } catch (err) { next(err); }
});

export default router;
