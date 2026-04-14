import express, { Router } from 'express';
import pool from '../db.js';
import { generateDesign } from '../services/openai.js';
import Replicate from 'replicate';
import QRCode from 'qrcode';
import { execFile } from 'child_process';
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
const router = Router();
const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY });

// Helper: fetch a remote image and return a base64 data URL
async function fetchImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const contentType = res.headers.get('content-type') || 'image/png';
  const buffer = await res.arrayBuffer();
  return `data:${contentType};base64,${Buffer.from(buffer).toString('base64')}`;
}

// ── Background Removal via Replicate ────────────────────────────────────────
// Default model is 851-labs/background-remover (BiRefNet) because it handles
// logos with drop shadows, outlines, and fine text far better than u2net-based
// rembg. Override with BGRM_MODEL env var if a different one works better for
// your artwork.

const DEFAULT_BGRM_MODEL = "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";
const FALLBACK_BGRM_MODEL = "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003";

async function runBgRemoval(modelRef, imageInput) {
  const output = await replicate.run(modelRef, { input: { image: imageInput } });
  if (!output) return null;
  const resultUrl = typeof output === 'string' ? output : output.toString();
  const res = await fetch(resultUrl);
  if (!res.ok) throw new Error(`Failed to fetch result: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
}

async function removeBackgroundReplicate(imageInput) {
  const primary = process.env.BGRM_MODEL || DEFAULT_BGRM_MODEL;
  try {
    console.log(`[bg-removal] Using ${primary}...`);
    const result = await runBgRemoval(primary, imageInput);
    if (result) return result;
  } catch (err) {
    console.error(`[bg-removal] ${primary} failed:`, err.message);
  }
  // Fallback to the old u2net rembg model if the primary isn't available
  try {
    console.log(`[bg-removal] Falling back to ${FALLBACK_BGRM_MODEL}...`);
    return await runBgRemoval(FALLBACK_BGRM_MODEL, imageInput);
  } catch (err) {
    console.error('[bg-removal] Fallback rembg error:', err.message);
    return null;
  }
}

// ── Image Upscaling via Replicate Real-ESRGAN ($0.0017/run) ─────────────────

async function upscaleReplicate(imageInput, scaleFactor = 4) {
  try {
    console.log(`[upscale] Using Real-ESRGAN ${scaleFactor}x ($0.0017)...`);
    const output = await replicate.run(
      "nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa",
      {
        input: {
          image: imageInput,
          scale: scaleFactor,
          face_enhance: false,
        },
      }
    );

    if (!output) {
      console.error('[upscale] Replicate returned no output');
      throw new Error('Replicate returned no output');
    }

    const resultUrl = typeof output === 'string' ? output : output.toString();
    console.log('[upscale] Success, fetching result...');

    const res = await fetch(resultUrl);
    if (!res.ok) throw new Error(`Failed to fetch result: ${res.status}`);
    const buffer = await res.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(buffer).toString('base64')}`;
  } catch (err) {
    console.error('[upscale] Real-ESRGAN error:', err);
    // Re-throw so the route handler can surface the real error to the client
    throw err;
  }
}

// ── Vectorize: PNG → SVG via ImageMagick + Potrace (free, local) ────────────

