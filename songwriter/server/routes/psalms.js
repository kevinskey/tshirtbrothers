import { Router } from 'express';
import OpenAI from 'openai';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { checkAIBudget } from '../middleware/aiBudget.js';

const router = Router();
router.use(authenticate);

// ── Public-domain Bible translations available via bible-api.com ─────────
// (bible-api.com only indexes public-domain translations, which is why
// NIV / ESV / NASB / NKJV etc. aren't available — they're copyrighted.)
const TRANSLATIONS = {
  kjv:       { label: 'King James Version (1611)',    lang: 'en' },
  web:       { label: 'World English Bible (modern)', lang: 'en' },
  'oeb-us':  { label: 'Open English Bible (US)',      lang: 'en' },
  'oeb-cw':  { label: 'Open English Bible (UK/CW)',   lang: 'en' },
  bbe:       { label: 'Bible in Basic English',       lang: 'en' },
  asv:       { label: 'American Standard Version',    lang: 'en' },
  ylt:       { label: 'Young\'s Literal Translation', lang: 'en' },
  dra:       { label: 'Douay-Rheims (Catholic)',      lang: 'en' },
  clementine:{ label: 'Clementine Vulgate (Latin)',   lang: 'la' },
  almeida:   { label: 'Almeida (Portuguese)',         lang: 'pt' },
  rccv:      { label: 'Cornilescu (Romanian)',        lang: 'ro' },
};
const DEFAULT_TRANSLATION = 'kjv';

function normalizeTranslation(t) {
  const code = String(t || '').toLowerCase();
  return TRANSLATIONS[code] ? code : DEFAULT_TRANSLATION;
}

// GET /api/psalms/translations — list available translations
router.get('/translations', (_req, res) => {
  res.json({
    translations: Object.entries(TRANSLATIONS).map(([code, meta]) => ({ code, ...meta })),
    default: DEFAULT_TRANSLATION,
  });
});

// ── Psalm text fetch + cache ─────────────────────────────────────────────

const psalmCache = new Map(); // `${translation}:${number}` -> psalm data

async function fetchPsalm(number, translation = DEFAULT_TRANSLATION) {
  const n = parseInt(number, 10);
  if (!n || n < 1 || n > 150) throw new Error('Psalm number must be 1-150');

  const tx = normalizeTranslation(translation);
  const cacheKey = `${tx}:${n}`;
  const cached = psalmCache.get(cacheKey);
  if (cached) return cached;

  const url = `https://bible-api.com/psalms+${n}?translation=${tx}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bible-api returned ${res.status} for ${tx} Psalm ${n}`);
  const data = await res.json();

  const result = {
    number: n,
    reference: data.reference,
    translation_code: tx,
    verses: (data.verses || []).map((v) => ({ verse: v.verse, text: v.text.trim() })),
    text: (data.text || '').trim(),
    translation: data.translation_name || TRANSLATIONS[tx]?.label || tx,
    translation_note: data.translation_note || 'Public Domain',
  };
  psalmCache.set(cacheKey, result);
  return result;
}

// GET /api/psalms/:number?translation=web — fetch one psalm
router.get('/:number', async (req, res, next) => {
  try {
    const psalm = await fetchPsalm(req.params.number, req.query.translation);
    res.json(psalm);
  } catch (err) { next(err); }
});

// ── AI-powered theme search ──────────────────────────────────────────────

function getClient() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not configured');
  return new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: key });
}

router.post('/search', checkAIBudget, async (req, res, next) => {
  try {
    const { theme, count = 4, translation } = req.body;
    if (!theme) return res.status(400).json({ error: 'theme is required' });

    const safeCount = Math.min(Math.max(parseInt(count) || 4, 1), 8);
    const tx = normalizeTranslation(translation);

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

    const enriched = [];
    for (const r of (parsed.results || []).slice(0, safeCount)) {
      try {
        const psalm = await fetchPsalm(r.number, tx);
        enriched.push({ ...psalm, why_it_fits: r.why_it_fits || '' });
      } catch (err) {
        console.error(`[psalms/search] failed to fetch psalm ${r.number} (${tx}):`, err.message);
      }
    }

    try {
      await pool.query(
        'INSERT INTO ai_logs (user_id, feature, input_preview, output_preview) VALUES ($1, $2, $3, $4)',
        [req.user.id, 'psalms-search', `${theme} [${tx}]`.slice(0, 300), enriched.map((e) => e.number).join(', ')]
      );
    } catch { /* noop */ }

    res.json({ psalms: enriched });
  } catch (err) { next(err); }
});

