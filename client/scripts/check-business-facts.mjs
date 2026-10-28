// Guard against advertised business facts drifting away from what the
// system actually charges.
//
// Origin: the 2026-10-23 AEO/SEO audit found the homepage DTF promo and
// /quote/classic advertising 22" gang sheets "from $9/ft" while the live
// pricing API had been charging $11.99/ft. $9 was the original migration
// default (900 cents); someone set the real rate in admin and the
// marketing copy was never updated. Nothing failed, no test broke, and
// the wrong number sat on the homepage indefinitely.
//
// This script diffs client/src/data/businessFacts.ts against production
// and exits non-zero on a mismatch.
//
//   node scripts/check-business-facts.mjs            # check production
//   API_ORIGIN=http://localhost:3001 node scripts/…  # check local API
//
// Deliberately NOT wired into `npm run build`: a deploy should not fail
// because Doc changed a rate in admin ten seconds earlier, and the build
// must stay runnable offline. Run it from CI on a schedule, or by hand
// after changing pricing.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API_ORIGIN = process.env.API_ORIGIN || 'https://tshirtbrothers.com';
const factsPath = fileURLToPath(new URL('../src/data/businessFacts.ts', import.meta.url));

// Pull the numbers out of the TS source by regex rather than importing
// it — this is a plain .mjs script with no TS toolchain available.
function readFact(src, key) {
  const m = src.match(new RegExp(`${key}:\\s*([0-9.]+)`));
  return m ? Number(m[1]) : null;
}

const src = readFileSync(factsPath, 'utf8');

const problems = [];
const checks = [];

function compare(label, advertised, actual, format = (v) => v) {
  checks.push({ label, advertised, actual });
  if (advertised === null) {
    problems.push(`${label}: could not parse an advertised value out of businessFacts.ts`);
  } else if (Math.abs(advertised - actual) > 0.001) {
    problems.push(
      `${label}: businessFacts.ts advertises ${format(advertised)} but the API charges ${format(actual)}`,
    );
  }
}

const money = (v) => `$${Number(v).toFixed(2)}`;

let res;
try {
  res = await fetch(`${API_ORIGIN}/api/gangsheet-store/config`);
} catch (err) {
  console.error(`[check-business-facts] could not reach ${API_ORIGIN}: ${err.message}`);
  process.exit(2);
}
if (!res.ok) {
  console.error(`[check-business-facts] ${API_ORIGIN} returned HTTP ${res.status}`);
  process.exit(2);
}
const cfg = await res.json();

compare('DTF standard rate/ft', readFact(src, 'standardRatePerFoot'), cfg.rates.standard / 100, money);
compare('DTF rush rate/ft',     readFact(src, 'rushRatePerFoot'),     cfg.rates.rush / 100, money);
compare('DTF hot rush rate/ft', readFact(src, 'hotRushRatePerFoot'),  cfg.rates.hot_rush / 100, money);
compare('DTF flat shipping',    readFact(src, 'flatShipping'),        cfg.shipping_flat_cents / 100, money);
compare('DTF min feet',         readFact(src, 'minFeet'),             cfg.min_ft);
compare('DTF max feet',         readFact(src, 'maxFeet'),             cfg.max_ft);

// Turnaround promises are free text in admin; compare them verbatim so a
// reworded promise surfaces here instead of silently contradicting the
// copy on /dtf and the rush page.
for (const [key, apiKey] of [['standard', 'standard'], ['rush', 'rush'], ['hotRush', 'hot_rush']]) {
  const m = src.match(new RegExp(`${key}:\\s*'([^']+)'`));
  const advertised = m ? m[1] : null;
  const actual = cfg.promises?.[apiKey];
  if (advertised && actual && advertised !== actual) {
    problems.push(`DTF ${key} turnaround: copy says "${advertised}" but admin says "${actual}"`);
  }
}

for (const c of checks) {
  const flag = Math.abs((c.advertised ?? NaN) - c.actual) > 0.001 ? 'DRIFT' : 'ok   ';
  console.log(`[check-business-facts] ${flag} ${c.label}: advertised=${c.advertised} actual=${c.actual}`);
}

if (problems.length) {
  console.error(`\n[check-business-facts] ${problems.length} mismatch(es) against ${API_ORIGIN}:`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nFix businessFacts.ts (and any copy that hard-codes these numbers),');
  console.error('or correct the rate in the admin DTF settings.');
  process.exit(1);
}

console.log(`\n[check-business-facts] all advertised facts match ${API_ORIGIN}.`);