async function vectorizePNG(pngBase64, colors = 1) {
  const tmpDir = await mkdtemp(join(tmpdir(), 'vectorize-'));
  const pngPath = join(tmpDir, 'input.png');
  const bmpPath = join(tmpDir, 'input.bmp');
  const svgPath = join(tmpDir, 'output.svg');

  try {
    // Write PNG to disk
    const base64Data = pngBase64.replace(/^data:image\/\w+;base64,/, '');
    await writeFile(pngPath, Buffer.from(base64Data, 'base64'));

    if (colors <= 1) {
      // Single-color: convert to monochrome BMP, then trace
      console.log('[vectorize] Single-color trace via potrace...');
      await execFileAsync('convert', [
        pngPath,
        '-alpha', 'extract',       // use alpha channel as the shape
        '-negate',                  // potrace expects black = foreground
        '-threshold', '50%',
        'BMP3:' + bmpPath,
      ]);

      await execFileAsync('potrace', [
        bmpPath,
        '-s',                      // SVG output
        '-o', svgPath,
        '--flat',                   // no grouping, cleaner paths
        '--turdsize', '10',         // ignore specks < 10px
        '--opttolerance', '0.2',    // smooth curves
      ]);
    } else {
      // Multi-color: posterize to N colors, trace each layer, combine
      console.log(`[vectorize] Multi-color trace (${colors} colors) via potrace...`);

      // Posterize to reduce colors
      const posterizedPath = join(tmpDir, 'posterized.png');
      await execFileAsync('convert', [
        pngPath,
        '-colors', String(Math.min(colors, 12)),
        '-posterize', String(Math.min(colors, 12)),
        posterizedPath,
      ]);

      // Get unique colors from posterized image
      const { stdout: colorList } = await execFileAsync('convert', [
        posterizedPath,
        '-format', '%c',
        '-depth', '8',
        'histogram:info:-',
      ]);

      // Parse hex colors from histogram output
      const hexColors = [];
      const colorRegex = /#([0-9A-Fa-f]{6})/g;
      let match;
      while ((match = colorRegex.exec(colorList)) !== null) {
        const hex = '#' + match[1];
        if (!hexColors.includes(hex) && hex !== '#000000' && hex !== '#FFFFFF' && hex !== '#ffffff') {
          hexColors.push(hex);
        }
      }

      if (hexColors.length === 0) {
        // Fallback to single-color trace
        return vectorizePNG(pngBase64, 1);
      }

      // Trace each color layer
      const svgLayers = [];
      for (let i = 0; i < hexColors.length && i < colors; i++) {
        const hex = hexColors[i];
        const layerBmp = join(tmpDir, `layer-${i}.bmp`);
        const layerSvg = join(tmpDir, `layer-${i}.svg`);

        // Isolate this color
        await execFileAsync('convert', [
          posterizedPath,
          '-fill', 'white', '+opaque', hex,  // make everything except this color white
          '-fill', 'black', '-opaque', hex,   // make this color black
          '-colorspace', 'Gray',
          '-threshold', '50%',
          'BMP3:' + layerBmp,
        ]);

        await execFileAsync('potrace', [
          layerBmp,
          '-s', '-o', layerSvg,
          '--flat',
          '--turdsize', '10',
          '--opttolerance', '0.2',
          '--color', hex,
        ]);

        // Read SVG content and extract paths
        const layerContent = await readFile(layerSvg, 'utf8');
        const pathMatch = layerContent.match(/<path[^>]*\/>/g) || layerContent.match(/<path[^>]*>[\s\S]*?<\/path>/g);
        if (pathMatch) {
          svgLayers.push(...pathMatch);
        }

        // Cleanup layer files
        await unlink(layerBmp).catch(() => {});
        await unlink(layerSvg).catch(() => {});
      }

      // Get dimensions from first layer
      const { stdout: dims } = await execFileAsync('identify', [
        '-format', '%w %h',
        pngPath,
      ]);
      const [w, h] = dims.trim().split(' ');

      // Combine into single SVG
      const combinedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${svgLayers.join('\n')}
</svg>`;

      await writeFile(svgPath, combinedSvg);
    }

    // Read the SVG result
    const svgContent = await readFile(svgPath, 'utf8');
    console.log(`[vectorize] Success! SVG size: ${Math.round(svgContent.length / 1024)}KB`);
    return svgContent;
  } finally {
    // Cleanup temp files
    await unlink(pngPath).catch(() => {});
    await unlink(bmpPath).catch(() => {});
    await unlink(svgPath).catch(() => {});
    // Remove temp dir
    const { rmdir } = await import('fs/promises');
    await rmdir(tmpDir).catch(() => {});
  }
}

// ── POST /generate — AI image generation with smart cost routing ────────────

router.post('/generate', async (req, res, next) => {
  try {
    const { prompt, color, garmentType, removeBackground = false, style = 'dtf' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const imageUrl = await generateDesign(prompt, color, garmentType, style);

    if (!removeBackground) {
      return res.json({ imageUrl });
    }

    // Remove background
    const transparent = await removeBackgroundReplicate(imageUrl);
    if (transparent) {
      return res.json({ imageUrl: transparent, backgroundRemoved: true });
    }

    res.json({ imageUrl, backgroundRemoved: false });
  } catch (err) {
    next(err);
  }
});

// ── POST /remove-bg — Remove background ($0.004/image) ─────────────────────

router.post('/remove-bg', async (req, res, next) => {
  try {
    let { imageBase64, imageUrl } = req.body;

    let replicateInput;
    if (imageUrl) {
      replicateInput = imageUrl;
    } else if (imageBase64) {
      replicateInput = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
    } else {
      return res.status(400).json({ error: 'imageBase64 or imageUrl is required' });
    }

    const result = await removeBackgroundReplicate(replicateInput);
    if (!result) {
      return res.status(500).json({ error: 'Background removal failed' });
    }

    res.json({ imageBase64: result });
  } catch (err) {
    next(err);
  }
});

// ── POST /remove-color — Magic-wand transparency for solid-color fills ──────
// Uses ImageMagick's -fuzz to knock out every connected pixel within a
// tolerance of the chosen hex colour. Perfect cleanup for logos where the
// AI removed the outer bg but left drop shadows / interior blocks of the
// same colour intact.
//
// Body: { imageBase64 or imageUrl, color: "#000000", fuzz: 25 }

router.post('/remove-color', express.json({ limit: '25mb' }), async (req, res, next) => {
  const tmpDir = await mkdtemp(join(tmpdir(), 'remove-color-'));
  const inPath = join(tmpDir, 'in.png');
  const outPath = join(tmpDir, 'out.png');
  try {
    let { imageBase64, imageUrl, color = '#000000', fuzz = 25 } = req.body;
    if (!imageBase64 && !imageUrl) {
      return res.status(400).json({ error: 'imageBase64 or imageUrl is required' });
    }

    let srcBuffer;
    if (imageUrl) {
      const r = await fetch(imageUrl);
      if (!r.ok) return res.status(400).json({ error: `Failed to fetch imageUrl (${r.status})` });
      srcBuffer = Buffer.from(await r.arrayBuffer());
    } else {
      const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      srcBuffer = Buffer.from(base64, 'base64');
    }
    await writeFile(inPath, srcBuffer);

    // Normalise and clamp inputs
    const hex = /^#?[0-9a-fA-F]{6}$/.test(color) ? (color.startsWith('#') ? color : `#${color}`) : '#000000';
    const fuzzPct = Math.max(0, Math.min(80, Number(fuzz) || 0));

    await execFileAsync('convert', [
      inPath,
      '-alpha', 'set',
      '-fuzz', `${fuzzPct}%`,
      '-transparent', hex,
      outPath,
    ]);

    const outBuffer = await readFile(outPath);
    res.json({ imageBase64: `data:image/png;base64,${outBuffer.toString('base64')}` });
  } catch (err) {
    console.error('[remove-color] error:', err);
    res.status(500).json({ error: err.message || 'Color removal failed' });
  } finally {
    // best-effort cleanup
    try { await execFileAsync('rm', ['-rf', tmpDir]); } catch { /* ignore */ }
  }
});

