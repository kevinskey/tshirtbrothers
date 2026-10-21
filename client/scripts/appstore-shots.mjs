// App Store screenshot generator: renders the live site (same UI the iOS
// app bundles) at Apple's required screenshot dimensions. The app targets
// iPhone and iPad (TARGETED_DEVICE_FAMILY = "1,2"), so App Store Connect
// needs both sets:
//   iphone — 6.9" iPhone, 1320x2868 (440x956 @3x)
//   ipad   — 13" iPad,    2064x2752 (1032x1376 @2x)
// Usage: node scripts/appstore-shots.mjs [outDir] [iphone|ipad|all]
// Shots land in <outDir>/<device>/. Default device: all.
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const OUT = process.argv[2] || '/tmp/appstore-shots';
const WHICH = process.argv[3] || 'all';
const ORIGIN = 'https://tshirtbrothers.com';
const SHOTS = [
  { path: '/', name: '1-home', settle: 4000 },
  { path: '/shop', name: '2-shop', settle: 4000 },
  { path: '/quote', name: '3-ez-quote', settle: 3000 },
  { path: '/design', name: '4-design-studio', settle: 5000 },
  { path: '/embroidery', name: '5-embroidery', settle: 3000 },
];
const DEVICES = {
  iphone: {
    viewport: { width: 440, height: 956, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  },
  ipad: {
    viewport: { width: 1032, height: 1376, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    ua: 'Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  },
};

const targets = WHICH === 'all' ? Object.keys(DEVICES) : [WHICH];
for (const t of targets) {
  if (!DEVICES[t]) throw new Error(`unknown device "${t}" (use iphone, ipad or all)`);
}

const browser = await puppeteer.launch({ headless: 'new' });
for (const t of targets) {
  const { viewport, ua } = DEVICES[t];
  const dir = `${OUT}/${t}`;
  await mkdir(dir, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.setUserAgent(ua);

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
    await page.screenshot({ path: `${dir}/${s.name}.png` });
    console.log('shot', t, s.name);
  }
  await page.close();
}
await browser.close();
console.log('done →', OUT);
