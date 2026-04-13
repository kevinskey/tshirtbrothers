import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ══════════════════════════════════════════════════════════════════════════════
// SMART COST ROUTER — picks cheapest model + frames prompt by output style
// ══════════════════════════════════════════════════════════════════════════════
//
// Styles:
//   'dtf'   — full color die-cut sticker (default) — for DTF transfer printing
//   'vinyl' — single solid color, no effects — for vinyl cutting
//   'print' — clean graphic for screen print — bold, separated colors
//
// Model costs per image (April 2026):
//   Flux Schnell  $0.003  — fast, good for simple logos/icons/basic graphics
//   Ideogram      $0.030  — only option for text-on-image
//   Flux Dev      $0.030  — high quality graphics
//   Flux Pro      $0.055  — top quality, complex scenes
//   DALL-E 3      $0.040  — fallback only (adds mockup artifacts)

// ── Prompt Analysis ──────────────────────────────────────────────────────────

const TEXT_PATTERNS = [
  /\b(say|says|saying|text|word|words|letter|letters|slogan|quote|name|title|heading)\b/i,
  /\b(happy birthday|merry christmas|congratulations|welcome|thank you|family reunion)\b/i,
  /["'].{2,}["']/,  // quoted text
  /\b(put|write|add|include|with the text|that says|reads|reading)\b/i,
];

const COMPLEX_PATTERNS = [
  /\b(realistic|photorealistic|hyper.?real|detailed|intricate|elaborate|complex)\b/i,
  /\b(portrait|landscape|scene|scenery|panoramic|cinematic)\b/i,
  /\b(multiple people|group|crowd|team photo|family photo)\b/i,
  /\b(3d|render|rendering|illustration with depth|dimensional)\b/i,
  /\b(premium|high.?end|professional quality|print.?ready|production)\b/i,
  /\b(full color|full scene|complete|comprehensive)\b/i,
];

const SIMPLE_PATTERNS = [
  /\b(simple|basic|minimal|minimalist|clean|flat|icon|emoji)\b/i,
  /\b(logo|emblem|badge|crest|seal|monogram|initials)\b/i,
  /\b(silhouette|outline|line.?art|sketch|doodle|cartoon)\b/i,
  /\b(one color|single color|solid|basic shape)\b/i,
  /\b(small|tiny|little|quick|fast|draft|rough|test)\b/i,
];

const VINYL_PATTERNS = [
  /\b(vinyl|cut|cutting|htv|heat transfer vinyl|one.?color|single.?color)\b/i,
  /\b(decal|sticker cut|die.?cut|contour cut|vector)\b/i,
  /\b(weeding|weed|plotter|cutter|silhouette cameo|cricut)\b/i,
];

function hasTextIntent(prompt) {
  return TEXT_PATTERNS.some(p => p.test(prompt));
}

function isSimpleDesign(prompt) {
  return SIMPLE_PATTERNS.some(p => p.test(prompt));
}

function isComplexDesign(prompt) {
  return COMPLEX_PATTERNS.some(p => p.test(prompt));
}

function isVinylIntent(prompt) {
  return VINYL_PATTERNS.some(p => p.test(prompt));
}

function classifyPrompt(prompt, style) {
  // Explicit style override
  if (style === 'vinyl') return { tier: 'text', reason: 'vinyl cut mode' };

  // Auto-detect vinyl from prompt
  if (isVinylIntent(prompt)) return { tier: 'text', reason: 'vinyl keywords detected' };

  const wantsText = hasTextIntent(prompt);
  const simple = isSimpleDesign(prompt);
  const complex = isComplexDesign(prompt);

  if (wantsText) return { tier: 'text', reason: 'text rendering needed' };
  if (simple) return { tier: 'simple', reason: 'simple graphic detected' };
  if (complex) return { tier: 'complex', reason: 'complex/detailed design' };
  return { tier: 'medium', reason: 'standard graphic' };
}

// ── Prompt Framing by Style ─────────────────────────────────────────────────

function cleanPrompt(prompt) {
  return prompt
    .replace(/\b(t-?shirt|tee|hoodie|sweatshirt|jersey|apparel|garment|clothing|wear|merch|merchandise|print on|for a shirt|shirt design|design for|for my)\b/gi, '')
    .replace(/\b(vinyl|cut|cutting|htv|heat transfer|decal|vector|one.?color|single.?color|plotter|cutter|cricut|silhouette cameo|weeding)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function framePrompt(prompt, style = 'dtf') {
  const cleaned = cleanPrompt(prompt);

  if (style === 'vinyl') {
    return `Bold typography design: ${cleaned}. Single solid flat color, pure black on pure white background. No shadows, no gradients, no outlines, no 3D effects, no drop shadows, no glow, no texture, no bevels. Perfectly clean flat vector-style shapes only. High contrast, sharp clean edges. The design must be one single color with no shading or variation.`;
  }

  if (style === 'print') {
    return `Screen print ready graphic: ${cleaned}. Bold clean separated colors, flat artwork, no gradients, high contrast. Isolated on plain white background. Print-ready graphic design.`;
  }

  // Default: DTF / full color sticker
  return `A single die-cut sticker of: ${cleaned}. Placed flat on plain white surface, photographed from above. Vibrant colors, thick white border, glossy finish. Only the sticker visible, no other objects.`;
}

function framePromptIdeogram(prompt, style = 'dtf') {
  const cleaned = cleanPrompt(prompt);

  if (style === 'vinyl') {
    return `Typography design: ${cleaned}. Single solid flat color text on pure white background. Bold clean letterforms. No shadows, no outlines, no gradients, no 3D effects, no bevels, no glow, no texture. One flat solid color only. Sharp clean edges, vector-style flat shapes. High contrast black on white.`;
  }

  if (style === 'print') {
    return `Screen print design: ${cleaned}. Bold readable text, clean typography, flat colors, no gradients. Isolated on plain white background. Print-ready.`;
  }

  // Default: DTF
  return `A die-cut sticker design: ${cleaned}. Bold readable text, clean typography, vibrant colors, white border, isolated on plain white background. Sticker style, no other objects.`;
}

// ══════════════════════════════════════════════════════════════════════════════
// MODEL IMPLEMENTATIONS
// ══════════════════════════════════════════════════════════════════════════════

// ── Flux Schnell ($0.003/image) ─────────────────────────────────────────────

async function generateWithFluxSchnell(prompt, style) {
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) throw new Error('Replicate not configured');

  const fullPrompt = framePrompt(prompt, style);

  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt: fullPrompt,
        aspect_ratio: '1:1',
        output_format: 'png',
        num_outputs: 1,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[Flux Schnell] error:', err);
    throw new Error('Flux Schnell generation failed');
  }

  const prediction = await res.json();
  if (prediction.status === 'succeeded' && prediction.output) {
    const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    console.log('[Flux Schnell] generated ($0.003):', String(imageUrl).slice(0, 80));
    return imageUrl;
  }

  return await pollPrediction(prediction, apiKey, 'Flux Schnell');
}

// ── Flux Dev ($0.030/image) ─────────────────────────────────────────────────

async function generateWithFluxDev(prompt, style) {
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) throw new Error('Replicate not configured');

  const fullPrompt = framePrompt(prompt, style);

  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-dev/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt: fullPrompt,
        aspect_ratio: '1:1',
        output_format: 'png',
        go_fast: true,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[Flux Dev] error:', err);
    throw new Error('Flux Dev generation failed');
  }

  const prediction = await res.json();
  if (prediction.status === 'succeeded' && prediction.output) {
    const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    console.log('[Flux Dev] generated ($0.030):', String(imageUrl).slice(0, 80));
    return imageUrl;
  }

  return await pollPrediction(prediction, apiKey, 'Flux Dev');
}