// ── POST /upscale — Upscale low-res images ($0.0017/image) ──────────────────

router.post('/upscale', async (req, res, next) => {
  try {
    let { imageBase64, imageUrl, scale = 4 } = req.body;

    let replicateInput;
    if (imageUrl) {
      replicateInput = imageUrl;
    } else if (imageBase64) {
      replicateInput = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
    } else {
      return res.status(400).json({ error: 'imageBase64 or imageUrl is required' });
    }

    const scaleFactor = scale >= 4 ? 4 : 2;

    if (!process.env.REPLICATE_API_KEY) {
      return res.status(500).json({ error: 'REPLICATE_API_KEY is not set on the server' });
    }

    try {
      const result = await upscaleReplicate(replicateInput, scaleFactor);
      if (!result) {
        return res.status(500).json({ error: 'Upscaling failed — Replicate returned nothing.' });
      }
      res.json({ imageBase64: result });
    } catch (replicateErr) {
      console.error('[upscale] route error:', replicateErr);
      return res.status(500).json({ error: `Upscaling failed: ${replicateErr.message || replicateErr}` });
    }
  } catch (err) {
    next(err);
  }
});

// ── POST /vectorize — Convert PNG to cut-ready SVG (free, local potrace) ────

router.post('/vectorize', async (req, res, next) => {
  try {
    let { imageBase64, imageUrl, colors = 1 } = req.body;

    // Get image as base64
    if (!imageBase64 && imageUrl) {
      imageBase64 = await fetchImageAsBase64(imageUrl);
    }
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 or imageUrl is required' });
    }

    const svg = await vectorizePNG(imageBase64, colors);
    if (!svg) {
      return res.status(500).json({ error: 'Vectorization failed' });
    }

    res.json({ svg });
  } catch (err) {
    next(err);
  }
});

