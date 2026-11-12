// Parse a digitizer's "production worksheet" PDF into a billing-ready spec.
//
// Why this exists (Kevin, 2026-11-12): every digitized design comes back with
// a worksheet PDF that already states the stitch count, colour count, finished
// size and thread consumption. Until now an admin read those numbers off the
// screen and retyped the stitch count into the quote form — and the stitch
// count IS the price (see embroideryPricing.js, where the Lighthouse tiers key
// off it). Retyping the one number that sets the price is the expensive kind
// of manual step, so the PDF is parsed on upload.
//
// NO NEW DEPENDENCY ON PURPOSE. Node's zlib is enough: these worksheets are
// vector PDFs whose text lives in FlateDecode'd content streams as plain
// WinAnsi strings. Pulling in pdfjs-dist (~10 MB) to read four numbers would
// be paid for on every droplet deploy. The trade-off is that a worksheet from
// software we have not seen may extract nothing — so EVERY field is optional
// and the caller must degrade to the admin typing it. parse() never throws.
//
// Two real layouts are supported, both Wilcom, and they disagree about
// everything except being Wilcom:
//
//   A. "Production Worksheet" (EmbroideryStudio Designing). Each label is
//      immediately followed by its value:
//        Machine format: Tajima   Color changes: 3   Stops: 4
//      Carries Total thread/bobbin and a per-stop "Color Film" page.
//
//   B. "ES-65 Designer". Labels are emitted as a GROUP, then the values as a
//      group, because the print template lays them out in two columns:
//        Stitches:  Colors:  Color changes:  Stops:
//        22871      8        34              35
//      Also renames fields (Machine: not Machine format:, H:/W: not
//      Height:/Width:, Max Stitch: not Max stitch:) and drops thread totals.
//
// Variant B is why this is not a pile of /label:\s*(\S+)/ regexes. The reader
// below walks labels in document order and keeps a QUEUE of labels that have
// not yet been given a value; a run of values is dealt out to that queue in
// order. Layout A is just the case where the queue never holds more than one.

import zlib from 'zlib';

// ---------------------------------------------------------------------------
// PDF text extraction
// ---------------------------------------------------------------------------

// Un-escape a PDF literal string: \( \) \\ \n \r \t, \ddd octal, and the
// line-continuation backslash-newline.
function decodePdfString(raw) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c !== '\\') { out += c; continue; }
    const n = raw[++i];
    if (n === undefined) break;
    if (n === 'n') out += '\n';
    else if (n === 'r') out += '\r';
    else if (n === 't') out += '\t';
    else if (n === 'b') out += '\b';
    else if (n === 'f') out += '\f';
    else if (n === '\n') { /* continuation */ }
    else if (n === '\r') { if (raw[i + 1] === '\n') i++; }
    else if (n >= '0' && n <= '7') {
      let oct = n;
      while (oct.length < 3 && raw[i + 1] >= '0' && raw[i + 1] <= '7') oct += raw[++i];
      out += String.fromCharCode(parseInt(oct, 8));
    } else out += n;
  }
  return out;
}

// Walk every `stream ... endstream` in the file, decoding Flate where the
// dictionary says so and taking the bytes verbatim where it does not — the
// /ToUnicode CMaps we need for CID text are routinely stored UNFILTERED, so
// skipping unfiltered streams loses exactly the data that decodes variant B.
function allStreams(buffer) {
  const lat = buffer.toString('latin1');
  const out = [];
  let idx = 0;
  while ((idx = lat.indexOf('stream', idx)) !== -1) {
    // The stream's dictionary is the `<< ... >>` immediately before it.
    const dictStart = Math.max(0, lat.lastIndexOf('<<', idx));
    const dict = lat.slice(dictStart, idx);
    // Which indirect object owns this stream. Attributed by BYTE OFFSET, not
    // by content: /ToUnicode CMaps all open with the same boilerplate, so
    // searching for their text finds the first one every time.
    const headM = /(\d+)\s+\d+\s+obj[^]*$/.exec(lat.slice(Math.max(0, dictStart - 200), dictStart));
    const objId = headM ? parseInt(headM[1], 10) : null;
    let s = idx + 'stream'.length;
    if (lat[s] === '\r') s++;
    if (lat[s] === '\n') s++;
    const e = lat.indexOf('endstream', s);
    if (e === -1) break;
    idx = e + 'endstream'.length;
    const raw = buffer.subarray(s, e);
    if (/\/Filter\s*\/FlateDecode/.test(dict)) {
      try { out.push({ dict, objId, text: zlib.inflateSync(raw).toString('latin1') }); } catch { /* image or damaged */ }
    } else if (!/\/Filter/.test(dict)) {
      out.push({ dict, objId, text: raw.toString('latin1') });
    }
    // Any other filter (DCT, LZW, …) is an image to us — skipped.
  }
  return out;
}

