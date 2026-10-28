#!/usr/bin/env node
// Ping IndexNow (the Bing/Copilot index) with every URL in the live sitemap,
// so content changes reach Bing within hours instead of whenever Bingbot
// recrawls. Runs at the end of deploy.sh; a failure must never fail a deploy.
//
// The key is public by design — proof of ownership is that the same value is
// served at https://tshirtbrothers.com/<key>.txt (client/public/<key>.txt).
//
// Usage: node client/scripts/indexnow-ping.mjs [--dry-run]

const HOST = 'tshirtbrothers.com';
const KEY = 'c528a2a6fd8092078f3fe69384e8865e';
const SITEMAP = `https://${HOST}/sitemap.xml`;
const dryRun = process.argv.includes('--dry-run');

// The deploy script runs this right after the pm2 restart, so the API that
// serves the sitemap may still be coming up (nginx answers 502 meanwhile).
async function fetchSitemap() {
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(SITEMAP);
      if (!res.ok) throw new Error(`sitemap fetch: HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      console.warn(`[indexnow] attempt ${attempt}/6: ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw lastErr;
}

try {
  const xml = await fetchSitemap();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => new URL(u).hostname.replace(/^www\./, '') === HOST);
  if (urls.length === 0) throw new Error('no URLs parsed from sitemap');

  if (dryRun) {
    console.log(`[indexnow] dry run: would submit ${urls.length} URLs, e.g.`);
    console.log(urls.slice(0, 3).map((u) => `  ${u}`).join('\n'));
    process.exit(0);
  }

  const ping = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList: urls.slice(0, 10000),
    }),
  });
  // 200 = accepted, 202 = accepted/key validation pending. Anything else is
  // worth seeing in the deploy log but still non-fatal.
  console.log(`[indexnow] submitted ${urls.length} URLs — HTTP ${ping.status}`);
} catch (err) {
  console.warn(`[indexnow] ping failed (non-fatal): ${err.message}`);
}
