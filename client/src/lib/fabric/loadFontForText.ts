/**
 * Fetch + decode + parse a Google Font binary for use with opentype.js.
 *
 * Steps:
 *   1. Look up the IndexedDB cache (key: family + weight + codepoint hash).
 *      If hit, parse the cached ArrayBuffer with opentype.parse and return.
 *   2. On miss: fetch the Google Fonts CSS API with `&text=` so the
 *      response is tightly subsetted. Extract the woff2 URL, fetch the
 *      binary, decompress to TTF via wawoff2, parse with opentype.parse,
 *      cache the TTF bytes, return the Font.
 *   3. In-process Font cache (parsedCache) keeps repeated calls within a
 *      session O(1) — opentype.parse is non-trivial.
 *
 * Why this gymnastics:
 *   opentype.js handles .ttf/.otf/.woff but NOT .woff2. Modern browsers
 *   only get woff2 from Google Fonts. wawoff2 is a tiny WASM-backed
 *   decompressor — runs once per (family, weight, glyph subset).
 */

import * as opentype from 'opentype.js';
import wawoff2 from 'wawoff2';
import { fontCacheKey, getCachedFont, putCachedFont } from './fontPathCache';

const parsedCache = new Map<string, opentype.Font>();

/**
 * Resolve an opentype.Font that can render every codepoint in `text`.
 * Returns null on failure (network error, unsupported font, etc.) — callers
 * should fall back to leaving the text element as-is rather than failing
 * the whole export.
 */
export async function loadFontForText(
  family: string,
  weight: number,
  text: string,
): Promise<opentype.Font | null> {
  const key = fontCacheKey(family, weight, text);
  const cached = parsedCache.get(key);
  if (cached) return cached;

  try {
    const cachedBuf = await getCachedFont(key);
    if (cachedBuf) {
      const font = opentype.parse(cachedBuf);
      parsedCache.set(key, font);
      return font;
    }

    const ttfBuf = await fetchAndDecodeFont(family, weight, text);
    if (!ttfBuf) return null;
    await putCachedFont(key, ttfBuf);
    const font = opentype.parse(ttfBuf);
    parsedCache.set(key, font);
    return font;
  } catch (err) {
    console.warn('[loadFontForText] failed for', family, weight, err);
    return null;
  }
}

async function fetchAndDecodeFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer | null> {
  // Google Fonts CSS API. text= forces a tightly-subsetted response with
  // exactly the codepoints we asked for, all in one woff2 file. Without
  // text=, we'd get the full unicode-range split and have to pick the
  // right subset URL ourselves.
  const familyParam = family.replace(/ /g, '+');
  const cssUrl = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const cssRes = await fetch(cssUrl);
  if (!cssRes.ok) return null;
  const css = await cssRes.text();

  // Pull out the first url(...) inside the @font-face. It will always be
  // a woff2 URL when fetched from a browser User-Agent.
  const match = css.match(/url\(([^)]+)\)/);
  if (!match || !match[1]) return null;
  const fontUrl = match[1].replace(/^['"]|['"]$/g, '');
  const fontRes = await fetch(fontUrl);
  if (!fontRes.ok) return null;
  const woff2 = new Uint8Array(await fontRes.arrayBuffer());

  const ttfBytes = await wawoff2.decompress(woff2);
  // wawoff2 returns a Uint8Array (over a copy of the WASM heap); we need a
  // standalone ArrayBuffer for IndexedDB and opentype.parse.
  const out = new Uint8Array(ttfBytes.length);
  out.set(ttfBytes);
  return out.buffer;
}