// Content streams are the ones that show text. Image XObjects inflate to
// binary garbage and are dropped by requiring BT plus a showing operator.
function contentStreams(streams) {
  return streams
    .filter(({ text }) => /\bBT\b/.test(text) && /(Tj|TJ)\b/.test(text))
    .map(({ text }) => text);
}

// ---------------------------------------------------------------------------
// CID text: /ToUnicode CMaps
// ---------------------------------------------------------------------------
//
// Variant B embeds subset TrueType fonts and shows text as glyph ids in hex
// strings — `[<0036><0057><004C>] TJ` is "Sti", unreadable without the font's
// /ToUnicode CMap. Those CMaps are in the file as PostScript fragments:
//
//   61 beginbfchar <0003> <0020> <0006> <0023> ... endbfchar
//   beginbfrange <0024> <002D> <0041> endbfrange
//
// so each is parsed into a code -> string map. Mapping is done PER FONT (the
// `/F1 11.4 Tf` operator selects which) because two subsets of two different
// typefaces will happily assign different characters to the same glyph id.

function parseCMap(text) {
  const map = new Map();
  const hex = (h) => h.replace(/\s+/g, '');
  const toStr = (h) => {
    // Destination is UTF-16BE, possibly a multi-char ligature expansion.
    const clean = hex(h);
    let s = '';
    for (let i = 0; i + 3 < clean.length + 1; i += 4) {
      const cp = parseInt(clean.slice(i, i + 4), 16);
      if (Number.isFinite(cp) && cp > 0) s += String.fromCharCode(cp);
    }
    return s;
  };

  for (const block of text.match(/beginbfchar[\s\S]*?endbfchar/g) || []) {
    const pairs = block.match(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g) || [];
    for (const pair of pairs) {
      const m = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/.exec(pair);
      if (m) map.set(parseInt(hex(m[1]), 16), toStr(m[2]));
    }
  }
  for (const block of text.match(/beginbfrange[\s\S]*?endbfrange/g) || []) {
    // `<lo> <hi> <dstStart>` — dst increments across the range.
    const triples = block.match(/<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/g) || [];
    for (const triple of triples) {
      const m = /<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>\s*<([0-9A-Fa-f\s]+)>/.exec(triple);
      if (!m) continue;
      const lo = parseInt(hex(m[1]), 16);
      const hi = parseInt(hex(m[2]), 16);
      const dst = parseInt(hex(m[3]), 16);
      if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo || hi - lo > 65535) continue;
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCharCode(dst + (c - lo)));
    }
  }
  return map;
}