// ── Flux Pro ($0.055/image) ─────────────────────────────────────────────────

async function generateWithFluxPro(prompt, style) {
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) throw new Error('Replicate not configured');

  const fullPrompt = framePrompt(prompt, style);

  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'wait',
    },
    body: JSON.stringify({
      input: {
        prompt: fullPrompt,
        aspect_ratio: '1:1',
        output_format: 'png',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[Flux Pro] error:', err);
    throw new Error('Flux Pro generation failed');
  }

  const prediction = await res.json();
  if (prediction.status === 'succeeded' && prediction.output) {
    const imageUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    console.log('[Flux Pro] generated ($0.055):', String(imageUrl).slice(0, 80));
    return imageUrl;
  }

  return await pollPrediction(prediction, apiKey, 'Flux Pro');
}

// ── Ideogram ($0.030/image) — best for text rendering ───────────────────────

async function generateWithIdeogram(prompt, style) {
  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey) throw new Error('Ideogram not configured');

  const fullPrompt = framePromptIdeogram(prompt, style);

  const res = await fetch('https://api.ideogram.ai/generate', {
    method: 'POST',
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_request: {
        prompt: fullPrompt,
        model: 'V_2',
        magic_prompt_option: 'ON',
        aspect_ratio: 'ASPECT_1_1',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    console.error('[Ideogram] error:', err);
    throw new Error('Ideogram generation failed');
  }

  const data = await res.json();
  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) throw new Error('No image returned from Ideogram');
  console.log('[Ideogram] generated ($0.030):', imageUrl.slice(0, 80));
  return imageUrl;
}

// ── DALL-E 3 ($0.040/image) — last resort ───────────────────────────────────

async function generateWithDalle(prompt, style) {
  const fullPrompt = framePrompt(prompt, style);

  const response = await openai.images.generate({
    model: 'dall-e-3',
    prompt: fullPrompt,
    n: 1,
    size: '1024x1024',
  });

  const imageUrl = response.data?.[0]?.url;
  if (!imageUrl) throw new Error('No image returned from DALL-E');
  console.log('[DALL-E] generated ($0.040):', imageUrl.slice(0, 80));
  return imageUrl;
}

// ── Polling helper ──────────────────────────────────────────────────────────

async function pollPrediction(prediction, apiKey, modelName) {
  const getUrl = prediction.urls?.get;
  if (!getUrl) throw new Error(`No prediction URL from ${modelName}`);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const pollRes = await fetch(getUrl, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const status = await pollRes.json();
    if (status.status === 'succeeded') {
      const imageUrl = Array.isArray(status.output) ? status.output[0] : status.output;
      console.log(`[${modelName}] generated:`, String(imageUrl).slice(0, 80));
      return imageUrl;
    }
    if (status.status === 'failed' || status.status === 'canceled') {
      throw new Error(`${modelName} failed: ${status.error || status.status}`);
    }
  }
  throw new Error(`${modelName} timed out`);
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — Smart Cost Router
// ══════════════════════════════════════════════════════════════════════════════
//
// style: 'dtf' (default), 'vinyl', 'print'
//

export async function generateDesign(prompt, color, garmentType, style = 'dtf') {
  // Auto-detect vinyl if not explicitly set
  if (style === 'dtf' && isVinylIntent(prompt)) {
    style = 'vinyl';
  }

  const classification = classifyPrompt(prompt, style);
  console.log(`[Smart Router] "${prompt.slice(0, 60)}..." → ${classification.tier} (${classification.reason}) [style=${style}]`);

  // ── VINYL — always route to Ideogram (best text rendering, $0.030) ────
  if (style === 'vinyl') {
    if (process.env.IDEOGRAM_API_KEY) {
      try {
        return await generateWithIdeogram(prompt, style);
      } catch (err) {
        console.error('[Smart Router] Ideogram failed for vinyl:', err.message);
      }
    }
    // Fallback: Flux Schnell is cheap and decent for solid shapes
    if (process.env.REPLICATE_API_KEY) {
      try { return await generateWithFluxSchnell(prompt, style); } catch {}
      try { return await generateWithFluxDev(prompt, style); } catch {}
    }
    try { return await generateWithDalle(prompt, style); } catch {}
    throw new Error('All vinyl generation models failed');
  }

  // ── TIER: TEXT — must use Ideogram ─────────────────────────────────────
  if (classification.tier === 'text') {
    if (process.env.IDEOGRAM_API_KEY) {
      try {
        return await generateWithIdeogram(prompt, style);
      } catch (err) {
        console.error('[Smart Router] Ideogram failed:', err.message);
      }
    }
    try { return await generateWithFluxPro(prompt, style); } catch {}
    try { return await generateWithDalle(prompt, style); } catch {}
    throw new Error('All text-rendering models failed');
  }

  // ── TIER: SIMPLE — use Flux Schnell ($0.003) ──────────────────────────
  if (classification.tier === 'simple') {
    if (process.env.REPLICATE_API_KEY) {
      try {
        return await generateWithFluxSchnell(prompt, style);
      } catch (err) {
        console.error('[Smart Router] Flux Schnell failed:', err.message);
      }
      try { return await generateWithFluxDev(prompt, style); } catch {}
    }
    if (process.env.IDEOGRAM_API_KEY) {
      try { return await generateWithIdeogram(prompt, style); } catch {}
    }
    try { return await generateWithDalle(prompt, style); } catch {}
    throw new Error('All generation models failed');
  }

  // ── TIER: MEDIUM — use Flux Dev ($0.030) ──────────────────────────────
  if (classification.tier === 'medium') {
    if (process.env.REPLICATE_API_KEY) {
      try {
        return await generateWithFluxDev(prompt, style);
      } catch (err) {
        console.error('[Smart Router] Flux Dev failed:', err.message);
      }
      try { return await generateWithFluxPro(prompt, style); } catch {}
    }
    if (process.env.IDEOGRAM_API_KEY) {
      try { return await generateWithIdeogram(prompt, style); } catch {}
    }
    try { return await generateWithDalle(prompt, style); } catch {}
    throw new Error('All generation models failed');
  }

  // ── TIER: COMPLEX — use Flux Pro ($0.055) ─────────────────────────────
  if (process.env.REPLICATE_API_KEY) {
    try {
      return await generateWithFluxPro(prompt, style);
    } catch (err) {
      console.error('[Smart Router] Flux Pro failed:', err.message);
    }
  }
  if (process.env.IDEOGRAM_API_KEY) {
    try { return await generateWithIdeogram(prompt, style); } catch {}
  }
  try { return await generateWithDalle(prompt, style); } catch {}
  throw new Error('All generation models failed');
}
