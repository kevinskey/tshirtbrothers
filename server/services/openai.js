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
  // Vinyl + Screen Print used to force tier='text' (Ideogram) regardless
  // of prompt content. That made descriptive prompts ("a blue bowling ball
  // reflecting the beach…") come back as literal typography of the prompt.
  // Now route to text-tier ONLY when the prompt actually wants rendered
  // text (quoted phrase, "the words…", etc.). Otherwise classify normally.

  const wantsText = hasTextIntent(prompt);
  const simple = isSimpleDesign(prompt);
  const complex = isComplexDesign(prompt);

  if (wantsText) return { tier: 'text', reason: 'text rendering needed' };

  // Vinyl/auto-vinyl is a hint that the design wants clean shapes — but
  // 'simple' tier (Flux Schnell) handles that better than Ideogram for
  // non-text prompts.
  if (style === 'vinyl' || isVinylIntent(prompt)) {
    return { tier: 'simple', reason: 'vinyl/cut style — clean shapes' };
  }

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

function framePrompt(prompt, style = 'dtf', colorCount = 1) {
  const cleaned = cleanPrompt(prompt);

  if (style === 'vinyl') {
    if (colorCount > 1) {
      // Don't name colors in the prompt — naming them triggers DALL-E to
      // render swatches/palette samples as part of the design. Instead:
      // describe the goal, demand the subject fills the frame, and forbid
      // every kind of extra element we've seen leak through.
      return `A bold flat vector-style illustration of: ${cleaned}. The subject fills the entire frame, centered, on a fully transparent background. Use a limited palette of about ${colorCount} bold flat solid colors with hard sharp edges between color regions — no gradients, no shading, no shadows, no outlines, no 3D, no monochrome. The composition is ONLY the subject — absolutely nothing else on the canvas: no color swatches, no color samples, no palette dots, no color circles, no color squares, no annotations, no labels, no borders, no banners, no captions, no decorations, no separator bars, no row of colored shapes. No text, no letters, no words. Just the illustrated subject, framed clean with empty space around it.`;
    }
    return `A bold flat single-color silhouette icon of: ${cleaned}. The subject fills the entire frame on a fully transparent background. Pure black on pure white. No gradients, no shadows, no outlines, no 3D, no glow, no texture. Clean sharp shapes only, vector-cut ready. ONLY the subject — no swatches, no palette samples, no dots, no circles, no annotations, no labels, no banners, no captions, no decorations, no text or letters.`;
  }

  if (style === 'print') {
    return `Screen print graphic of: ${cleaned}. Bold flat separated colors, ~4 spot colors max, no gradients, high contrast. Isolated on plain white background. NO extra text or letters added — render only the described subject.`;
  }

  // Default: DTF / full color sticker
  return `A die-cut sticker of: ${cleaned}. Placed flat on plain white surface, photographed from above. Vibrant full colors, glossy finish. Only the sticker visible. NO extra text, words, or labels added — render only the described subject.`;
}

