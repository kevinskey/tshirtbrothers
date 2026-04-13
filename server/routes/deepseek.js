import { Router } from 'express';
import OpenAI from 'openai';
import rateLimit from 'express-rate-limit';
import pool from '../db.js';
import { authenticate, adminOnly } from '../middleware/auth.js';

const router = Router();

// ── DeepSeek client (OpenAI-compatible SDK) ──────────────────────────────────
function getClient() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not configured');
  return new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: key,
  });
}

// Default model — deepseek-chat is fast and cheap
const MODEL = 'deepseek-chat';

// ── Simple in-memory cache with TTL ──────────────────────────────────────────
const CACHE_TTL_MS = (parseInt(process.env.DEEPSEEK_CACHE_TTL || '3600', 10)) * 1000;
const cache = new Map(); // key -> { value, expires }

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  // Prune occasionally to prevent unbounded growth
  if (cache.size > 500) {
    const cutoff = Date.now();
    for (const [k, v] of cache) {
      if (v.expires < cutoff) cache.delete(k);
    }
  }
}

// ── Rate limiters ────────────────────────────────────────────────────────────
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again in a few minutes.' },
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Shared helper to call DeepSeek with error/fallback handling ──────────────
async function callDeepSeek({ system, user, responseFormat, temperature = 0.7, maxTokens = 2000 }) {
  const client = getClient();
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: user });

  const req = {
    model: MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (responseFormat === 'json') {
    req.response_format = { type: 'json_object' };
  }

  const res = await client.chat.completions.create(req);
  return res.choices?.[0]?.message?.content || '';
}

// ── Business knowledge base (used as system context for FAQ + replies) ───────
const TSB_KNOWLEDGE = `You are a friendly, pleasant assistant for T-Shirt Brothers, a custom apparel printing shop in Fairburn, GA.

COMPANY:
- Phone: (470) 622-4845
- Email: kevin@tshirtbrothers.com
- Address: 6010 Renaissance Parkway, Fairburn, GA 30213 — inside the Dylan Apartment Complex, Building 7000, Suites H-K. The facility is secure, so customers should CALL when they arrive.
- Hours: 8am-8pm every day EXCEPT Sunday (closed Sundays)
- Services: Screen printing, DTF transfers, sublimation, vinyl, embroidery

MINIMUMS:
- NO minimums. We print single shirts. Single shirts and small runs up to 11 pieces cost more per shirt than orders of 12+ (quantity discounts start at 12).

TURNAROUND:
- 1-color screen print or vinyl designs: can be ready in 1 day
- DTF transfers: minimum 3 days (cannot be done same day)
- Full-color graphic shirts: 3 days
- Any order requested in under 1 week from order date gets a RUSH CHARGE
- We respond to quote requests the SAME DAY
- Once a quote is accepted, 50% deposit is required to begin production
- Order cannot be cancelled once T-Shirt Brothers has received the deposit and started the order process
- 100% payment is due before the customer can receive their order

PRICING (never quote exact prices — always direct the customer to request a quote at /quote):
- Pricing depends on: quantity, design complexity, number of colors, print locations, garment, and deadline date
- Size upcharges for larger sizes: 2XL +$2, 3XL +$4, 4XL +$6, 5XL +$8 (standard XS-XL are the base price)
- Design fee applies if we create artwork for the customer
- Embroidery pricing is based on STITCH COUNT of the design
- Embroidery requires a digitized file — we can digitize the design for a fee, or the customer can upload their own digitized file
- Rush charge applies to any order under 1 week

ARTWORK:
- Customers can upload their own graphic
- Customers can use our Design Studio at /design to create a custom design online
- We can design graphics for the customer (design fee applies)

PRINT METHODS — what we offer:
- Screen printing (best for bulk, most durable)
- DTF transfers (great for full-color designs, small batches)
- Sublimation (photo-quality on polyester, all-over prints)
- Vinyl (single-color names, numbers, simple text)
- Embroidery (polos, hats, jackets, logos — priced by stitch count)

PAYMENT:
- All payment options accepted
- 50% deposit due to start
- Remaining 50% due before pickup/delivery

DELIVERY & PICKUP:
- Local pickup available at our Fairburn location (call when you arrive — facility is secure)
- FREE local delivery within 5 miles on orders over $250
- We ship nationwide — shipping is auto-calculated at checkout

WEBSITE / CHAT WIDGET QUESTIONS:
- "How do I unblock the microphone?" / "unblock mic" / "allow microphone" / "mic not working" →
  "Tap the 🔒 lock icon next to the web address, find Microphone, and switch it to Allow — then reload the page. On iPhone, go to Settings → Safari → Microphone. Or just type your question to me — works great either way!"
- "How does this chat work?" → "I'm the T-Shirt Brothers AI assistant. Ask me anything about our printing services, turnaround, or policies. For exact pricing, click the GET A FREE QUOTE button."
- "Are you a real person?" → Be honest: "I'm an AI assistant here to answer quick questions. For anything complex, call (470) 622-4845 to talk to a real person."
- "Start over" / "reset" / "new conversation" → "No problem! Tap the Start Over button at the bottom of the chat."

COMMON QUESTIONS & ANSWERS:
- "Can I get a shirt today?" → Possibly YES, if it's a 1-color screen print or vinyl design. DTF transfers take a minimum of 3 days and CANNOT be done same day. Ask them about the design and direct them to click the GET A FREE QUOTE button to lock it in.
- "Can you print on towels?" → YES
- "Do you do hats?" → YES
- "Do you do team jerseys?" → YES
- "Do you do family reunion shirts?" → YES
- "Do you do funeral shirts?" → YES (be compassionate — we can often rush these)
- "Do you do birthday shirts?" → YES
- "Do you have kids sizes?" → YES
- "Do you do custom logos / embroidery?" → YES (remember to mention stitch count + digitizing)
- "Can you match my colors?" → YES for most methods. Screen printing can match Pantone for orders with enough volume.

PRODUCTS WE PRINT ON (not limited to shirts):
- T-shirts, tank tops, long-sleeve, polos, hoodies, sweatshirts
- Hats and headwear
- Team jerseys and uniforms
- Towels
- Kids/youth sizes available
- Specialty event apparel: family reunion, funeral, birthday, church, corporate, school

TONE & STYLE:
- Always friendly, warm, and pleasant
- Keep answers short and conversational
- Say YES enthusiastically when we can do it
- NEVER quote exact prices. Instead, direct customers to click the "GET A FREE QUOTE" button
- NEVER type out URLs like "tshirtbrothers.com/quote" or "/quote" in your replies. Always say: click the "GET A FREE QUOTE" button (use that exact phrase in quotes or bold)
- Similarly, for design help, tell them to click the "DESIGN STUDIO" button — don't type the URL
- If someone asks about something we don't offer, politely redirect or suggest they call (470) 622-4845
- When talking about rush orders, mention the 1-week cutoff
- When talking about embroidery, always mention the stitch count + digitizing requirement
- Preferred phrasings:
  * "Click the GET A FREE QUOTE button and we'll respond the same day!"
  * "Tell me about your design, then click the GET A FREE QUOTE button to lock it in"
  * "Pricing depends on quantity, design, and deadline — click the GET A FREE QUOTE button and we'll get back to you the same day"`;

