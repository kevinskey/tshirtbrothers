// Batch generate AI art for the Art Library in particular styles.
// Run on the droplet:
//   cd /var/www/tshirtbrothers/server && node generate-art-library-styles.js
// Args:
//   --style=<slug>   limit to one style; default = all five
//   --count=<n>      images per style; default = 50
//   --dry-run        print prompts only, no API calls / DB writes
//
// Idempotent: skips (category, name) pairs that already exist in
// admin_designs, so re-runs are safe and free.

import 'dotenv/config';
import pool from './db.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

async function generateWithIdeogram(prompt) {
  const apiKey = process.env.IDEOGRAM_API_KEY;
  if (!apiKey) throw new Error('IDEOGRAM_API_KEY not set on the droplet');
  const res = await fetch('https://api.ideogram.ai/generate', {
    method: 'POST',
    headers: { 'Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_request: {
        prompt,
        model: 'V_2',
        magic_prompt_option: 'ON',
        aspect_ratio: 'ASPECT_1_1',
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Ideogram HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const url = data?.data?.[0]?.url;
  if (!url) throw new Error('Ideogram returned no image URL');
  return url;
}

const s3 = new S3Client({
  endpoint: `https://${process.env.SPACES_REGION}.digitaloceanspaces.com`,
  region: process.env.SPACES_REGION || 'nyc3',
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
  forcePathStyle: false,
});
const BUCKET = process.env.SPACES_BUCKET || 'tshirtbrothers';
const CDN_BASE = `https://${BUCKET}.${process.env.SPACES_REGION}.cdn.digitaloceanspaces.com`;

// 50 music-themed subjects shared across all styles. Each (style, subject)
// pair yields one image, so the library gets 5 distinct visual treatments
// of the same lineup.
const SUBJECTS = [
  'cassette tape', 'vinyl record', 'electric guitar', 'acoustic guitar',
  'bass guitar', 'drum kit', 'microphone', 'piano keys',
  'headphones', 'boombox', 'radio receiver', 'saxophone',
  'trumpet', 'drumsticks', 'record player turntable', 'speaker stack',
  'guitar amplifier', 'accordion', 'harmonica', 'banjo',
  'ukulele', 'tambourine', 'maracas', 'conga drums',
  'music note', 'treble clef', 'bass clef', 'equalizer bars',
  'sound waves', 'DJ turntables', 'mixer console', 'vintage tube radio',
  'transistor radio', 'gramophone', 'walkman cassette player', 'CD player',
  'retro mp3 player', 'concert ticket stub', 'backstage pass', 'guitar pick',
  'drum cymbal', 'french horn', 'trombone', 'clarinet',
  'flute', 'violin', 'cello', 'xylophone',
  'harp', 'synthesizer',
];

// Each style: a slug (folder + admin_designs.category) + a prompt template
// that takes ONE subject and returns the final Flux prompt.
const STYLES = {
  'retro-mascot': {
    label: 'Retro Mascot',
    prompt: (subject) =>
      `vintage 1930s rubber-hose cartoon mascot of a ${subject}, anthropomorphized character with arms and legs and white gloves, big oval cartoon eyes, clean thin black outlines, flat two-color fill in warm retro hues (e.g. pink and teal, red and cream, orange and brown), textured cream background, bold serif headline above the mascot, centered composition, retro Disney studios style, t-shirt graphic, isolated, no extra elements`,
  },
  'hand-drawn-sketch': {
    label: 'Hand Drawn Sketch',
    prompt: (subject) =>
      `black ink hand-drawn pen sketch of a ${subject}, playful cartoon doodle style, motion squiggles and stars and swirls around the subject, transparent or clean white background, cartoon-bubble lettering text below reading the subject name, monochrome black line art only, sketchbook aesthetic, t-shirt graphic, isolated`,
  },
  'vintage-grunge-typography': {
    label: 'Vintage Grunge Typography',
    prompt: (subject) =>
      `vintage textured distressed typography poster celebrating ${subject}, bold serif headline with grunge and halftone texture, faded ink and washed-out edges, banner ribbons and small arrow accents, animal silhouettes like tigers or eagles flanking the type, muted vintage cream and faded blue and rust palette on dark charcoal background, retro Americana print, t-shirt graphic`,
  },
  'vintage-badge-logo': {
    label: 'Vintage Badge Logo',
    prompt: (subject) =>
      `vintage badge logo design featuring a ${subject}, black ink hand-lettered script combined with bold serif typography, classic line drawing illustration of the subject, decorative flourishes and a 'EST. 1992' style label, single-color black ink on cream paper background, classic American craft brand aesthetic, t-shirt graphic, isolated centered composition`,
  },
  'streetwear-collage': {
    label: 'Streetwear Collage',
    prompt: (subject) =>
      `abstract streetwear collage graphic with a ${subject} as the centerpiece, red and black ink splatter and bold brush strokes, layered handwritten cursive scribbles, deconstructed silhouette with chaotic scribbled line work over the top, mixed-media street art and high-fashion editorial style, asymmetric composition, t-shirt print, isolated on near-white background`,
  },
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = { style: null, count: 50, dryRun: false };
  for (const a of argv) {
    if (a.startsWith('--style=')) out.style = a.slice(8);
    else if (a.startsWith('--count=')) out.count = parseInt(a.slice(8), 10) || 50;
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function generateOne(styleSlug, subject, index, total, dryRun) {
  const style = STYLES[styleSlug];
  const tag = `[${styleSlug} ${index + 1}/${total}]`;
  const name = `${style.label} — ${subject.charAt(0).toUpperCase() + subject.slice(1)}`;

  // Idempotent: skip if (category, name) already exists.
  const existing = await pool.query(
    'SELECT 1 FROM admin_designs WHERE category = $1 AND name = $2 LIMIT 1',
    [styleSlug, name],
  );
  if (existing.rowCount > 0) {
    console.log(`${tag} SKIP (already saved): ${name}`);
    return 'skipped';
  }

  const fullPrompt = style.prompt(subject);
  if (dryRun) {
    console.log(`${tag} DRY-RUN prompt: ${fullPrompt.slice(0, 120)}…`);
    return 'dry-run';
  }

  try {
    console.log(`${tag} generating: ${subject}…`);
    // All five styles include hand-lettered headlines or signage in the
    // reference samples. Flux Schnell can't render legible text — Ideogram
    // can ($0.030 vs $0.003, still cheap at this volume) — so route the
    // whole batch through Ideogram.
    const imageUrl = await generateWithIdeogram(fullPrompt);
    if (!imageUrl) throw new Error('No output from Ideogram');

    const imgRes = await fetch(imageUrl.toString());
    if (!imgRes.ok) throw new Error(`fetch image -> ${imgRes.status}`);
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    const key = `art-library/${styleSlug}/${randomUUID()}.png`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: imgBuffer,
      ContentType: 'image/png',
      ACL: 'public-read',
    }));
    const publicUrl = `${CDN_BASE}/${key}`;

    await pool.query(
      `INSERT INTO admin_designs (name, image_url, category, tags, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [name, publicUrl, styleSlug, [styleSlug, 'art-library', 'ai-generated']],
    );
    console.log(`${tag} saved → ${publicUrl}`);
    return 'ok';
  } catch (err) {
    console.error(`${tag} FAILED: ${err.message}`);
    return 'failed';
  }
}

async function main() {
  const { style, count, dryRun } = parseArgs();
  const styles = style
    ? (STYLES[style] ? [style] : [])
    : Object.keys(STYLES);
  if (style && styles.length === 0) {
    console.error(`Unknown style: ${style}. Valid: ${Object.keys(STYLES).join(', ')}`);
    process.exit(1);
  }
  const perStyle = Math.min(count, SUBJECTS.length);
  console.log(`Generating ${perStyle} per style across [${styles.join(', ')}] (${dryRun ? 'DRY RUN' : 'LIVE'})`);

  const totals = { ok: 0, skipped: 0, failed: 0, dry: 0 };
  for (const slug of styles) {
    for (let i = 0; i < perStyle; i++) {
      const subj = SUBJECTS[i];
      const r = await generateOne(slug, subj, i, perStyle, dryRun);
      if (r === 'ok') totals.ok++;
      else if (r === 'skipped') totals.skipped++;
      else if (r === 'dry-run') totals.dry++;
      else totals.failed++;
    }
  }
  console.log('\nDone.', totals);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