function framePromptIdeogram(prompt, style = 'dtf', colorCount = 1) {
  const cleaned = cleanPrompt(prompt);

  if (style === 'vinyl') {
    if (colorCount > 1) {
      return `A bold flat vector-style illustration of: ${cleaned}. The subject fills the frame on a transparent white background. Use a limited palette of about ${colorCount} bold flat solid colors with hard edges between regions. No gradients, no shading, no shadows, no outlines, no 3D, no monochrome. ONLY the subject — no color swatches, no palette samples, no dots, no circles, no annotations, no labels, no banners, no decorations, no text or letters.`;
    }
    return `A bold flat single-color silhouette icon of: ${cleaned}. Pure black on plain white background. No shadows, no outlines, no gradients, no 3D, no bevels, no glow, no texture. Sharp clean edges, vector-style flat shape. ONLY the subject — no swatches, no annotations, no text, no letters, no labels.`;
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

async function generateWithFluxSchnell(prompt, style, colorCount = 1) {
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) throw new Error('Replicate not configured');

  const fullPrompt = framePrompt(prompt, style, colorCount);

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

async function generateWithFluxDev(prompt, style, colorCount = 1) {
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) throw new Error('Replicate not configured');

  const fullPrompt = framePrompt(prompt, style, colorCount);
  // Flux Dev exposes a guidance knob — bump it for vinyl/print so the
  // 'no text' / 'flat single-color' instructions get heavier weight.
  const guidance = (style === 'vinyl' || style === 'print') ? 6.5 : 3.5;

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
        guidance,
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

async function generateWithFluxPro(prompt, style, colorCount = 1) {
  const apiKey = process.env.REPLICATE_API_KEY;
  if (!apiKey) throw new Error('Replicate not configured');

  const fullPrompt = framePrompt(prompt, style, colorCount);

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

async function generateWithIdeogram(prompt, style, colorCount = 1) {
  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey) throw new Error('Ideogram not configured');

  const fullPrompt = framePromptIdeogram(prompt, style, colorCount);
  console.log('[Ideogram] colorCount=' + colorCount + ', prompt=' + fullPrompt.slice(0, 120));

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

async function generateWithDalle(prompt, style, colorCount = 1) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const fullPrompt = framePrompt(prompt, style, colorCount);
  console.log('[DALL-E] generating with colorCount=' + colorCount + ', prompt=' + fullPrompt.slice(0, 120));

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

export async function generateDesign(prompt, color, garmentType, style = 'dtf', colorCount = 1) {
  // Auto-detect vinyl if not explicitly set
  if (style === 'dtf' && isVinylIntent(prompt)) {
    style = 'vinyl';
  }

  const classification = classifyPrompt(prompt, style);
  console.log(`[Smart Router] "${prompt.slice(0, 60)}..." → ${classification.tier} (${classification.reason}) [style=${style}]`);

  // ── VINYL — pick model by need.
  //   - Real text rendering → Ideogram.
  //   - Multi-color vinyl (colorCount > 1) → DALL-E first; it follows
  //     "use exactly N distinct colors" much better than Flux. Flux Dev
  //     consistently produces monochromatic output regardless of prompt.
  //   - Single-color silhouette → Flux Dev (fast, clean shapes).
  if (style === 'vinyl') {
    if (classification.tier === 'text' && process.env.IDEOGRAM_API_KEY) {
      try {
        return await generateWithIdeogram(prompt, style);
      } catch (err) {
        console.error('[Smart Router] Ideogram failed for vinyl text:', err.message);
      }
    }
    if (colorCount > 1) {
      // Ideogram is built for design work and produces clean flat-color
      // illustrations without DALL-E's swatch-row habit. Fall back to
      // Flux Pro (best Flux quality), then Dev, then DALL-E as last resort.
      if (process.env.IDEOGRAM_API_KEY) {
        try { return await generateWithIdeogram(prompt, style, colorCount); } catch (err) {
          console.error('[Smart Router] Ideogram failed for multi-color vinyl:', err.message);
        }
      }
      if (process.env.REPLICATE_API_KEY) {
        try { return await generateWithFluxPro(prompt, style, colorCount); } catch {}
        try { return await generateWithFluxDev(prompt, style, colorCount); } catch {}
      }
      try { return await generateWithDalle(prompt, style, colorCount); } catch {}
      throw new Error('All multi-color vinyl models failed');
    }
    if (process.env.REPLICATE_API_KEY) {
      try { return await generateWithFluxDev(prompt, style, colorCount); } catch {}
      try { return await generateWithFluxSchnell(prompt, style, colorCount); } catch {}
    }
    try { return await generateWithDalle(prompt, style, colorCount); } catch {}
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
    try { return await generateWithFluxPro(prompt, style, colorCount); } catch {}
    try { return await generateWithDalle(prompt, style, colorCount); } catch {}
    throw new Error('All text-rendering models failed');
  }

  // ── TIER: SIMPLE — use Flux Schnell ($0.003) ──────────────────────────
  if (classification.tier === 'simple') {
    if (process.env.REPLICATE_API_KEY) {
      try {
        return await generateWithFluxSchnell(prompt, style, colorCount);
      } catch (err) {
        console.error('[Smart Router] Flux Schnell failed:', err.message);
      }
      try { return await generateWithFluxDev(prompt, style, colorCount); } catch {}
    }
    if (process.env.IDEOGRAM_API_KEY) {
      try { return await generateWithIdeogram(prompt, style); } catch {}
    }
    try { return await generateWithDalle(prompt, style, colorCount); } catch {}
    throw new Error('All generation models failed');
  }

  // ── TIER: MEDIUM — use Flux Dev ($0.030) ──────────────────────────────
  if (classification.tier === 'medium') {
    if (process.env.REPLICATE_API_KEY) {
      try {
        return await generateWithFluxDev(prompt, style, colorCount);
      } catch (err) {
        console.error('[Smart Router] Flux Dev failed:', err.message);
      }
      try { return await generateWithFluxPro(prompt, style, colorCount); } catch {}
    }
    if (process.env.IDEOGRAM_API_KEY) {
      try { return await generateWithIdeogram(prompt, style); } catch {}
    }
    try { return await generateWithDalle(prompt, style, colorCount); } catch {}
    throw new Error('All generation models failed');
  }

  // ── TIER: COMPLEX — use Flux Pro ($0.055) ─────────────────────────────
  if (process.env.REPLICATE_API_KEY) {
    try {
      return await generateWithFluxPro(prompt, style, colorCount);
    } catch (err) {
      console.error('[Smart Router] Flux Pro failed:', err.message);
    }
  }
  if (process.env.IDEOGRAM_API_KEY) {
    try { return await generateWithIdeogram(prompt, style); } catch {}
  }
  try { return await generateWithDalle(prompt, style, colorCount); } catch {}
  throw new Error('All generation models failed');
}
