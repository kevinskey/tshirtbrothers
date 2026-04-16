import { Router } from 'express';
import OpenAI from 'openai';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ── Psalm text fetch + cache ─────────────────────────────────────────────
// Uses bible-api.com (KJV, public domain, no key required)

const psalmCache = new Map(); // number -> { reference, verses, text, translation_note }

async function fetchPsalm(number) {
  const n = parseInt(number, 10);
  if (!n || n < 1 || n > 150) throw new Error('Psalm number must be 1-150');

  const cached = psalmCache.get(n);
  if (cached) return cached;

  const url = `https://bible-api.com/psalms+${n}?translation=kjv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bible-api returned ${res.status}`);
  const data = await res.json();

  const result = {
    number: n,
    reference: data.reference,
    verses: (data.verses || []).map((v) => ({ verse: v.verse, text: v.text.trim() })),
    text: (data.text || '').trim(),
    translation: data.translation_name || 'King James Version',
    translation_note: data.translation_note || 'Public Domain',
  };
  psalmCache.set(n, result);
  return result;
}

// GET /api/psalms/:number — fetch one psalm
router.get('/:number', async (req, res, next) => {
  try {
    const psalm = await fetchPsalm(req.params.number);
    res.json(psalm);
  } catch (err) { next(err); }
});

// ── AI-powered theme search ──────────────────────────────────────────────
// Given a theme, asks AI which psalm numbers best fit, then fetches those.

function getClient() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not configured');
  return new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: key });
}

router.post('/search', async (req, res, next) => {
  try {
    const { theme, count = 4 } = req.body;
    if (!theme) return res.status(400).json({ error: 'theme is required' });

    const safeCount = Math.min(Math.max(parseInt(count) || 4, 1), 8);

    const client = getClient();
    const ai = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a Bible scholar. The user is searching the Book of Psalms for passages on a specific theme.

Output STRICT JSON with psalm numbers and one-sentence notes on why each fits:
{
  "results": [
    { "number": 23, "why_it_fits": "the shepherd and comfort in the valley of shadow" }
  ]
}

Return up to ${safeCount} of the BEST fits from Psalms 1-150. Only include real psalm numbers (1-150). If fewer fit well, return fewer. Order by strongest match first.`,
        },
        { role: 'user', content: `Theme: ${theme}\n\nFind ${safeCount} psalms that fit.` },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const raw = ai.choices?.[0]?.message?.content || '{"results":[]}';
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(500).json({ error: 'Failed to parse AI response' }); }

    // Fetch each psalm's text
    const enriched = [];
    for (const r of (parsed.results || []).slice(0, safeCount)) {
      try {
        const psalm = await fetchPsalm(r.number);
        enriched.push({
          ...psalm,
          why_it_fits: r.why_it_fits || '',
        });
      } catch (err) {
        console.error(`[psalms/search] failed to fetch psalm ${r.number}:`, err.message);
      }
    }

    try {
      await pool.query(
        'INSERT INTO ai_logs (user_id, feature, input_preview, output_preview) VALUES ($1, $2, $3, $4)',
        [req.user.id, 'psalms-search', theme.slice(0, 300), enriched.map((e) => e.number).join(', ')]
      );
    } catch { /* noop */ }

    res.json({ psalms: enriched });
  } catch (err) { next(err); }
});

// ── Adapt a psalm into modern song lyrics ────────────────────────────────
router.post('/adapt', async (req, res, next) => {
  try {
    const { psalm_number, psalm_text, style = '', preserve_imagery = true } = req.body;

    let sourceText = psalm_text;
    let reference = '';
    if (!sourceText && psalm_number) {
      const p = await fetchPsalm(psalm_number);
      sourceText = p.text;
      reference = p.reference;
    }
    if (!sourceText) return res.status(400).json({ error: 'psalm_number or psalm_text is required' });

    const client = getClient();
    const ai = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a songwriter adapting a psalm into modern song lyrics for a contemporary audience.

RULES:
- Keep the spiritual essence and message of the psalm intact.
- ${preserve_imagery ? 'Preserve the key imagery (shepherd, still waters, mountains, etc.) but in natural modern English.' : 'Reimagine the imagery in modern, relatable terms.'}
- Modern conversational English — no "thee", "thou", "shalt".
- Build a song structure: one or two verses and a strong, singable chorus.
- Make the chorus catchy and repeatable — it's the hook.
- ${style ? `Style/feel: ${style}` : 'Style: whatever fits the psalm best.'}

Output STRICT JSON:
{
  "title": "song title",
  "sections": [
    { "type": "verse" | "chorus" | "bridge", "label": "Verse 1" | "Chorus" | "Bridge", "lines": ["...", "..."] }
  ]
}`,
        },
        {
          role: 'user',
          content: `Source psalm${reference ? ` (${reference})` : ''}:\n\n${sourceText}\n\nAdapt this into a modern song.`,
        },
      ],
      temperature: 0.85,
      max_tokens: 1500,
      response_format: { type: 'json_object' },
    });

    const raw = ai.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(500).json({ error: 'Failed to parse AI response' }); }

    try {
      await pool.query(
        'INSERT INTO ai_logs (user_id, feature, input_preview, output_preview) VALUES ($1, $2, $3, $4)',
        [req.user.id, 'psalm-adapt', `psalm ${psalm_number || '(text)'}`, parsed.title || '']
      );
    } catch { /* noop */ }

    res.json(parsed);
  } catch (err) { next(err); }
});

export default router;