// ── Adapt a psalm into modern song lyrics ────────────────────────────────
router.post('/adapt', checkAIBudget, async (req, res, next) => {
  try {
    const {
      psalm_number,
      psalm_text,
      style = '',
      preserve_imagery = true,
      translation,
    } = req.body;

    let sourceText = psalm_text;
    let reference = '';
    if (!sourceText && psalm_number) {
      const p = await fetchPsalm(psalm_number, translation);
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

// ─────────────────────────────────────────────────────────────────────────
// BIBLE-WIDE SEARCH (not just psalms)
// Uses AI to pick relevant verse references for a query, then fetches the
// real verse text from bible-api.com. This endpoint is mounted at
// /api/psalms/bible/search for colocation, but searches the whole Bible.
// ─────────────────────────────────────────────────────────────────────────

// Passage-level cache, keyed by `${tx}:${reference}`
const passageCache = new Map();

async function fetchPassage(reference, translation) {
  const tx = normalizeTranslation(translation);
  const cacheKey = `${tx}:${reference}`;
  if (passageCache.has(cacheKey)) return passageCache.get(cacheKey);

  const ref = String(reference || '').trim();
  if (!ref) throw new Error('reference required');
  // bible-api.com accepts refs like "John 3:16" or "Isaiah 40:28-31"
  const url = `https://bible-api.com/${encodeURIComponent(ref)}?translation=${tx}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`bible-api returned ${res.status} for ${ref} (${tx})`);
  const data = await res.json();

  const result = {
    reference: data.reference || ref,
    translation_code: tx,
    translation: data.translation_name || TRANSLATIONS[tx]?.label || tx,
    translation_note: data.translation_note || 'Public Domain',
    verses: (data.verses || []).map((v) => ({
      book: v.book_name,
      chapter: v.chapter,
      verse: v.verse,
      text: (v.text || '').trim(),
    })),
    text: (data.text || '').trim(),
  };
  passageCache.set(cacheKey, result);
  return result;
}

router.post('/bible/search', checkAIBudget, async (req, res, next) => {
  try {
    const { query, count = 6, translation, testament = 'any' } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const safeCount = Math.min(Math.max(parseInt(count) || 6, 1), 12);
    const tx = normalizeTranslation(translation);

    const testamentFilter =
      testament === 'ot' ? 'Restrict to the Old Testament (Genesis through Malachi).'
      : testament === 'nt' ? 'Restrict to the New Testament (Matthew through Revelation).'
      : 'Search the entire Bible (both Old and New Testaments).';

    const client = getClient();
    const ai = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a Bible concordance scholar. The user is searching the Bible for verses matching a word, phrase, or idea.

${testamentFilter}

Return the ${safeCount} BEST-MATCHING passages. Use real, existing references only — do not invent. Format references as "Book Chapter:Verse" or "Book Chapter:Verse-Verse" for short ranges (max ~5 verses per range).

Good book name formats: Genesis, Exodus, 1 Samuel, 2 Kings, Psalms, Song of Solomon, Matthew, 1 Corinthians, Revelation.

Output STRICT JSON:
{
  "results": [
    { "reference": "John 3:16", "why_it_fits": "the core verse on God's love and eternal life" }
  ]
}

Order by strongest match. If fewer than ${safeCount} strong matches exist, return fewer.`,
        },
        {
          role: 'user',
          content: `Search the Bible for: ${query}\n\nFind up to ${safeCount} passages that fit.`,
        },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const raw = ai.choices?.[0]?.message?.content || '{"results":[]}';
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(502).json({ error: 'AI returned malformed response' }); }

    const enriched = [];
    for (const r of (parsed.results || []).slice(0, safeCount)) {
      if (!r?.reference) continue;
      try {
        const passage = await fetchPassage(r.reference, tx);
        enriched.push({ ...passage, why_it_fits: r.why_it_fits || '' });
      } catch (err) {
        console.error(`[bible/search] fetch failed for ${r.reference}:`, err.message);
      }
    }

    try {
      await pool.query(
        'INSERT INTO ai_logs (user_id, feature, input_preview, output_preview) VALUES ($1, $2, $3, $4)',
        [req.user.id, 'bible-search', `${query} [${tx}]`.slice(0, 300), enriched.map((e) => e.reference).join(' | ')]
      );
    } catch { /* noop */ }

    res.json({ passages: enriched });
  } catch (err) { next(err); }
});

// GET a passage by reference (e.g. ?ref=John+3:16&translation=web)
router.get('/bible/passage', async (req, res, next) => {
  try {
    const { ref, translation } = req.query;
    if (!ref) return res.status(400).json({ error: 'ref is required' });
    const passage = await fetchPassage(ref, translation);
    res.json(passage);
  } catch (err) {
    next(err);
  }
});

export default router;
