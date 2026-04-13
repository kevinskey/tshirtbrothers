// Batch generate AI art for the Design Studio "Add Art" panel
// Run: node generate-art-library.js
// Generates 10 images per category, saves to DO Spaces + admin_designs table

import 'dotenv/config';
import pool from './db.js';
import Replicate from 'replicate';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY });

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

// ── Category prompts — 10 diverse prompts per category ──────────────────────

const CATEGORY_PROMPTS = {
  'sports': [
    'basketball on fire with motion trails',
    'football helmet with aggressive eagle design',
    'baseball crossed bats with home plate',
    'soccer ball breaking through a net',
    'boxing gloves hanging on a hook',
    'trophy cup with golden laurel wreath',
    'running sneaker with speed lines',
    'volleyball with dynamic splash effect',
    'golf club and ball on a tee',
    'wrestling silhouette in power pose',
  ],
  'animals': [
    'roaring lion head with flowing mane',
    'bald eagle with spread wings',
    'fierce wolf howling at the moon',
    'coiled snake with fangs showing',
    'bulldog mascot with spiked collar',
    'bear paw print with claw marks',
    'shark breaking through surface',
    'panther leaping in attack pose',
    'deer antlers with forest silhouette',
    'butterfly with ornate detailed wings',
  ],
  'mascots': [
    'fierce tiger mascot with jersey',
    'warrior spartan helmet',
    'angry hornet with stinger',
    'charging bull mascot',
    'pirate skull with crossbones and bandana',
    'dragon breathing fire',
    'knight helmet with plume feathers',
    'growling bear mascot',
    'hawk mascot with talons',
    'cobra snake mascot coiled to strike',
  ],
  'nature': [
    'palm tree sunset silhouette',
    'mountain range with pine forest',
    'single red rose with thorns',
    'oak tree with spreading branches',
    'ocean wave cresting japanese style',
    'sunflower in full bloom',
    'cactus in desert landscape',
    'lotus flower on water',
    'lightning bolt striking',
    'campfire with sparks rising',
  ],
  'america': [
    'American flag waving in wind',
    'bald eagle with USA shield',
    'Statue of Liberty torch',
    'American flag skull patriotic',
    'dog tags with USA flag',
    'patriotic stars and stripes banner',
    'dont tread on me rattlesnake',
    'veteran eagle with military helmet',
    'liberty bell with crack detail',
    'fireworks over American skyline',
  ],
  'parties': [
    'birthday cake with candles and confetti',
    'champagne glasses toasting celebration',
    'disco ball with colorful lights',
    'party hat with streamers',
    'neon cocktail glass with splash',
    'balloon arch celebration',
    'DJ turntable with headphones',
    'masquerade mask ornate',
    'fireworks burst colorful',
    'karaoke microphone with music notes',
  ],
  'military': [
    'military dog tags on chain',
    'combat boots with flag',
    'fighter jet silhouette',
    'military helmet with bullets',
    'anchor with navy rope',
    'parachute with airborne wings',
    'military compass and map',
    'camouflage skull',
    'crossed rifles military emblem',
    'tank silhouette battle scene',
  ],
  'occupations': [
    'firefighter helmet with axes',
    'nurse stethoscope with heart',
    'police badge with star',
    'chef hat with crossed knives',
    'construction hard hat with tools',
    'wrench and gear mechanic emblem',
    'barber pole with scissors',
    'teacher apple with books',
    'camera photographer lens',
    'pilot wings aviation badge',
  ],
  'music': [
    'electric guitar with flames',
    'headphones with sound waves',
    'vinyl record spinning',
    'piano keys with music notes',
    'drum set with sticks',
    'microphone vintage retro style',
    'treble clef artistic design',
    'hip hop boombox ghetto blaster',
    'saxophone with jazz notes',
    'skull with headphones DJ',
  ],
  'transportation': [
    'classic muscle car front view',
    'motorcycle chopper side view',
    'racing checkered flag',
    'vintage pickup truck',
    'semi truck big rig',
    'hot rod with flames',
    'helicopter military style',
    'speedboat racing on water',
    'bicycle BMX jump silhouette',
    'airplane propeller vintage',
  ],
  'school': [
    'graduation cap with diploma',
    'school crest shield emblem',
    'open book with knowledge symbols',
    'pencil and ruler crossed',
    'school bus yellow classic',
    'chemistry flask with bubbles',
    'backpack with school supplies',
    'class of 2026 banner',
    'microscope science lab',
    'math equations chalkboard',
  ],
  'greek': [
    'Greek column ionic pillar',
    'omega symbol ornate',
    'toga laurel wreath crown',
    'Greek letters fraternity style',
    'Spartan shield lambda',
    'amphora Greek vase',
    'Greek key pattern border frame',
    'olive branch peace symbol',
    'Greek torch eternal flame',
    'Pegasus winged horse',
  ],
  'charity': [
    'awareness ribbon pink breast cancer',
    'helping hands reaching together',
    'heart with hands holding',
    'puzzle piece autism awareness',
    'running for a cause silhouette',
    'dove peace charity',
    'world globe with care hands',
    'blood drop donation symbol',
    'rainbow hope after storm',
    'candle memorial vigil',
  ],
  'people': [
    'family holding hands silhouette',
    'strong woman flexing empowerment',
    'father and daughter silhouette',
    'group of friends diverse',
    'baby footprints tiny feet',
    'couple dancing silhouette',
    'yoga meditation pose peaceful',
    'runner marathon athlete',
    'grandma and grandpa elderly love',
    'superhero kid cape flying',
  ],
  'religion': [
    'Christian cross with rays of light',
    'praying hands detailed',
    'angel wings spread wide',
    'crown of thorns',
    'dove with olive branch peace',
    'rosary beads with cross',
    'Bible open with light',
    'church steeple silhouette',
    'faith hope love with cross',
    'Jesus fish ichthys symbol',
  ],
  'food': [
    'pizza slice with melted cheese',
    'barbecue grill with flames',
    'coffee cup steaming latte art',
    'taco with all the fixings',
    'beer mug overflowing foam',
    'donut with sprinkles',
    'hot dog with mustard',
    'ice cream cone triple scoop',
    'sushi roll chopsticks',
    'wine bottle with grapes',
  ],
  'holidays': [
    'Christmas tree with ornaments',
    'jack o lantern pumpkin halloween',
    'heart with arrow valentines',
    'fireworks fourth of july',
    'turkey thanksgiving dinner',
    'Easter egg decorated colorful',
    'shamrock four leaf clover',
    'snowflake intricate winter',
    'menorah hanukkah candles',
    'New Year clock midnight',
  ],
  'emojis': [
    'laughing crying face emoji',
    'fire flame emoji',
    'hundred points 100 emoji',
    'skull emoji cool design',
    'heart eyes love emoji',
    'flexing muscle arm emoji',
    'crown king emoji',
    'lightning bolt energy emoji',
    'peace sign hand emoji',
    'thumbs up emoji',
  ],
  'shapes': [
    'geometric diamond crystal',
    'infinity symbol ornate',
    'yin yang balance symbol',
    'arrow compass all directions',
    'spiral mandala pattern',
    'hexagon geometric modern',
    'celtic knot intertwined',
    'starburst explosion rays',
    'tribal pattern abstract',
    'DNA helix double strand',
  ],
  'letters': [
    'letter A ornate decorative',
    'letter B bold graffiti style',
    'letter C elegant script',
    'number 1 champion trophy',
    'ampersand symbol artistic',
    'hashtag modern design',
    'exclamation mark bold impact',
    'question mark mystery design',
    'at symbol digital modern',
    'number 23 jersey athletic',
  ],
  'popular': [
    'crown with jewels royal',
    'diamond sparkling gem',
    'skull with roses',
    'wings angel spread',
    'flame fire burning',
    'star shooting comet',
    'heart anatomical realistic',
    'anchor nautical rope',
    'compass rose navigation',
    'sword crossed medieval',
  ],
  'colleges': [
    'university shield crest',
    'college pennant banner flag',
    'academic scroll diploma',
    'university tower clock',
    'college dorm building',
    'student study desk books',
    'fraternity sorority house',
    'campus quad with trees',
    'college athletics stadium',
    'dean list honor roll certificate',
  ],
};