// ── Product catalog search (basic RAG) ──────────────────────────────────────
// Detects product-related questions and looks them up in the products table
// so DeepSeek can answer from real catalog data instead of guessing.
const PRODUCT_INTENT_PATTERNS = [
  /\b(do|does|y'all|you|we|they|u)\s+(you|guys|all)?\s*(have|carry|sell|stock|offer|got)/i,
  /\bi\s+(need|want|am looking for|wanna)\s+(a\s+|some\s+)?\w*(gildan|bella|next level|nike|adidas|carhartt|champion|hanes)/i,
  /\b(looking for|searching for|find|show me|what.*carry|what.*have|what.*sell)\b/i,
];

// Brand names always indicate a product search (nobody says "can I get a gildan today" as a general question)
const BRAND_KEYWORDS = [
  'gildan', 'bella', 'canvas', 'next level', 'american apparel', 'port',
  'authority', 'district', 'champion', 'carhartt', 'nike', 'adidas',
  'under armour', 'russell', 'jerzees', 'hanes', 'softstyle', 'comfort colors',
];

// Generic product words — only trigger search when combined with intent
const PRODUCT_KEYWORDS = [
  't-shirt', 'tshirt', 'tee', 'shirt', 'hoodie', 'hoody', 'sweatshirt',
  'polo', 'tank', 'jersey', 'jacket', 'windbreaker', 'vest', 'long sleeve',
  'long-sleeve', 'cap', 'hat', 'beanie', 'visor', 'headwear', 'towel',
  'apron', 'bag', 'tote', 'backpack', 'pants', 'shorts', 'sweatpants',
  'onesie', 'onesies', 'bodysuit', 'baby', 'infant', 'toddler', 'newborn',
  'kids', 'youth', 'romper', 'bib', 'blanket',
];

// Questions about policies/turnaround — should NOT trigger product search even if they mention "shirt"
const GENERAL_QUESTION_PATTERNS = [
  /\b(can i|how long|how much|how fast|when|do you|what is|what's|how do|is there|are there|today|tomorrow|rush)\b.*\b(get|made|print|ready|take|cost|charge|fee|deliver|ship|pickup)\b/i,
  /\b(turnaround|pricing|price|cost|minimum|rush|deposit|cancel|refund|hours|open|close|location|address)\b/i,
];

function looksLikeProductQuery(text) {
  const lower = text.toLowerCase();

  // If it's a general question about policies/turnaround, don't search products
  if (GENERAL_QUESTION_PATTERNS.some((re) => re.test(lower))) return false;

  // Brand name mentioned = definitely looking for products
  if (BRAND_KEYWORDS.some((kw) => lower.includes(kw))) return true;

  // Intent + product keyword = searching for products
  const intent = PRODUCT_INTENT_PATTERNS.some((re) => re.test(lower));
  const hasKeyword = PRODUCT_KEYWORDS.some((kw) => lower.includes(kw));
  return intent && hasKeyword;
}

async function searchProductCatalog(query) {
  try {
    const lower = query.toLowerCase();
    // Pull out likely product words (filter stop-words + short tokens)
    const stop = new Set(['do','does','you','have','the','a','an','any','of','in','for','to','is','it','we','they','guys','and','or','with','without','that','this','what','about','got','can','i','me','my','your','our','one','some','yall','all','offer','carry','sell','stock','looking','need','want']);
    const tokens = lower
      .replace(/[^a-z0-9\s-]/g, ' ')
      // Normalize common product terms
      .replace(/\bhoodies?\b/g, 'hood')
      .replace(/\btshirts?\b/g, 't-shirt')
      .replace(/\btees?\b/g, 't-shirt')
      .replace(/\bsweatshirts?\b/g, 'sweatshirt')
      .replace(/\bjackets?\b/g, 'jacket')
      .replace(/\bjerseys?\b/g, 'jersey')
      .replace(/\bcaps?\b/g, 'cap')
      .replace(/\bbeanies?\b/g, 'beanie')
      .replace(/\btowels?\b/g, 'towel')
      .replace(/\bpolos?\b/g, 'polo')
      .replace(/\bonesies?\b/g, 'infant')
      .replace(/\bbodysuit[s]?\b/g, 'infant')
      .replace(/\bbaby\b/g, 'infant')
      .replace(/\btoddler\b/g, 'infant')
      .replace(/\b[2-6]t\b/g, 'infant')
      .replace(/\bnewborn\b/g, 'infant')
      .replace(/\bkids?\b/g, 'youth')
      .replace(/\bchildren'?s?\b/g, 'youth')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !stop.has(t));

    // Combine brand hits + normalized tokens (skip raw keyword hits since tokens are already normalized)
    const brandHits = BRAND_KEYWORDS.filter((kw) => lower.includes(kw));
    const searchTerms = [...new Set([...brandHits, ...tokens])].slice(0, 5);
    if (searchTerms.length === 0) return [];

    // Build an ILIKE query — each term must match somewhere (AND logic)
    const conditions = [];
    const params = [];
    for (const term of searchTerms) {
      params.push(`%${term}%`);
      const idx = params.length;
      conditions.push(`(name ILIKE $${idx} OR brand ILIKE $${idx} OR category ILIKE $${idx})`);
    }

    const sql = `
      SELECT id, ss_id, name, brand, category, image_url
      FROM products
      WHERE ${conditions.join(' AND ')}
      ORDER BY name ASC
    `;
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    console.error('[product search] error:', err.message);
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. FAQ CHAT WIDGET
// ══════════════════════════════════════════════════════════════════════════════
router.post('/faq', publicLimiter, async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    // Check for product catalog relevance
    let catalogContext = '';
    let matchedProducts = [];
    if (looksLikeProductQuery(message)) {
      const results = await searchProductCatalog(message);
      if (results.length > 0) {
        // Return all results with images as a horizontal carousel
        matchedProducts = results
          .filter((r) => r.image_url)
          .map((r) => ({
            id: r.id,
            ss_id: r.ss_id,
            name: r.name,
            brand: r.brand,
            category: r.category,
            image_url: r.image_url,
          }));

        catalogContext = '\n\nCATALOG SEARCH RESULTS (from our real S&S Activewear catalog — use these to answer):\n' +
          results.map((r, i) => `${i + 1}. ${r.name} (${r.brand}${r.category ? ' · ' + r.category : ''})`).join('\n') +
          '\n\nInstructions when answering catalog questions:\n' +
          '- If results match what they asked about: confirm enthusiastically in 1-2 short sentences. DO NOT list products in your text reply — they will be shown visually as cards below your message.\n' +
          '- Tell them to click the "GET A FREE QUOTE" button for pricing.\n' +
          "- If nothing matches: say we can likely still source it and direct them to the GET A FREE QUOTE button or to call (470) 622-4845.";
      } else {
        catalogContext = '\n\nCATALOG SEARCH: No exact matches in our current catalog, but we can often special-order items from our S&S Activewear supplier. Direct them to the GET A FREE QUOTE button or to call us.';
      }
    }

    // Cache identical questions (skip cache if catalog context is involved — catalog changes)
    const cacheKey = `faq:${message.toLowerCase().trim()}`;
    if (history.length === 0 && !catalogContext) {
      const cached = cacheGet(cacheKey);
      if (cached) return res.json({ reply: cached, cached: true });
    }

    // Build full conversation
    const systemContent = TSB_KNOWLEDGE + catalogContext;
    const messages = [
      { role: 'system', content: systemContent },
      ...history.slice(-10).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.content || ''),
      })),
      { role: 'user', content: message },
    ];

    const client = getClient();
    const result = await client.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const reply = result.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response. Please call us at (470) 622-4845.";

    if (history.length === 0 && !catalogContext) cacheSet(cacheKey, reply);

    console.log('[DeepSeek FAQ]', message.slice(0, 50), '->', reply.slice(0, 50));
    res.json({ reply, cached: false, products: matchedProducts });
  } catch (err) {
    console.error('[DeepSeek FAQ] error:', err.message);
    res.status(200).json({
      reply: "I'm having trouble right now. Please call us at (470) 622-4845 or email kevin@tshirtbrothers.com and we'll help you directly!",
      fallback: true,
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. SMART PRICING ASSISTANT (admin)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/suggest-price', authenticate, adminOnly, adminLimiter, async (req, res, next) => {
  try {
    const { brand, product_type, quantity, print_method, print_areas, colors_in_design, design_size, is_rush, deadline_days } = req.body;

    if (!product_type || !quantity) {
      return res.status(400).json({ error: 'product_type and quantity are required' });
    }

    const system = `You are a pricing expert for T-Shirt Brothers, a custom apparel printing shop in Georgia.

GARMENT BASE COSTS (wholesale, approximate):
- Gildan basic tee: $2.50-4.00 | Gildan premium/softstyle: $4.00-6.00
- Bella+Canvas: $5.00-7.00 | Next Level: $4.50-6.50
- Comfort Colors: $6.00-9.00 | Champion: $8.00-14.00
- Nike/Adidas/Under Armour: $12.00-25.00 | Carhartt: $18.00-35.00
- Hoodies: 2-3x tee cost | Polos: 1.5-2x | Jackets: 3-4x | Hats: $4-8

PRINT METHOD COSTS:
- Screen print: $1.50-2.50/color/location setup + $0.50-1.00/print. Best at 24+ qty. CAN be done same day for 1-color.
- DTF transfer: CANNOT be done same day. Minimum 3 days turnaround. No setup fee. Good for small runs + full color.

  IMPORTANT: We outsource DTF to KolorMatrix (local Atlanta). We order 22"-wide gang sheets and press transfers ourselves.

  KOLORMATRIX GANG SHEET COST (our actual print cost):
    * Sheet is ALWAYS 22 inches wide
    * Standard: $6.00 per foot of length
    * Rush (5hr): $8.00/foot
    * Hot Rush (1-2hr): $12.00/foot

  HOW TO CALCULATE DTF COST PER UNIT:
    1. Get design dimensions (width x height in inches)
    2. Designs across = floor(22 / design_width)
    3. Rows per foot = floor(12 / design_height)
    4. Designs per foot = designs_across x rows_per_foot
    5. Cost per design = $6.00 / designs_per_foot
    6. For 2 print locations (front+back), double the per-unit cost
    7. Total sheet length needed = ceiling(quantity / designs_per_foot)
    8. Total sheet cost = sheet_length x $6

  DESIGN SIZE → COST PER UNIT (standard, from gang sheet math):
    * Left chest (4x4"): 5 across x 3 rows = 15/foot → $0.40/unit
    * Small (5x5"): 4 across x 2 rows = 8/foot → $0.75/unit
    * Medium (8x10"): 2 across x 1 row = 2/foot → $3.00/unit
    * Standard front (10x12"): 2 across x 1 row = 2/foot → $3.00/unit
    * Large (12x12"): 1 across x 1 row = 1/foot → $6.00/unit
    * Oversized (14x16"): 1 across, needs 1.33ft → $8.00/unit
    * Full front (16x20"): 1 across, needs 1.67ft → $10.00/unit

  BULK EXAMPLES:
    * 50 units left chest (4x4"): 50/15 = 3.4ft sheet → $21 total → $0.42/unit
    * 50 units standard (10x12"): 50/2 = 25ft sheet → $150 total → $3.00/unit
    * 100 units left chest: 100/15 = 7ft → $42 total → $0.42/unit
    * 24 units large (12x12"): 24/1 = 24ft → $144 total → $6.00/unit

  ALWAYS use this gang sheet math for DTF pricing. NEVER guess.
  Output the gang sheet calculation in your reasoning.

- Sublimation: $3.00-6.00/print. Polyester only. Full color included.
- Vinyl: $2.00-4.00/print. Best for simple text/numbers. CAN be done same day.
- Embroidery: $5.00-15.00/piece depending on stitch count. Digitizing fee $25-50.

DESIGN SIZE IMPACT ON PRICING:
- Left chest (4x4"): DTF ~$0.40/unit, screen print base
- Standard front/back (10-12"): DTF ~$3.00/unit, screen print +$1-2
- Oversized (14x16"): DTF ~$8.00/unit, screen print +$2-4
- Full front/back (edge to edge): DTF ~$10-12/unit, screen print +$3-5
- Sleeve (3x10"): DTF ~$1.50/unit, screen print +$1-2

TARGET MARGINS BY METHOD AND VOLUME:
- Screen Print (bulk 50+): 50-65% margin. Garment $3-5 + print $2-3 → charge $12-18
- Screen Print (small run 12-24): 60-75% margin. Higher per-unit costs justified by setup
- DTF (bulk 50+): 70-85% margin. In-house cost $0.40/shirt + garment $4 → charge $8-15
- DTF (small run <12): 80-90% margin. Higher markup on small quantities
- Vinyl: 70-80% margin. Low material cost, charge for labor/skill
- Embroidery: 60-75% margin. Digitizing fee covers setup, per-unit margin solid
- Sublimation: 65-80% margin. Material is cheap, charge for full-color value

INDUSTRY BENCHMARKS:
- 50-60% margin is healthy and competitive
- Below 40% means undercharging
- Above 75% is sustainable for small runs, premium brands, and rush jobs
- Rush orders: +50% markup on top is standard
- NEVER suggest margins below 50% unless quantity is 500+

Output STRICT JSON only:
{
  "suggested_price": number (per unit, USD),
  "garment_cost": number (wholesale per unit),
  "print_cost": number (per unit for DTF this comes from gang sheet math),
  "gang_sheet_details": {
    "design_width_inches": number,
    "design_height_inches": number,
    "designs_per_foot": number,
    "sheet_length_feet": number,
    "sheet_cost": number,
    "cost_per_unit": number
  },
  "bulk_tier_prices": { "50": number, "100": number, "250": number, "500": number },
  "profit_margin_percentage": number,
  "confidence_level": number (0.0-1.0),
  "reasoning": "short explanation showing the gang sheet calculation (2-3 sentences)"
}`;

    const user = `Quote parameters:
- Brand: ${brand || 'not specified'}
- Product: ${product_type}
- Print method: ${print_method || 'screen-print'}
- Quantity: ${quantity}
- Print areas: ${print_areas || 1}
- Design/image size: ${design_size || 'standard'}
- Colors in design: ${colors_in_design || 1}
- Rush order: ${is_rush ? 'yes' : 'no'}
- Deadline (days from now): ${deadline_days ?? 'not specified'}

Suggest pricing with cost breakdown.`;

    const raw = await callDeepSeek({ system, user, responseFormat: 'json', temperature: 0.3, maxTokens: 600 });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'Failed to parse DeepSeek response', raw });
    }

    // Log to pricing_logs
    try {
      await pool.query(
        `INSERT INTO pricing_logs (product_type, quantity, print_areas, colors, is_rush, suggested_price, confidence_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          product_type,
          quantity,
          print_areas || null,
          colors_in_design || null,
          !!is_rush,
          parsed.suggested_price || null,
          parsed.confidence_level || null,
        ]
      );
    } catch (logErr) {
      console.error('[pricing_logs] insert failed:', logErr.message);
    }

    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. DESIGN PROMPT ENHANCER
// ══════════════════════════════════════════════════════════════════════════════
router.post('/enhance-prompt', publicLimiter, async (req, res, next) => {
  try {
    const { prompt, color, garment_type } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    // A/B testing: 10% of the time return the original unchanged, for comparison
    const useOriginal = Math.random() < 0.1;
    if (useOriginal) {
      return res.json({ enhanced_prompt: prompt, variant: 'original' });
    }

    const system = `You are an expert art director. You rewrite user prompts for AI image generation.

ABSOLUTE RULES — NEVER VIOLATE:
- The output image must contain ONLY the graphic/illustration itself
- Plain solid white background, nothing else
- NEVER mention: t-shirt, hoodie, clothing, garment, mannequin, model, mockup, desk, table, workspace, paper, pen, pencil, tools, props, frame, computer, screen, or any physical object besides the graphic itself
- NEVER use words like "print-ready", "mockup", "on a shirt", "for apparel", "merchandise"
- NEVER describe a scene or setting — just the graphic floating on white

WHAT TO DO:
- Describe the illustration/graphic in vivid detail
- Use style words: "clean digital illustration", "bold outlines", "solid colors", "centered composition"
- End with: "Isolated on plain solid white background. Nothing else in the image."
- Keep it concise — under 80 words total

Output ONLY the enhanced prompt text. No explanation.`;

    const user = `Rewrite this as an image generation prompt for a standalone graphic on white background: "${prompt}"`;

    const enhanced = await callDeepSeek({ system, user, temperature: 0.5, maxTokens: 400 });

    // Log for analysis
    try {
      await pool.query(
        'INSERT INTO prompt_logs (original_prompt, enhanced_prompt) VALUES ($1, $2) RETURNING id',
        [prompt, enhanced]
      );
    } catch (logErr) {
      console.error('[prompt_logs] insert failed:', logErr.message);
    }

    res.json({ enhanced_prompt: enhanced.trim(), variant: 'enhanced' });
  } catch (err) {
    console.error('[DeepSeek enhance-prompt] error:', err.message);
    // Fallback: return original prompt so design flow continues
    res.json({ enhanced_prompt: req.body.prompt, variant: 'fallback', error: err.message });
  }
});

// Rate a previously-enhanced prompt
router.post('/enhance-prompt/:id/rate', publicLimiter, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be 1-5' });
    }
    await pool.query('UPDATE prompt_logs SET user_rating = $1 WHERE id = $2', [rating, id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. QUOTE TRIAGE & CLASSIFICATION
// ══════════════════════════════════════════════════════════════════════════════
router.post('/classify-quote', authenticate, adminOnly, adminLimiter, async (req, res, next) => {
  try {
    const { quote_id, quote_text } = req.body;
    if (!quote_text) return res.status(400).json({ error: 'quote_text is required' });

    const system = `You are a quote triage expert for a custom t-shirt printing shop.
Classify the incoming quote request and output STRICT JSON only.

Output shape:
{
  "urgency": "low" | "medium" | "high" | "rush",
  "complexity": "simple" | "moderate" | "complex",
  "estimated_hours": number (total work hours to fulfill),
  "recommended_department": "sales" | "design" | "production",
  "suggested_followup_time": "within X hours" | "same day" | "next business day",
  "summary": "one-sentence summary of the request"
}

RUSH = less than 7 days from deadline. HIGH = under 14 days or large order 100+. MEDIUM = 14-30 days. LOW = no deadline.
COMPLEX = custom design, multi-location prints, special fabrics. SIMPLE = standard tee, 1-color print.`;

    const raw = await callDeepSeek({ system, user: quote_text, responseFormat: 'json', temperature: 0.2, maxTokens: 400 });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'Failed to parse DeepSeek response', raw });
    }

    // Save to quote if quote_id provided
    if (quote_id) {
      try {
        await pool.query('UPDATE quotes SET triage = $1 WHERE id = $2', [JSON.stringify(parsed), quote_id]);
      } catch (err) {
        console.error('[quotes.triage] update failed:', err.message);
      }
    }

    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. DRAFT REPLY GENERATOR
// ══════════════════════════════════════════════════════════════════════════════
router.post('/draft-reply', authenticate, adminOnly, adminLimiter, async (req, res, next) => {
  try {
    const { customer_email, customer_question, order_context } = req.body;
    if (!customer_question) return res.status(400).json({ error: 'customer_question is required' });

    const system = `${TSB_KNOWLEDGE}

You are drafting an email reply to a customer. Generate THREE tone variations.
Mark ANY specific pricing, dates, or availability with [BRACKETS] so the admin can fill them in.

Output STRICT JSON only:
{
  "professional": "formal reply text",
  "friendly": "warm casual reply text",
  "urgent": "short reply for rush situations"
}

Keep each variation under 150 words. Always start with greeting and end with sign-off.`;

    const user = `Customer email: ${customer_email || 'unknown'}
${order_context ? 'Order context: ' + order_context + '\n' : ''}Question: ${customer_question}

Draft reply variations.`;

    const raw = await callDeepSeek({ system, user, responseFormat: 'json', temperature: 0.7, maxTokens: 1500 });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'Failed to parse DeepSeek response', raw });
    }

    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. BLOG POST DRAFTING
// ══════════════════════════════════════════════════════════════════════════════
router.post('/generate-blog-post', authenticate, adminOnly, adminLimiter, async (req, res, next) => {
  try {
    const { topic, target_keywords, tone = 'educational', length = 'medium' } = req.body;
    if (!topic) return res.status(400).json({ error: 'topic is required' });

    const wordTarget = length === 'short' ? 400 : length === 'long' ? 1500 : 800;

    const system = `You are an SEO content writer for T-Shirt Brothers, a custom printing shop in Tyrone/Fairburn, GA.

Write in a ${tone} tone. Target around ${wordTarget} words.
Write HTML content (use <h2>, <h3>, <p>, <ul>, <li>, <strong>, <a href="">). Do not include <html> or <body> tags.

Internal links to include naturally where relevant:
- /quote (Get a Quote)
- /design (Design Studio)
- /shop (Browse Products)
- /services (Our Services)

Output STRICT JSON only:
{
  "title": "SEO-friendly title (55-70 chars)",
  "meta_description": "SEO meta description (150-160 chars)",
  "slug_suggestion": "lowercase-hyphenated-slug",
  "outline": ["Section 1", "Section 2", "Section 3"],
  "full_html_content": "<h2>...</h2><p>...</p>..."
}`;

    const user = `Topic: ${topic}
Target keywords: ${target_keywords || 'custom t-shirts, screen printing, custom apparel'}
Tone: ${tone}
Length: ${length} (~${wordTarget} words)

Write a complete blog post.`;

    const raw = await callDeepSeek({ system, user, responseFormat: 'json', temperature: 0.7, maxTokens: 4000 });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'Failed to parse DeepSeek response', raw });
    }

    // Save as draft in blog_posts
    try {
      // Ensure slug is unique by appending timestamp if needed
      const baseSlug = (parsed.slug_suggestion || topic.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')).slice(0, 200);
      const slug = `${baseSlug}-${Date.now()}`;
      const inserted = await pool.query(
        `INSERT INTO blog_posts (slug, title, excerpt, content, status, meta_title, meta_description)
         VALUES ($1, $2, $3, $4, 'draft', $5, $6)
         RETURNING id, slug, title`,
        [
          slug,
          parsed.title || topic,
          (parsed.meta_description || '').slice(0, 300),
          parsed.full_html_content || '',
          parsed.title || topic,
          parsed.meta_description || '',
        ]
      );
      parsed.saved = inserted.rows[0];
    } catch (dbErr) {
      console.error('[blog_posts] insert failed:', dbErr.message);
      parsed.saved = null;
      parsed.save_error = dbErr.message;
    }

    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// HOLIDAY SALES POPUP GENERATOR
// ══════════════════════════════════════════════════════════════════════════════
router.get('/holiday-promo', publicLimiter, async (req, res) => {
  try {
    // Cache for 6 hours so we don't call DeepSeek on every page load
    const cacheKey = 'holiday-promo';
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const system = `You are a marketing expert for T-Shirt Brothers, a custom apparel printing shop.
Today's date is ${dateStr}.

Look at the calendar and find the NEXT upcoming holiday, event, or seasonal occasion within the next 30 days. Consider:
- Federal holidays (Memorial Day, July 4th, Labor Day, Veterans Day, etc.)
- Cultural events (Juneteenth, Cinco de Mayo, etc.)
- School events (back to school, graduation, prom, field day)
- Seasonal (summer, fall, spring break)
- Sports (football season, basketball, etc.)
- Religious (Easter, Christmas, etc.)
- Commercial (Mother's Day, Father's Day, Valentine's Day, Black Friday)
- Community (family reunion season, church retreat season, etc.)

If no major holiday is within 30 days, pick the closest upcoming one or create a seasonal promotion.

Output STRICT JSON:
{
  "holiday": "name of the holiday/event",
  "days_until": number of days until the event,
  "headline": "short catchy headline (under 8 words)",
  "subtext": "one sentence describing the deal (under 15 words)",
  "discount": "e.g. 15% OFF or FREE SHIPPING or $5 OFF",
  "code": "short promo code like MEMORIAL15 or GRAD2026",
  "emoji": "one relevant emoji",
  "urgency": "e.g. Order by May 20 for guaranteed delivery",
  "cta": "short button text like Shop Now or Get Your Quote"
}`;

    const raw = await callDeepSeek({ system, user: 'Generate a timely promotional popup for our website.', responseFormat: 'json', temperature: 0.7, maxTokens: 400 });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: 'Failed to generate promo' });
    }

    // Parse discount value from string like "15% OFF" or "$5 OFF" or "FREE SHIPPING"
    let discountType = 'percent';
    let discountValue = 0;
    const discountStr = (parsed.discount || '').toUpperCase();
    if (discountStr.includes('FREE SHIPPING')) {
      discountType = 'shipping';
      discountValue = 0;
    } else if (discountStr.includes('$')) {
      discountType = 'fixed';
      const m = discountStr.match(/\$(\d+)/);
      discountValue = m ? parseInt(m[1]) : 0;
    } else if (discountStr.includes('%')) {
      discountType = 'percent';
      const m = discountStr.match(/(\d+)%/);
      discountValue = m ? parseInt(m[1]) : 0;
    }

    // Save to DB (upsert by code)
    try {
      const expiresAt = new Date(Date.now() + Math.max(parsed.days_until || 7, 3) * 24 * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO promotions (code, holiday, headline, subtext, discount_type, discount_value, expires_at, ai_generated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         ON CONFLICT (code) DO UPDATE SET headline = $3, subtext = $4, expires_at = $7`,
        [parsed.code, parsed.holiday, parsed.headline, parsed.subtext, discountType, discountValue, expiresAt]
      );
    } catch (dbErr) {
      console.error('[Promo DB] save failed:', dbErr.message);
    }

    // Cache for 6 hours
    cache.set(cacheKey, { value: parsed, expires: Date.now() + 6 * 60 * 60 * 1000 });

    res.json(parsed);
  } catch (err) {
    console.error('[Holiday Promo] error:', err.message);
    res.status(500).json({ error: 'Promo generation failed' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INSTAGRAM POST GENERATOR (from blog content)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/generate-instagram', authenticate, adminOnly, adminLimiter, async (req, res, next) => {
  try {
    const { title, content, topic } = req.body;
    if (!title && !topic) return res.status(400).json({ error: 'title or topic is required' });

    const blogText = content
      ? content.replace(/<[^>]*>/g, ' ').replace(/\s{2,}/g, ' ').slice(0, 500)
      : '';

    // 1. Generate caption + hashtags with DeepSeek
    const system = `You are a social media expert for T-Shirt Brothers, a custom apparel printing shop in Fairburn, GA.
Create an engaging Instagram post from blog content.

Output STRICT JSON:
{
  "caption": "engaging Instagram caption (150-300 chars), conversational tone, include a call-to-action, use line breaks for readability",
  "hashtags": "15-20 relevant hashtags as a single string starting with #, separated by spaces",
  "image_prompt": "short description for AI image generation (product-focused, no people, vibrant colors, flat style)"
}`;

    const user = `Blog title: ${title || topic}
Blog excerpt: ${blogText}

Create an Instagram post for this.`;

    const raw = await callDeepSeek({ system, user, responseFormat: 'json', temperature: 0.8, maxTokens: 600 });

    let parsed;
    try { parsed = JSON.parse(raw); } catch { return res.status(500).json({ error: 'Failed to generate' }); }

    // 2. Generate image with Flux/Ideogram
    let imageUrl = null;
    try {
      const { generateDesign } = await import('../services/openai.js');
      imageUrl = await generateDesign(parsed.image_prompt || title || topic);
    } catch (imgErr) {
      console.error('[IG image] generation failed:', imgErr.message);
    }

    res.json({
      caption: parsed.caption,
      hashtags: parsed.hashtags,
      image_prompt: parsed.image_prompt,
      image_url: imageUrl,
      full_post: `${parsed.caption}\n\n${parsed.hashtags}`,
    });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PROMO CODE VALIDATION (public)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/validate-promo', publicLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ valid: false, error: 'Code is required' });

    const { rows } = await pool.query(
      `SELECT * FROM promotions WHERE UPPER(code) = UPPER($1) AND active = TRUE`,
      [code.trim()]
    );

    if (rows.length === 0) return res.json({ valid: false, error: 'Invalid promo code' });

    const promo = rows[0];

    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return res.json({ valid: false, error: 'This promo code has expired' });
    }

    if (promo.max_uses && promo.times_used >= promo.max_uses) {
      return res.json({ valid: false, error: 'This promo code has been fully redeemed' });
    }

    res.json({
      valid: true,
      code: promo.code,
      discount_type: promo.discount_type,
      discount_value: Number(promo.discount_value),
      holiday: promo.holiday,
      headline: promo.headline,
    });
  } catch (err) {
    console.error('[Validate Promo] error:', err.message);
    res.json({ valid: false, error: 'Validation failed' });
  }
});

// Apply promo — increment usage count (call when quote is submitted with a code)
router.post('/apply-promo', publicLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Code required' });

    const { rows } = await pool.query(
      `UPDATE promotions SET times_used = times_used + 1 WHERE UPPER(code) = UPPER($1) AND active = TRUE RETURNING code, times_used`,
      [code.trim()]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Invalid code' });
    res.json({ applied: true, code: rows[0].code, times_used: rows[0].times_used });
  } catch (err) {
    res.status(500).json({ error: 'Failed to apply promo' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN: LIST / CREATE / UPDATE / DELETE PROMOTIONS
// ══════════════════════════════════════════════════════════════════════════════
router.get('/promotions', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM promotions ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/promotions', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { code, holiday, headline, subtext, discount_type, discount_value, max_uses, expires_at } = req.body;
    if (!code || !discount_type) return res.status(400).json({ error: 'code and discount_type required' });
    const { rows } = await pool.query(
      `INSERT INTO promotions (code, holiday, headline, subtext, discount_type, discount_value, max_uses, expires_at, ai_generated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE) RETURNING *`,
      [code, holiday || null, headline || null, subtext || null, discount_type, discount_value || 0, max_uses || null, expires_at || null]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/promotions/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { active } = req.body;
    const { rows } = await pool.query(
      'UPDATE promotions SET active = $1 WHERE id = $2 RETURNING *',
      [active, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/promotions/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM promotions WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

export default router;
