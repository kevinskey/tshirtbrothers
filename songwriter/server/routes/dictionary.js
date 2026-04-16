import { Router } from 'express';
import OpenAI from 'openai';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { checkAIBudget } from '../middleware/aiBudget.js';

const router = Router();
router.use(authenticate);

// ── Simple in-memory cache (24h) ─────────────────────────────────────────
const cache = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { cache.delete(key); return null; }
  return hit.value;
}
function cacheSet(key, value) {
  cache.set(key, { value, expires: Date.now() + TTL_MS });
  if (cache.size > 2000) {
    const cutoff = Date.now();
    for (const [k, v] of cache) if (v.expires < cutoff) cache.delete(k);
  }
}

// ── Fetch helpers ────────────────────────────────────────────────────────

async function fetchDefinitions(word) {
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;

    // Normalize into something easier to render
    const phonetics = [];
    const meanings = [];
    let origin = '';

    for (const entry of data) {
      if (entry.origin && !origin) origin = entry.origin;
      for (const p of entry.phonetics || []) {
        if (p.text) phonetics.push({ text: p.text, audio: p.audio || null });
      }
      for (const m of entry.meanings || []) {
        meanings.push({
          partOfSpeech: m.partOfSpeech,
          definitions: (m.definitions || []).slice(0, 4).map((d) => ({
            definition: d.definition,
            example: d.example || null,
          })),
          synonyms: m.synonyms || [],
          antonyms: m.antonyms || [],
        });
      }
    }
    return { phonetics, meanings, origin };
  } catch (err) {
    console.error('[dictionary] definitions failed:', err.message);
    return null;
  }
}

async function datamuse(params, max = 25) {
  try {
    const qs = new URLSearchParams({ ...params, max: String(max) });
    const res = await fetch(`https://api.datamuse.com/words?${qs.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((x) => x.word).filter(Boolean);
  } catch {
    return [];
  }
}

// ── GET /api/dictionary/:word ───────────────────────────────────────────
router.get('/:word', async (req, res, next) => {
  try {
    const word = String(req.params.word || '').trim().toLowerCase();
    if (!word || !/^[a-z][a-z'\- ]{0,40}$/i.test(word)) {
      return res.status(400).json({ error: 'Please enter a valid English word' });
    }

    const cacheKey = `dict:${word}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    // Fetch everything in parallel
    const [defs, synonyms, antonyms, triggers, rhymes, nearRhymes, adjectivesFor, nounsFor, similarSound] = await Promise.all([
      fetchDefinitions(word),
      datamuse({ rel_syn: word }, 30),         // strict synonyms
      datamuse({ rel_ant: word }, 30),         // antonyms
      datamuse({ rel_trg: word }, 25),         // triggers / associations
      datamuse({ rel_rhy: word }, 30),         // perfect rhymes
      datamuse({ rel_nry: word }, 30),         // near (approximate) rhymes
      datamuse({ rel_jjb: word }, 20),         // adjectives often used with this noun
      datamuse({ rel_jja: word }, 20),         // nouns often used with this adjective
      datamuse({ sl: word }, 15),              // words that sound similar
    ]);

    // Merge dictionary-provided synonyms/antonyms with datamuse's lists
    const defSyn = new Set();
    const defAnt = new Set();
    (defs?.meanings || []).forEach((m) => {
      (m.synonyms || []).forEach((s) => defSyn.add(s));
      (m.antonyms || []).forEach((a) => defAnt.add(a));
    });
    const mergedSynonyms = Array.from(new Set([...defSyn, ...synonyms])).slice(0, 40);
    const mergedAntonyms = Array.from(new Set([...defAnt, ...antonyms])).slice(0, 30);

    const payload = {
      word,
      phonetics: defs?.phonetics || [],
      meanings: defs?.meanings || [],
      origin: defs?.origin || '',
      synonyms: mergedSynonyms,
      antonyms: mergedAntonyms,
      associations: triggers,
      rhymes,
      near_rhymes: nearRhymes,
      collocations: {
        // For a noun, adjectives that describe it ("silent night", "stormy sea")
        adjectives_for_noun: adjectivesFor,
        // For an adjective, nouns commonly paired ("silent prayer", "stormy weather")
        nouns_for_adjective: nounsFor,
      },
      similar_sound: similarSound,
    };

    cacheSet(cacheKey, payload);
    res.json(payload);
  } catch (err) { next(err); }
});

// ── AI-powered lyricist insights ─────────────────────────────────────────
function getClient() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not configured');
  return new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey: key });
}

router.post('/:word/insights', checkAIBudget, async (req, res, next) => {
  try {
    const word = String(req.params.word || '').trim().toLowerCase();
    if (!word) return res.status(400).json({ error: 'word required' });

    const aiCacheKey = `dict-ai:${word}`;
    const cached = cacheGet(aiCacheKey);
    if (cached) return res.json(cached);

    const client = getClient();
    const ai = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: `You are a lyricist's reference. Analyze a single English word for songwriting use. Output STRICT JSON:

{
  "connotation": "neutral | positive | negative | mixed",
  "register": "formal | casual | poetic | slang | archaic | technical",
  "emotional_weight": "light | medium | heavy",
  "sensory_feel": "one short phrase on how the word sounds/feels (e.g. 'soft and liquid', 'sharp and percussive')",
  "metaphor_ideas": ["3-5 fresh metaphors a songwriter could build around this word"],
  "contrast_pairs": ["2-3 words that create powerful contrast when paired"],
  "song_line_examples": ["3 brief original lyric lines (not from existing songs) showing the word used evocatively"],
  "pitfalls": "one sentence on clichés or overused contexts to avoid"
}

Be concise, specific, and useful to a working songwriter.`,
        },
        { role: 'user', content: `Word: ${word}` },
      ],
      temperature: 0.7,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });

    const raw = ai.choices?.[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(502).json({ error: 'AI returned malformed response' }); }

    cacheSet(aiCacheKey, parsed);

    try {
      await pool.query(
        'INSERT INTO ai_logs (user_id, feature, input_preview, output_preview) VALUES ($1, $2, $3, $4)',
        [req.user.id, 'dict-insights', word, JSON.stringify(parsed).slice(0, 300)]
      );
    } catch { /* noop */ }

    res.json(parsed);
  } catch (err) { next(err); }
});

export default router;