// Map art panel category names to our generation categories
const CATEGORY_MAP = {
  'Most Popular': 'popular',
  'Emojis': 'emojis',
  'Shapes & Symbols': 'shapes',
  'Sports & Games': 'sports',
  'Letters & Numbers': 'letters',
  'Animals': 'animals',
  'Mascots': 'mascots',
  'Nature': 'nature',
  'America': 'america',
  'Parties & Events': 'parties',
  'Military': 'military',
  'Occupations': 'occupations',
  'Colleges': 'colleges',
  'Music': 'music',
  'Transportation': 'transportation',
  'Greek Life': 'greek',
  'School': 'school',
  'Charity': 'charity',
  'People': 'people',
  'Religion': 'religion',
  'Food & Drink': 'food',
  'Seasons & Holidays': 'holidays',
};

async function generateAndSave(prompt, categoryName, index) {
  const tag = `[${categoryName} ${index + 1}/10]`;
  const expectedName = prompt.charAt(0).toUpperCase() + prompt.slice(1);

  // Skip if this (category, name) pair already exists — makes re-runs safe & free
  const existing = await pool.query(
    'SELECT 1 FROM admin_designs WHERE category = $1 AND name = $2 LIMIT 1',
    [categoryName, expectedName]
  );
  if (existing.rowCount > 0) {
    console.log(`${tag} SKIP (already exists): "${prompt}"`);
    return 'skipped';
  }

  try {
    console.log(`${tag} Generating: "${prompt}"...`);

    // Use Flux Schnell — cheapest at $0.003/image
    const fullPrompt = `A single clean graphic illustration of: ${prompt}. Isolated on pure white background, no shadows, vibrant colors, bold clean design, perfect for t-shirt printing. High contrast, centered composition. Only the graphic, nothing else.`;

    const output = await replicate.run(
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt: fullPrompt,
          aspect_ratio: '1:1',
          output_format: 'png',
          num_outputs: 1,
        },
      }
    );

    const imageUrl = Array.isArray(output) ? output[0] : output;
    if (!imageUrl) throw new Error('No output from Flux');

    console.log(`${tag} Generated, uploading to Spaces...`);

    // Fetch the image
    const imgRes = await fetch(imageUrl.toString());
    if (!imgRes.ok) throw new Error('Failed to fetch generated image');
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // Upload to DO Spaces
    const filename = `art-library/${categoryName}/${randomUUID()}.png`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: filename,
      Body: imgBuffer,
      ContentType: 'image/png',
      ACL: 'public-read',
    }));

    const publicUrl = `${CDN_BASE}/${filename}`;

    // Save to admin_designs table
    const name = prompt.charAt(0).toUpperCase() + prompt.slice(1);
    await pool.query(
      `INSERT INTO admin_designs (name, image_url, category, tags, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [name, publicUrl, categoryName, [categoryName, 'art-library', 'ai-generated']]
    );

    console.log(`${tag} Saved: ${publicUrl}`);
    return true;
  } catch (err) {
    console.error(`${tag} FAILED: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  T-SHIRT BROTHERS — Art Library Generator                   ║');
  console.log('║  Generating 10 AI graphics per category using Flux Schnell  ║');
  console.log('║  Cost: ~$0.003/image × 220 = ~$0.66 total                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Optional CLI arg: node generate-art-library.js <categoryKey>
  const onlyCategory = process.argv[2];

  let total = 0;
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const [displayName, categoryKey] of Object.entries(CATEGORY_MAP)) {
    if (onlyCategory && categoryKey !== onlyCategory) continue;

    const prompts = CATEGORY_PROMPTS[categoryKey];
    if (!prompts) {
      console.log(`\n⚠ No prompts for "${displayName}" (${categoryKey}), skipping`);
      continue;
    }

    console.log(`\n━━━ ${displayName} (${categoryKey}) ━━━`);

    for (let i = 0; i < prompts.length; i++) {
      total++;
      const result = await generateAndSave(prompts[i], categoryKey, i);
      if (result === true) success++;
      else if (result === 'skipped') skipped++;
      else failed++;

      // Only delay between API calls, not skips
      if (result !== 'skipped') {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  DONE! Total: ${total} | New: ${success} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`║  Estimated cost: ~$${(success * 0.003).toFixed(2)}                              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