// Resolve `/F1` -> CMap by reading the /Resources /Font dictionaries and
// following each font's /ToUnicode reference to the CMap stream.
//
// Objects are located by a plain scan for `N 0 obj`; that is enough here
// because we only ever follow /ToUnicode refs, never the full object graph.
// Two pages mapping the SAME resource name to DIFFERENT fonts would collide,
// so a collision falls back to a merged map and is reported.
function buildFontMaps(buffer, streams) {
  const lat = buffer.toString('latin1');

  // Every /ToUnicode CMap in the file, keyed by the object id holding it.
  const cmapsByObj = new Map();
  let unattributed = 0;
  for (const { text, objId } of streams) {
    if (!/beginbfchar|beginbfrange/.test(text)) continue;
    const map = parseCMap(text);
    if (map.size === 0) continue;
    cmapsByObj.set(objId ?? --unattributed, map);
  }

  const byName = new Map();
  const collisions = new Set();

  // /Font << /F1 12 0 R /F2 15 0 R >> inside any /Resources dictionary.
  for (const fontDict of lat.match(/\/Font\s*<<[\s\S]{0,4000}?>>/g) || []) {
    for (const m of fontDict.matchAll(/\/([A-Za-z0-9#+.\-]+)\s+(\d+)\s+\d+\s+R/g)) {
      const name = `/${m[1]}`;
      const fontObjId = parseInt(m[2], 10);
      // Read that font object and follow its /ToUnicode.
      const objRe = new RegExp(`(?:^|[^0-9])${fontObjId}\\s+0\\s+obj([\\s\\S]{0,3000}?)endobj`);
      const objM = objRe.exec(lat);
      if (!objM) continue;
      const tu = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(objM[1]);
      if (!tu) continue;
      const map = cmapsByObj.get(parseInt(tu[1], 10));
      if (!map) continue;
      const existing = byName.get(name);
      if (existing && existing !== map) collisions.add(name);
      else byName.set(name, map);
    }
  }

  // Merged fallback: used for font names we could not resolve, and whenever a
  // name resolved inconsistently.
  const merged = new Map();
  for (const map of cmapsByObj.values()) for (const [k, v] of map) if (!merged.has(k)) merged.set(k, v);
  for (const name of collisions) byName.set(name, merged);

  return { byName, merged, hasCMaps: cmapsByObj.size > 0 };
}

/**
 * Extract text from a vector PDF, one logical run per line.
 *
 * Text-positioning operators (Td/TD/Tm/T*) and ET end a line. That matters:
 * raw concatenation turns variant B's "Machine: Trims:" + "Tajima" + "60"
 * into the unsplittable "Tajima60", whereas newlines at the position changes
 * keep the values as separate tokens we can deal out to the label queue.
 *
 * @returns {string} extracted text, '' when the PDF carries no readable text
 *   (scanned/raster worksheets and CID-encoded fonts both land here).
 */
export function extractPdfText(buffer) {
  const streams = allStreams(buffer);
  const { byName, merged, hasCMaps } = buildFontMaps(buffer, streams);

  const lines = [];
  for (const stream of contentStreams(streams)) {
    let cur = '';
    let cmap = null;                           // CMap of the font in force
    const flush = () => { if (cur.trim()) lines.push(cur.trim()); cur = ''; };
    // Walk the operand/operator soup. We care about strings, the font
    // selection that tells us how to decode them, and the operators that
    // move the text cursor (each of which starts a new logical line).
    // The font-size operand is a real number ("/F1 11.435600 Tf"), so the
    // lookahead must admit decimals, signs and exponents — not just digits.
    const re = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]*>|\/[A-Za-z0-9#+.\-]+(?=[\s\d.+\-eE]+Tf\b)|\b(?:Td|TD|Tm|T\*|ET|BT|TJ|Tj)\b/g;
    let m;
    while ((m = re.exec(stream)) !== null) {
      const tok = m[0];
      if (tok[0] === '(') {
        cur += decodePdfString(tok.slice(1, -1));
      } else if (tok[0] === '/') {
        cmap = byName.get(tok) || (hasCMaps ? merged : null);
      } else if (tok[0] === '<') {
        // Hex string. With a CMap these are 2-byte glyph ids; without one the
        // bytes are usually the characters themselves (plain hex encoding).
        const h = tok.slice(1, -1).replace(/\s+/g, '');
        if (cmap) {
          for (let i = 0; i + 4 <= h.length; i += 4) {
            const code = parseInt(h.slice(i, i + 4), 16);
            const ch = cmap.get(code);
            if (ch !== undefined) cur += ch;
          }
        } else {
          for (let i = 0; i + 2 <= h.length; i += 2) {
            const b = parseInt(h.slice(i, i + 2), 16);
            if (b >= 32 && b < 255) cur += String.fromCharCode(b);
          }
        }
      } else if (tok === 'TJ' || tok === 'Tj' || tok === 'BT') {
        /* showing/begin — keep accumulating the current line */
      } else {
        flush();                               // Td/TD/Tm/T*/ET = new line
      }
    }
    flush();
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Field schema
// ---------------------------------------------------------------------------

// type drives how a value token is recognised when dealing out a value run:
//   int     — 5,774 / 22871          → Number
//   measure — 37.7 mm / 2.38 in      → { value, unit }, plus a unit-suffixed field
//   text    — Tajima / Madeira       → trimmed string
//
// `aliases` are matched longest-first so "Max stitch:" cannot be eaten by a
// shorter label, and so variant B's spellings resolve to the same key.
const FIELDS = [
  { key: 'stitch_count',   type: 'int',     aliases: ['Stitches:'] },
  { key: 'colors',         type: 'int',     aliases: ['Colors:'] },
  { key: 'color_changes',  type: 'int',     aliases: ['Color changes:'] },
  { key: 'stops',          type: 'int',     aliases: ['Stops:'] },
  { key: 'trims',          type: 'int',     aliases: ['Trims:'] },
  { key: 'appliques',      type: 'int',     aliases: ['Appliqués:', 'Appliques:'] },
  { key: 'machine_format', type: 'text',    aliases: ['Machine format:', 'Machine:'] },
  { key: 'height',         type: 'measure', aliases: ['Height:', 'H:'] },
  { key: 'width',          type: 'measure', aliases: ['Width:', 'W:'] },
  { key: 'area',           type: 'measure', aliases: ['Area:', 'Area'] },
  { key: 'extent_left',    type: 'measure', aliases: ['Left:'] },
  { key: 'extent_right',   type: 'measure', aliases: ['Right:'] },
  { key: 'extent_up',      type: 'measure', aliases: ['Up:'] },
  { key: 'extent_down',    type: 'measure', aliases: ['Down:'] },
  { key: 'end_x',          type: 'measure', aliases: ['EndX:'] },
  { key: 'end_y',          type: 'measure', aliases: ['EndY:'] },
  { key: 'max_stitch',     type: 'measure', aliases: ['Max stitch:', 'Max Stitch:'] },
  { key: 'min_stitch',     type: 'measure', aliases: ['Min stitch:', 'Min Stitch:'] },
  { key: 'max_jump',       type: 'measure', aliases: ['Max jump:', 'Max Jump:'] },
  { key: 'thread_total',   type: 'measure', aliases: ['Total thread:'] },
  { key: 'bobbin_total',   type: 'measure', aliases: ['Total bobbin:'] },
  { key: 'colorway',       type: 'text',    aliases: ['Colorway:'] },
  { key: 'design_name',    type: 'text',    aliases: ['Design:'] },
  { key: 'title',          type: 'text',    aliases: ['Title:'] },
];

// DELIBERATELY NOT PARSED: Author / Fabric / Zoom / "Last Saved" / "Date
// printed". In the ES-65 template Author and Fabric are usually printed
// EMPTY, and because that template groups labels before values there is no
// signal in the token stream distinguishing "this label has no value" from
// "this label's value comes later in the run" — an empty Author: happily
// swallows the first atom of the save date, and every field after it shifts
// by one. None of these are billing or production data (we do not bill the
// digitizer's save date), so reading them wrong is all cost and no benefit.
// If you need them, add a per-template field ORDER, do not just add aliases.
const SKIPPED_LABELS = [
  'Authors:', 'Author:', 'Fabric:', 'Zoom:', 'Z:',
  'Design last saved :', 'Design last saved:', 'Last Saved:',
  'Date printed:', 'Printed:',
];

const ALIASES = FIELDS
  .flatMap((f) => f.aliases.map((a) => ({ alias: a, field: f })))
  .sort((a, b) => b.alias.length - a.alias.length);

// Labels that are table headers or boilerplate, not fields. They must still be
// recognised as "a label" so they terminate the preceding value and never get
// dealt a value of their own.
const NOISE_LABELS = [
  'Stop Sequence:', 'Production Worksheet', 'Color Film', 'More...',
  'Brand:', 'Element:', 'Code:', 'Name:', 'Chart:', 'Thread used:', 'Stop #:',
  'Page ', 'Descr', 'St.', 'Wilcom',
  // Recognised so they terminate the value before them and are dealt no
  // value of their own — see SKIPPED_LABELS above for why.
  ...SKIPPED_LABELS,
];

const INT_RE = /^-?[\d,]+$/;
const MEASURE_RE = /^(-?[\d,]*\.?\d+)\s*(mm|cm|in²|in2|in|ft|yd|m|sq in|"|%)?$/i;

function toInt(tok) {
  if (!INT_RE.test(tok)) return null;
  const n = parseInt(tok.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function toMeasure(tok) {
  const m = MEASURE_RE.exec(tok.trim());
  if (!m) return null;
  const value = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  let unit = (m[2] || '').toLowerCase().replace(/^"$/, 'in').replace(/^(in²|in2|sq in)$/, 'in2');
  return { value, unit: unit || null };
}

// Does this token plausibly satisfy this field's type? Used to deal a value
// run out to a queue of waiting labels — variant B's "Tajima" then "60" for
// [Machine:, Trims:] only resolves correctly with a type check.
function accepts(field, tok) {
  if (field.type === 'int') return toInt(tok) !== null;
  if (field.type === 'measure') return toMeasure(tok) !== null;
  return tok.length > 0;                      // text takes anything non-empty
}

// ---------------------------------------------------------------------------
// Label-queue reader
// ---------------------------------------------------------------------------

// Split the extracted text into an ordered list of { kind:'label'|'value' }
// tokens. A line may hold several ("Machine format:Tajima", or variant B's
// "H: 2.70 in   W: 4.03 in"), so each line is scanned for embedded labels.
function tokenize(text) {
  const tokens = [];
  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    let guard = 0;
    while (line && guard++ < 200) {
      // Find the earliest label occurrence anywhere in the remaining line.
      let best = null;
      for (const { alias, field } of ALIASES) {
        const at = line.indexOf(alias);
        if (at === -1) continue;
        if (!best || at < best.at || (at === best.at && alias.length > best.alias.length)) {
          best = { at, alias, field };
        }
      }
      let noise = null;
      for (const n of NOISE_LABELS) {
        const at = line.indexOf(n);
        if (at === -1) continue;
        if (!noise || at < noise.at) noise = { at, alias: n };
      }
      // Whichever comes first wins; noise wins ties so "Stops:" inside
      // "Stop Sequence:" cannot masquerade as the Stops field.
      if (noise && (!best || noise.at <= best.at)) {
        if (noise.at > 0) pushValues(tokens, line.slice(0, noise.at));
        tokens.push({ kind: 'noise' });
        line = line.slice(noise.at + noise.alias.length).trim();
        continue;
      }
      if (!best) { pushValues(tokens, line); break; }
      if (best.at > 0) pushValues(tokens, line.slice(0, best.at));
      tokens.push({ kind: 'label', field: best.field });
      line = line.slice(best.at + best.alias.length).trim();
    }
  }
  return tokens;
}

// Break a value run into atoms. Numbers (with thousands separators and an
// optional unit) are kept whole; everything else splits on whitespace runs but
// stays glued for multi-word text like "Madeira Classic 40" / "Dark Orange" —
// so a run is emitted BOTH as its whole string and as its atoms, and the
// reader picks whichever the waiting label's type accepts.
function pushValues(tokens, run) {
  const trimmed = run.trim();
  if (!trimmed) return;
  const atoms = trimmed.match(/-?[\d,]*\.?\d+\s*(?:mm|cm|in²|in2|in|ft|yd|%|")?|[^\s\d]+/g) || [trimmed];
  tokens.push({ kind: 'value', whole: trimmed, atoms: atoms.map((a) => a.trim()).filter(Boolean) });
}

function readFields(text) {
  const tokens = tokenize(text);
  const out = {};
  const queue = [];                            // labels still awaiting a value

  const assign = (field, tok) => {
    if (out[field.key] !== undefined) return false;   // first wins (header beats footer repeat)
    if (field.type === 'int') { const v = toInt(tok); if (v === null) return false; out[field.key] = v; return true; }
    if (field.type === 'measure') { const v = toMeasure(tok); if (!v) return false; out[field.key] = v; return true; }
    const s = String(tok).trim();
    if (!s) return false;
    out[field.key] = s;
    return true;
  };

  for (const tok of tokens) {
    if (tok.kind === 'noise') { queue.length = 0; continue; }
    if (tok.kind === 'label') { queue.push(tok.field); continue; }

    // A value run. Deal it out to the queued labels in order.
    if (queue.length === 0) continue;
    if (queue.length === 1) {
      // Layout A: the whole run belongs to this one label. Prefer the whole
      // string for text ("Madeira Classic 40"), the first atom otherwise.
      const field = queue[0];
      const done = field.type === 'text'
        ? assign(field, tok.whole)
        : (assign(field, tok.atoms[0]) || assign(field, tok.whole));
      if (done || out[field.key] !== undefined) queue.shift();
      // Leftover atoms after a typed read can feed the next labels (rare).
      continue;
    }
    // Layout B: several labels waiting, several values arriving.
    let ai = 0;
    while (queue.length > 0 && ai < tok.atoms.length) {
      const field = queue[0];
      if (accepts(field, tok.atoms[ai])) {
        assign(field, tok.atoms[ai]);
        queue.shift();
        ai++;
      } else if (out[field.key] !== undefined) {
        queue.shift();                         // already known; skip it
      } else {
        // Type mismatch: this atom is not for this label. Advance the atom,
        // not the label — a stray glyph must not consume a real field.
        ai++;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Per-stop colour sequence
// ---------------------------------------------------------------------------

// Variant A's "Color Film" page lists each stop as a labelled block:
//   Stop #: 1  Element:  Code: 1002  Name: White
//   Chart: Madeira Classic 40  Stitches: 1,680  Thread used: 20.37ft
// This is the only place the per-colour thread consumption appears, which is
// what the shop needs to know whether a cone will last the run.
// The ES-65 template has no "Design:" label at all — the design name is bare
// text on the banner line, wedged between the zoom factor and the H:/W: pair:
//   "Wilcom ES-65 DesignerZ: 1.40HeroH: 2.70 in   W: 4.03 in"
// Anchored on both sides so it cannot run away into the rest of the banner.
function readBannerDesignName(text) {
  const m = /Z:\s*[\d.]+\s*(.*?)\s*(?=[HW]:\s*[\d.])/.exec(text);
  const name = m ? m[1].trim() : '';
  return name && name.length <= 80 ? name : null;
}

// The ES-65 colour table, a different shape from variant A's "Color Film":
//   #  C   St.  Descr      Code
//   1. 3   1167 Royal Blue 1076
//        Brand: Madeira Classic 40
// i.e. stop number, needle, stitches, colour name, thread code. The template
// prints "More..." and stops after ~16 rows, so this list is routinely
// INCOMPLETE — hence the truncated flag, so no caller mistakes a partial
// colour list for the whole design.
function readNeedleTable(text) {
  const stops = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // "1.3" (stop 1, needle 3) — the template glues them together.
    const head = /^(\d{1,2})\.\s*(\d{1,2})$/.exec(lines[i].trim());
    if (!head) continue;
    // Next line: "1167Royal Blue" or "1074Black 1000" (stitches, name, code).
    const body = lines[i + 1]?.trim() || '';
    const bm = /^([\d,]+)\s*([A-Za-z][A-Za-z\s]*?)\s*(\d{3,5})?$/.exec(body);
    if (!bm) continue;
    // Code may wrap to its own line when the colour name is long.
    const codeLine = bm[3] ? null : /^(\d{3,5})$/.exec(lines[i + 2]?.trim() || '');
    stops.push({
      index: parseInt(head[1], 10),
      needle: parseInt(head[2], 10),
      stitches: parseInt(bm[1].replace(/,/g, ''), 10),
      name: bm[2].trim() || null,
      code: bm[3] || (codeLine ? codeLine[1] : null),
      chart: null,
      thread_ft: null,
    });
  }
  return stops;
}

function readStops(text) {
  const stops = [];
  const blocks = text.split(/Stop #:/).slice(1);
  for (const block of blocks) {
    const grab = (label, re) => {
      const m = new RegExp(`${label}\\s*${re}`, 'i').exec(block);
      return m ? m[1].trim() : null;
    };
    const indexM = /^\s*(\d+)/.exec(block);
    const stitchesRaw = grab('Stitches:', '([\\d,]+)');
    const threadRaw = grab('Thread used:', '([\\d.]+)\\s*(?:ft|yd|m)?');
    const stop = {
      index: indexM ? parseInt(indexM[1], 10) : stops.length + 1,
      code: grab('Code:', '([A-Za-z0-9\\-]+)'),
      // Name runs to the next label on the line.
      name: grab('Name:', '([^\\n]*?)(?=\\s*(?:Chart:|Stitches:|Thread|$))'),
      chart: grab('Chart:', '([^\\n]*?)(?=\\s*(?:Stitches:|Thread|Stop|$))'),
      stitches: stitchesRaw ? parseInt(stitchesRaw.replace(/,/g, ''), 10) : null,
      thread_ft: threadRaw ? parseFloat(threadRaw) : null,
    };
    if (stop.code || stop.name || stop.stitches) stops.push(stop);
  }
  return stops;
}

// ---------------------------------------------------------------------------
// Public parse
// ---------------------------------------------------------------------------

function inches(measure) {
  if (!measure) return null;
  const { value, unit } = measure;
  if (unit === 'in' || unit === 'in2' || unit === null) return value;
  if (unit === 'mm') return +(value / 25.4).toFixed(3);
  if (unit === 'cm') return +(value / 2.54).toFixed(3);
  return null;
}

function millimeters(measure) {
  if (!measure) return null;
  const { value, unit } = measure;
  if (unit === 'mm') return value;
  if (unit === 'cm') return value * 10;
  if (unit === 'in') return +(value * 25.4).toFixed(2);
  return null;
}

function feet(measure) {
  if (!measure) return null;
  const { value, unit } = measure;
  if (unit === 'ft' || unit === null) return value;
  if (unit === 'yd') return +(value * 3).toFixed(2);
  if (unit === 'm') return +(value * 3.28084).toFixed(2);
  return null;
}

/**
 * Parse an embroidery production-worksheet PDF.
 *
 * Best effort by contract: an unreadable or unrecognised PDF returns a spec
 * with `stitch_count: null` and a warning rather than throwing, because the
 * caller's fallback is simply that the admin types the number as before.
 *
 * @param {Buffer} buffer raw PDF bytes
 * @returns {{
 *   source: string|null, design_name: string|null, title: string|null,
 *   stitch_count: number|null, colors: number|null, color_changes: number|null,
 *   stops: number|null, trims: number|null, appliques: number|null,
 *   machine_format: string|null, height_in: number|null, width_in: number|null,
 *   area_sq_in: number|null, extents_mm: object|null,
 *   max_stitch_mm: number|null, min_stitch_mm: number|null, max_jump_mm: number|null,
 *   thread_ft: number|null, bobbin_ft: number|null, colorway: string|null,
 *   stop_sequence: Array<object>, thread_colors: Array<string>,
 *   confidence: 'high'|'low'|'none', warnings: string[]
 * }}
 */
export function parseEmbroideryWorksheet(buffer) {
  const warnings = [];
  const empty = {
    source: null, design_name: null, title: null,
    stitch_count: null, colors: null, color_changes: null, stops: null,
    trims: null, appliques: null, machine_format: null,
    height_in: null, width_in: null, area_sq_in: null, extents_mm: null,
    max_stitch_mm: null, min_stitch_mm: null, max_jump_mm: null,
    thread_ft: null, bobbin_ft: null, colorway: null,
    stop_sequence: [], stop_sequence_truncated: false, thread_colors: [],
    confidence: 'none', warnings,
  };

  if (!Buffer.isBuffer(buffer) || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    warnings.push('not a PDF');
    return empty;
  }

  let text = '';
  try { text = extractPdfText(buffer); }
  catch (e) { warnings.push(`could not read the PDF (${e.message})`); return empty; }

  if (!text.trim()) {
    // Scanned worksheets and CID-encoded fonts both land here. Nothing to do
    // but tell the admin why the form did not prefill.
    warnings.push('no readable text in this PDF — it may be a scan or an image export');
    return empty;
  }

  const f = readFields(text);
  // Variant A lists stops as "Color Film" blocks; variant B as a needle
  // table that the template truncates. Whichever yielded rows wins.
  const colorFilm = readStops(text);
  const needleTable = colorFilm.length === 0 ? readNeedleTable(text) : [];
  const stopSeq = colorFilm.length > 0 ? colorFilm : needleTable;
  const truncated = needleTable.length > 0 && /More\.\.\./.test(text);

  const source = /Production Worksheet/i.test(text) ? 'wilcom-production-worksheet'
    : /ES-\d+\s*Designer|EmbroideryStudio/i.test(text) ? 'wilcom-es-designer'
    : null;

  const spec = {
    ...empty,
    source,
    design_name: f.design_name ?? readBannerDesignName(text),
    title: f.title ?? null,
    stitch_count: f.stitch_count ?? null,
    colors: f.colors ?? null,
    color_changes: f.color_changes ?? null,
    stops: f.stops ?? null,
    trims: f.trims ?? null,
    appliques: f.appliques ?? null,
    machine_format: f.machine_format ?? null,
    height_in: inches(f.height),
    width_in: inches(f.width),
    area_sq_in: inches(f.area),
    extents_mm: (f.extent_left || f.extent_right || f.extent_up || f.extent_down) ? {
      left: millimeters(f.extent_left), right: millimeters(f.extent_right),
      up: millimeters(f.extent_up), down: millimeters(f.extent_down),
    } : null,
    max_stitch_mm: millimeters(f.max_stitch),
    min_stitch_mm: millimeters(f.min_stitch),
    max_jump_mm: millimeters(f.max_jump),
    thread_ft: feet(f.thread_total),
    bobbin_ft: feet(f.bobbin_total),
    colorway: f.colorway ?? null,
    stop_sequence: stopSeq,
    stop_sequence_truncated: truncated,
    thread_colors: [...new Set(stopSeq.map((s) => s.name).filter(Boolean))],
  };
  if (truncated) {
    warnings.push(`the worksheet prints only the first ${needleTable.length} colour stops ("More...") — the colour list is partial`);
  }

  // Sanity-check the one number that sets the price. A worksheet stitch count
  // outside this range means we misread the layout, and billing off a misread
  // number is worse than making the admin type it.
  if (spec.stitch_count !== null && (spec.stitch_count < 1 || spec.stitch_count > 2_000_000)) {
    warnings.push(`ignored an implausible stitch count (${spec.stitch_count})`);
    spec.stitch_count = null;
  }
  // Cross-check against the per-stop breakdown when the worksheet has one.
  // Skipped when the table is truncated: a partial colour list ALWAYS sums
  // low, so comparing it would cry wolf on every ES-65 worksheet.
  const stopTotal = truncated ? 0 : stopSeq.reduce((t, s) => t + (s.stitches || 0), 0);
  if (spec.stitch_count && stopTotal && Math.abs(stopTotal - spec.stitch_count) > 1) {
    warnings.push(`header stitch count ${spec.stitch_count} disagrees with the colour breakdown total ${stopTotal} — verify before quoting`);
  }

  spec.confidence = spec.stitch_count ? 'high' : 'low';
  if (!spec.stitch_count) warnings.push('could not find a stitch count — enter it by hand');
  return spec;
}

/**
 * Decide which stitch count a design should be billed at, given every
 * machine-readable source we might now hold for it.
 *
 * Priority, highest first:
 *   1. dstCount   — the ST: header of a stitch file attached in this upload
 *   2. priorCount — what the design already carried: an earlier DST, or a
 *                   count an admin corrected by hand
 *   3. sheetCount — the worksheet PDF
 *
 * The DST outranks the worksheet because the DST is the file the machine
 * actually runs: it is what will be sewn, so it is what we should bill.
 * priorCount outranks the worksheet so that attaching a PDF after the fact
 * can never silently re-price a design someone already settled.
 *
 * A disagreement is reported, never resolved by arithmetic — in practice it
 * means the PDF and the stitch file are different revisions, and that is a
 * question for a human, not a rounding rule.
 *
 * @returns {{ stitchCount: number|null, notes: string[] }}
 */
export function reconcileStitchCount({ dstCount = null, priorCount = null, sheetCount = null } = {}) {
  const notes = [];
  const clean = (n) => (Number.isInteger(n) && n > 0 ? n : null);
  const dst = clean(dstCount);
  const prior = clean(priorCount);
  const sheet = clean(sheetCount);

  const stitchCount = dst ?? prior ?? sheet ?? null;
  if (sheet && stitchCount && Math.abs(stitchCount - sheet) > 1) {
    notes.push(
      `the worksheet PDF says ${sheet.toLocaleString()} stitches but this design is set to `
      + `${stitchCount.toLocaleString()} — keeping ${stitchCount.toLocaleString()}; `
      + 'check the PDF and the stitch file are the same revision'
    );
  }
  return { stitchCount, notes };
}

export default { parseEmbroideryWorksheet, extractPdfText, reconcileStitchCount };
