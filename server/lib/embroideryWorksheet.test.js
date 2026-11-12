// Run: node --test server/lib/embroideryWorksheet.test.js
//
// Two kinds of fixture here, on purpose:
//
//   1. SYNTHETIC PDFs built byte-by-byte below. These run everywhere,
//      including CI and the droplet, and they pin the two label layouts, the
//      CID/ToUnicode path and the refusal behaviour.
//   2. The two REAL worksheets this parser was written against, which live on
//      an external drive (/Volumes/SOFTWARE). Those assertions skip when the
//      drive is not mounted — but when it IS, they check the exact numbers a
//      human read off the printed sheets, which is the only test that proves
//      the parser agrees with the paper the shop works from.
//
// Writing synthetic PDFs by hand is deliberate: it keeps real customer
// artwork out of the repo, and an uncompressed content stream is far easier
// to read in a diff than a 1 MB binary blob.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { parseEmbroideryWorksheet, extractPdfText, reconcileStitchCount } from './embroideryWorksheet.js';

// --- synthetic PDF construction ------------------------------------------

// Minimal single-page PDF with one uncompressed content stream. `extra`
// appends whole objects (used to add a /ToUnicode CMap).
function makePdf(contentStream, { fontObj = '<< /Type /Font /Subtype /TrueType /BaseFont /Arial >>', extra = '' } = {}) {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
    fontObj,
  ];
  let pdf = '%PDF-1.4\n';
  objs.forEach((body, i) => { pdf += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  pdf += extra;
  pdf += 'trailer\n<< /Root 1 0 R >>\n%%EOF\n';
  return Buffer.from(pdf, 'latin1');
}

// Lay out `lines` as separate text runs — each gets its own Tm, which is what
// makes them separate logical lines to the extractor.
function textRuns(lines) {
  return ['BT', '/F1 11 Tf']
    .concat(lines.map((l, i) => `1 0 0 -1 50 ${50 + i * 14} Tm\n[(${l})] TJ`))
    .concat(['ET'])
    .join('\n');
}

// --- layout A: label immediately followed by its value --------------------

test('layout A — value follows each label on the same run', () => {
  const pdf = makePdf(textRuns([
    'Production Worksheet',
    'Design:', 'HOME 2',
    'Title:', 'HOME',
    'Stitches:', '5,774',
    'Colors:', '2',
    'Color changes:', '3',
    'Stops:', '4',
    'Trims:', '25',
    'Machine format:', 'Tajima',
    'Height:', '2.38 in',
    'Width:', '2.97 in',
    'Total thread:', '111.57ft',
    'Total bobbin:', '42.89ft',
    'Colorway:', 'Madeira',
  ]));
  const spec = parseEmbroideryWorksheet(pdf);
  assert.equal(spec.source, 'wilcom-production-worksheet');
  assert.equal(spec.stitch_count, 5774);          // comma stripped
  assert.equal(spec.colors, 2);
  assert.equal(spec.color_changes, 3);
  assert.equal(spec.stops, 4);
  assert.equal(spec.trims, 25);
  assert.equal(spec.machine_format, 'Tajima');
  assert.equal(spec.height_in, 2.38);
  assert.equal(spec.width_in, 2.97);
  assert.equal(spec.thread_ft, 111.57);
  assert.equal(spec.bobbin_ft, 42.89);
  assert.equal(spec.colorway, 'Madeira');
  assert.equal(spec.design_name, 'HOME 2');
  assert.equal(spec.confidence, 'high');
});

// --- layout B: labels grouped, then values grouped ------------------------

test('layout B — a run of values is dealt out to the queued labels in order', () => {
  const pdf = makePdf(textRuns([
    'Wilcom ES-65 Designer',
    // Four labels, no values yet — exactly how the ES-65 template prints.
    'Stitches:', 'Colors:', 'Color changes:', 'Stops:',
    '22871', '8', '34', '35',
    // Mixed types in one run: text then int.
    'Machine:', 'Trims:',
    'Tajima', '60',
    'Max Stitch:', 'Min Stitch:', 'Max Jump:',
    '11.0 mm', '0.3 mm', '6.9 mm',
  ]));
  const spec = parseEmbroideryWorksheet(pdf);
  assert.equal(spec.source, 'wilcom-es-designer');
  assert.equal(spec.stitch_count, 22871);
  assert.equal(spec.colors, 8);
  assert.equal(spec.color_changes, 34);
  assert.equal(spec.stops, 35);
  // The type check is what keeps "Tajima" off Trims: and 60 off Machine:.
  assert.equal(spec.machine_format, 'Tajima');
  assert.equal(spec.trims, 60);
  assert.equal(spec.max_stitch_mm, 11.0);
  assert.equal(spec.min_stitch_mm, 0.3);
  assert.equal(spec.max_jump_mm, 6.9);
});

test('an empty Author:/Fabric: label cannot swallow a following value', () => {
  // This is the bug the SKIPPED_LABELS list exists to prevent: in layout B an
  // Author: printed with no value sat in the queue and ate the first atom of
  // whatever came next, shifting every later field by one.
  const pdf = makePdf(textRuns([
    'Wilcom ES-65 Designer',
    'Author:', 'Fabric:',
    'Stitches:', 'Colors:',
    '22871', '8',
  ]));
  const spec = parseEmbroideryWorksheet(pdf);
  assert.equal(spec.stitch_count, 22871);
  assert.equal(spec.colors, 8);
});

test('units are normalised — mm extents, inch sizes', () => {
  const pdf = makePdf(textRuns([
    'Stitches:', '1000',
    'Left:', '37.7 mm', 'Right:', '37.7 mm', 'Up:', '30.3 mm', 'Down:', '30.2 mm',
    'Height:', '25.4 mm',          // mm height converts to inches
    'Area', '7.07 in²',
  ]));
  const spec = parseEmbroideryWorksheet(pdf);
  assert.deepEqual(spec.extents_mm, { left: 37.7, right: 37.7, up: 30.3, down: 30.2 });
  assert.equal(spec.height_in, 1);            // 25.4 mm == 1 in
  assert.equal(spec.area_sq_in, 7.07);
});

// --- per-stop colour sequence --------------------------------------------

test('layout A Color Film blocks give per-colour stitches and thread', () => {
  const pdf = makePdf(textRuns([
    'Production Worksheet', 'Stitches:', '2,888',
    'Stop #: 1', 'Code: 1002', 'Name: White', 'Chart: Madeira Classic 40',
    'Stitches: 1,680', 'Thread used: 20.37ft',
    'Stop #: 2', 'Code: 1025', 'Name: Dark Orange', 'Chart: Madeira Classic 40',
    'Stitches: 1,208', 'Thread used: 21.03ft',
  ]));
  const spec = parseEmbroideryWorksheet(pdf);
  assert.equal(spec.stop_sequence.length, 2);
  assert.deepEqual(spec.stop_sequence[0], {
    index: 1, code: '1002', name: 'White', chart: 'Madeira Classic 40',
    stitches: 1680, thread_ft: 20.37,
  });
  assert.equal(spec.stop_sequence[1].name, 'Dark Orange');
  assert.deepEqual(spec.thread_colors, ['White', 'Dark Orange']);
  assert.equal(spec.stop_sequence_truncated, false);
  // 1680 + 1208 == 2888, so no disagreement warning.
  assert.equal(spec.warnings.length, 0);
});

test('a header stitch count that disagrees with the colour breakdown warns', () => {
  const pdf = makePdf(textRuns([
    'Production Worksheet', 'Stitches:', '9,999',
    'Stop #: 1', 'Code: 1002', 'Name: White', 'Stitches: 1,680', 'Thread used: 20.37ft',
  ]));
  const spec = parseEmbroideryWorksheet(pdf);
  assert.equal(spec.stitch_count, 9999);        // header still wins
  assert.match(spec.warnings.join(' '), /disagrees with the colour breakdown/);
});

test('a truncated ES-65 needle table is flagged and suppresses the cross-check', () => {
  const pdf = makePdf(textRuns([
    'Wilcom ES-65 Designer', 'Stitches:', '22871',
    '#', 'C', 'St.', 'Descr  Code',
    '1.3', '1167Royal Blue', '1076', 'Brand: Madeira Classic 40',
    '2.13', '1074Black 1000', 'Brand: Madeira Classic 40',
    'More...',
  ]));
  const spec = parseEmbroideryWorksheet(pdf);
  assert.equal(spec.stop_sequence_truncated, true);
  assert.equal(spec.stop_sequence.length, 2);
  assert.equal(spec.stop_sequence[0].needle, 3);
  assert.equal(spec.stop_sequence[0].stitches, 1167);
  assert.equal(spec.stop_sequence[0].name, 'Royal Blue');
  assert.deepEqual(spec.thread_colors, ['Royal Blue', 'Black']);
  assert.match(spec.warnings.join(' '), /colour list is partial/);
  // The partial table must NOT produce a "disagrees" warning.
  assert.doesNotMatch(spec.warnings.join(' '), /disagrees/);
});

// --- CID / ToUnicode ------------------------------------------------------

test('CID hex strings decode through the font /ToUnicode CMap', () => {
  // Glyph ids with the standard subset offset (gid = char - 29), the exact
  // scheme the real ES-65 worksheet uses.
  const gid = (ch) => (ch.charCodeAt(0) - 29).toString(16).padStart(4, '0').toUpperCase();
  const hexRun = (s) => `<${[...s].map(gid).join('')}>`;
  const cmapBody = [
    '/CIDInit /ProcSet findresource begin 12 dict begin begincmap',
    '/CMapName /Adobe-Identity-UCS def /CMapType 2 def',
    '1 begincodespacerange <0000> <FFFF> endcodespacerange',
    // Map every glyph id we use back to its character.
    `${95} beginbfchar`,
    ...Array.from({ length: 95 }, (_, i) => {
      const ch = String.fromCharCode(32 + i);
      return `<${gid(ch)}> <${(32 + i).toString(16).padStart(4, '0').toUpperCase()}>`;
    }),
    'endbfchar',
    'endcmap end end',
  ].join('\n');

  const content = ['BT', '/F1 11 Tf',
    `1 0 0 -1 50 50 Tm\n[${hexRun('Stitches:')}] TJ`,
    `1 0 0 -1 50 64 Tm\n[${hexRun('22871')}] TJ`,
    `1 0 0 -1 50 78 Tm\n[${hexRun('Machine format:')}] TJ`,
    `1 0 0 -1 50 92 Tm\n[${hexRun('Tajima')}] TJ`,
    'ET'].join('\n');

  const pdf = makePdf(content, {
    fontObj: '<< /Type /Font /Subtype /TrueType /BaseFont /ArialSubset /ToUnicode 6 0 R >>',
    extra: `6 0 obj\n<< /Length ${cmapBody.length} >>\nstream\n${cmapBody}\nendstream\nendobj\n`,
  });

  const text = extractPdfText(pdf);
  assert.match(text, /Stitches:/);
  const spec = parseEmbroideryWorksheet(pdf);
  assert.equal(spec.stitch_count, 22871);
  assert.equal(spec.machine_format, 'Tajima');
});

// --- refusals and degradation --------------------------------------------

test('a non-PDF buffer is reported, not thrown', () => {
  const spec = parseEmbroideryWorksheet(Buffer.from('this is a DST file, not a PDF'));
  assert.equal(spec.stitch_count, null);
  assert.equal(spec.confidence, 'none');
  assert.deepEqual(spec.warnings, ['not a PDF']);
});

test('a PDF with no text layer asks the admin to type the count', () => {
  // Valid PDF, but the only stream is an image — nothing to read.
  const spec = parseEmbroideryWorksheet(makePdf('q 1 0 0 1 0 0 cm Q'));
  assert.equal(spec.stitch_count, null);
  assert.equal(spec.confidence, 'none');
  assert.match(spec.warnings.join(' '), /no readable text/);
});

test('an implausible stitch count is refused rather than billed', () => {
  const pdf = makePdf(textRuns(['Production Worksheet', 'Stitches:', '9,999,999']));
  const spec = parseEmbroideryWorksheet(pdf);
  assert.equal(spec.stitch_count, null);
  assert.match(spec.warnings.join(' '), /implausible stitch count/);
});

test('garbage input never throws', () => {
  for (const input of [null, undefined, '', Buffer.alloc(0), Buffer.from('%PDF-1.4 truncated')]) {
    assert.doesNotThrow(() => parseEmbroideryWorksheet(input));
  }
});

// --- which count gets billed ---------------------------------------------
//
// This is the money. The stitch count picked here is what embroideryPricing
// tiers off, so each precedence rule gets its own test.

test('the worksheet fills a stitch count when nothing else has one', () => {
  const { stitchCount, notes } = reconcileStitchCount({ sheetCount: 5774 });
  assert.equal(stitchCount, 5774);
  assert.deepEqual(notes, []);
});

test('a DST header outranks the worksheet — the DST is what the machine runs', () => {
  const { stitchCount, notes } = reconcileStitchCount({ dstCount: 5800, sheetCount: 5774 });
  assert.equal(stitchCount, 5800);
  assert.match(notes.join(' '), /worksheet PDF says 5,774.*set to 5,800/);
});

test('a count already on the design outranks a later worksheet upload', () => {
  // Attaching the PDF after the fact must not re-price a settled design.
  const { stitchCount, notes } = reconcileStitchCount({ priorCount: 6000, sheetCount: 5774 });
  assert.equal(stitchCount, 6000);
  assert.match(notes.join(' '), /keeping 6,000/);
});

test('agreement within a stitch is silent', () => {
  assert.deepEqual(reconcileStitchCount({ dstCount: 5774, sheetCount: 5774 }).notes, []);
  assert.deepEqual(reconcileStitchCount({ dstCount: 5775, sheetCount: 5774 }).notes, []);
});

test('no source at all yields null, not a zero price', () => {
  assert.equal(reconcileStitchCount({}).stitchCount, null);
  assert.equal(reconcileStitchCount().stitchCount, null);
});

test('junk and non-positive counts are ignored rather than billed', () => {
  assert.equal(reconcileStitchCount({ dstCount: 0, sheetCount: 5774 }).stitchCount, 5774);
  assert.equal(reconcileStitchCount({ dstCount: -5, sheetCount: 5774 }).stitchCount, 5774);
  assert.equal(reconcileStitchCount({ dstCount: 1.5, sheetCount: 5774 }).stitchCount, 5774);
  assert.equal(reconcileStitchCount({ dstCount: NaN, priorCount: null, sheetCount: null }).stitchCount, null);
});

// --- the real worksheets this was built against ---------------------------
//
// Numbers below were read off the printed sheets by hand. They skip when the
// drive is unmounted (CI, the droplet) and are the real regression net on the
// Mac where these files live.

const REAL = [
  {
    path: '/Volumes/SOFTWARE/Cesar/Hat Cesar/HOME 2.pdf',
    expect: {
      source: 'wilcom-production-worksheet',
      design_name: 'HOME 2', title: 'HOME',
      stitch_count: 5774, colors: 2, color_changes: 3, stops: 4, trims: 25,
      machine_format: 'Tajima', height_in: 2.38, width_in: 2.97, area_sq_in: 7.07,
      thread_ft: 111.57, bobbin_ft: 42.89, colorway: 'Madeira',
      max_stitch_mm: 7.5, min_stitch_mm: 0.1, max_jump_mm: 7,
    },
    stops: 4,
    colorsList: ['White', 'Dark Orange'],
  },
  {
    path: '/Volumes/SOFTWARE/Herbo/Hero.pdf',
    expect: {
      source: 'wilcom-es-designer',
      design_name: 'Hero',
      stitch_count: 22871, colors: 8, color_changes: 34, stops: 35, trims: 60,
      machine_format: 'Tajima', height_in: 2.7, width_in: 4.03,
      colorway: 'Madeira',
      max_stitch_mm: 11, min_stitch_mm: 0.3, max_jump_mm: 6.9,
    },
    truncated: true,
  },
];

for (const { path, expect, stops, colorsList, truncated } of REAL) {
  test(`real worksheet: ${path.split('/').pop()}`, { skip: !fs.existsSync(path) && 'drive not mounted' }, () => {
    const spec = parseEmbroideryWorksheet(fs.readFileSync(path));
    for (const [k, v] of Object.entries(expect)) assert.equal(spec[k], v, `${k}`);
    if (stops !== undefined) assert.equal(spec.stop_sequence.length, stops);
    if (colorsList) assert.deepEqual(spec.thread_colors, colorsList);
    if (truncated) assert.equal(spec.stop_sequence_truncated, true);
  });
}
