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

// Generate a single section (verse / chorus / bridge / etc.)
router.post('/generate-section', async (req, res, next) => {
  try {
    const {
      section_type = 'verse',
      topic = '',
      style = '',
      existing_sections = [],  // [{ type, lines: [] }]
      line_count = section_type === 'chorus' ? 4 : 4,
    } = req.body;

    const system = `You are a professional songwriter. Write a single ${section_type} that fits the song.

RULES:
- Output ONLY the lyrics for this ${section_type}, one line per array entry.
- Match the style/mood provided.
- If other sections exist, maintain consistent voice, theme, and rhyme feel.
- ${section_type === 'chorus' ? 'Make it catchy and repeatable — this is the hook.' : ''}
- ${section_type === 'bridge' ? 'Shift perspective or add contrast — the bridge is the turning point.' : ''}
- ${section_type === 'verse' ? 'Advance the narrative — don\'t just restate the chorus.' : ''}
- Use vivid, concrete imagery. Avoid clichés.
- Aim for roughly consistent meter/syllable count per line.

Output STRICT JSON: { "lines": ["line 1", "line 2", ...] }
Exactly ${line_count} lines.`;

    const user = `Section to write: ${section_type}
Topic/theme: ${topic || 'not specified — infer from other sections'}
Style/mood: ${style || 'not specified'}

${existing_sections.length > 0 ? `EXISTING SECTIONS FOR CONTEXT:\n${existing_sections.map(s => `[${s.type}]\n${(s.lines || []).join('\n')}`).join('\n\n')}` : 'No existing sections — this is the start of the song.'}

Write the ${section_type} (${line_count} lines).`;

    const raw = await callAI({ system, user, responseFormat: 'json', temperature: 0.9, maxTokens: 800 });
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(500).json({ error: 'Failed to parse AI response' }); }

    logAI(req.user.id, 'generate-section', `${section_type}: ${topic}`, (parsed.lines || []).join(' / '));
    res.json(parsed);
  } catch (err) { next(err); }
});

// Generate a full song (structure + all sections)
router.post('/generate-song', async (req, res, next) => {
  try {
    const {
      topic,
      style = '',
      structure = ['verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'],
      title_suggestion = true,
    } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic is required' });

    const system = `You are a professional songwriter. Write a complete song on the given topic.

RULES:
- Follow the requested section structure exactly.
- Chorus lyrics should be THE SAME every time it appears (it's the hook).
- Verses should advance the story — each one distinct.
- Bridge should add contrast or perspective shift.
- Use vivid imagery, avoid clichés, stay consistent in voice and tone.
- Aim for consistent meter within each section.
- 4 lines per section is a good default unless the style calls for more.

Output STRICT JSON:
{
  ${title_suggestion ? '"title": "song title (under 50 chars)",' : ''}
  "sections": [
    { "type": "verse" | "chorus" | "bridge" | "pre-chorus" | "intro" | "outro", "label": "Verse 1" | "Chorus" | etc., "lines": ["line 1", "line 2", ...] }
  ]
}
${title_suggestion ? 'Include the title field.' : ''}`;

    const user = `Topic: ${topic}
Style/mood: ${style || 'whatever fits the topic best'}
Structure (in order): ${structure.join(' → ')}

Write the complete song.`;

    const raw = await callAI({ system, user, responseFormat: 'json', temperature: 0.9, maxTokens: 2500 });
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(500).json({ error: 'Failed to parse AI response' }); }

    logAI(req.user.id, 'generate-song', topic, parsed.title || '(song generated)');
    res.json(parsed);
  } catch (err) { next(err); }
});

// Find classic public-domain poetry on a theme
router.post('/find-poetry', async (req, res, next) => {
  try {
    const { theme, mood = '', count = 4 } = req.body;
    if (!theme) return res.status(400).json({ error: 'theme is required' });

    const system = `You are a poetry librarian. The user is a songwriter looking for classic public-domain poetry to inspire or adapt into lyrics.

Find ${count} real, public-domain poems that match the theme. Prefer poems published before 1928 (clearly public domain in the US). Authors like Whitman, Dickinson, Yeats, Frost, Keats, Wordsworth, Rumi, Hughes, Sandburg, Browning, Tennyson, Donne, Blake, Poe, etc.

For each poem, provide:
- title
- author
- year (approximate is fine)
- excerpt (4-12 of the strongest lines, formatted with line breaks)
- why_it_fits (one short sentence)

Output STRICT JSON:
{
  "poems": [
    { "title": "...", "author": "...", "year": "...", "excerpt": "line 1\\nline 2\\n...", "why_it_fits": "..." }
  ]
}

Only include real poems you're confident exist. If you can't find ${count} good matches, return fewer rather than fabricating.`;

    const user = `Theme: ${theme}
${mood ? `Mood/feel: ${mood}` : ''}

Find ${count} classic poems that fit.`;

    const raw = await callAI({ system, user, responseFormat: 'json', temperature: 0.5, maxTokens: 2000 });
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return res.status(500).json({ error: 'Failed to parse AI response' }); }

    logAI(req.user.id, 'find-poetry', `${theme} / ${mood}`, (parsed.poems || []).map(p => p.title).join(' | '));
    res.json(parsed);
  } catch (err) { next(err); }
});

export default router;
