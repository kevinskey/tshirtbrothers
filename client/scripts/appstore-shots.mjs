// App Store screenshot generator: renders the live site (same UI the iOS
// app bundles) at exact 6.9" iPhone dimensions (1320x2868 = 440x956 @3x).
// Usage: node scripts/appstore-shots.mjs [outDir]
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const OUT = process.argv[2] || '/tmp/appstore-shots';
const ORIGIN = 'https://tshirtbrothers.com';
const SHOTS = [
  { path: '/', name: '1-home', settle: 4000 },
  { path: '/shop', name: '2-shop', settle: 4000 },
  { path: '/quote', name: '3-ez-quote', settle: 3000 },
  { path: '/design', name: '4-design-studio', settle: 5000 },
  { path: '/embroidery', name: '5-embroidery', settle: 3000 },
];

await mkdir(OUT, { recursive: true });
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148');

for (const s of SHOTS) {
  await page.goto(ORIGIN + s.path, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, s.settle));
  // Dismiss the sales popup if it appeared (covers the hero).
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const no = btns.find((b) => /no thanks|close/i.test(b.textContent || '') || b.getAttribute('aria-label') === 'Close');
    no?.click();
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `${OUT}/${s.name}.png` });
  console.log('shot', s.name);
}
await browser.close();
console.log('done →', OUT);