// ── POST /prep-vinyl — Full pipeline: remove shadow → vectorize to SVG ──────

router.post('/prep-vinyl', async (req, res, next) => {
  try {
    let { imageBase64, imageUrl, colors = 1 } = req.body;

    console.log('[prep-vinyl] Starting full pipeline...');

    // Step 1: Determine input for bg removal
    let replicateInput;
    if (imageUrl) {
      replicateInput = imageUrl;
    } else if (imageBase64) {
      replicateInput = imageBase64.startsWith('data:') ? imageBase64 : `data:image/png;base64,${imageBase64}`;
    } else {
      return res.status(400).json({ error: 'imageBase64 or imageUrl is required' });
    }

    // Step 2: Remove background + drop shadows via rembg
    console.log('[prep-vinyl] Step 1/2: Removing background & shadows...');
    const cleanPng = await removeBackgroundReplicate(replicateInput);
    if (!cleanPng) {
      return res.status(500).json({ error: 'Background/shadow removal failed' });
    }

    // Step 3: Vectorize the clean PNG to SVG
    console.log('[prep-vinyl] Step 2/2: Vectorizing to SVG...');
    const svg = await vectorizePNG(cleanPng, colors);
    if (!svg) {
      return res.status(500).json({ error: 'Vectorization failed' });
    }

    console.log('[prep-vinyl] Pipeline complete!');
    res.json({
      cleanPng,  // the shadow-free PNG (for preview)
      svg,       // the cut-ready SVG
    });
  } catch (err) {
    next(err);
  }
});


// ── POST /qrcode — Generate high-res QR code for print (free, local) ────────

router.post('/qrcode', async (req, res, next) => {
  try {
    const { text, size = 1024, darkColor = '#000000', lightColor = '#ffffff', transparent = false, margin = 2, errorCorrection = 'H' } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required (URL, address, phone, etc.)' });
    }

    console.log(`[qrcode] Generating for: "${text.slice(0, 60)}..." at ${size}px`);

    const options = {
      type: 'image/png',
      width: size,
      margin: margin,
      errorCorrectionLevel: errorCorrection,
      color: {
        dark: darkColor,
        light: transparent ? '#00000000' : lightColor,
      },
    };

    const dataUrl = await QRCode.toDataURL(text.trim(), options);
    console.log(`[qrcode] Generated ${size}x${size}px QR code`);

    res.json({ imageBase64: dataUrl });
  } catch (err) {
    next(err);
  }
});


// ── GET /art-library — Public endpoint for Design Studio "Add Art" panel ────

router.get('/art-library', async (req, res, next) => {
  try {
    const { category, q, limit } = req.query;
    let query = 'SELECT id, name, image_url, category FROM admin_designs';
    const params = [];
    const where = [];

    if (category && category !== 'all') {
      params.push(category);
      where.push(`category = $${params.length}`);
    }
    if (q && String(q).trim()) {
      params.push(`%${String(q).trim().toLowerCase()}%`);
      where.push(`(LOWER(name) ILIKE $${params.length} OR LOWER(description) ILIKE $${params.length})`);
    }
    if (where.length) query += ' WHERE ' + where.join(' AND ');

    query += ' ORDER BY created_at DESC';
    const n = Math.min(parseInt(String(limit ?? '200'), 10) || 200, 500);
    params.push(n);
    query += ` LIMIT $${params.length}`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /art-categories — List categories with counts ───────────────────────

router.get('/art-categories', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT category, COUNT(*) as count FROM admin_designs GROUP BY category ORDER BY category`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

export default router;
