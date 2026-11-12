#!/usr/bin/env node
//
// Bulk-read embroidery worksheet PDFs and (optionally) attach one to a quote
// request. Built for the archive case: a drive full of digitized designs whose
// stitch counts only exist on paper.
//
//   # Report on a folder, recursively. Reads nothing but the PDFs.
//   node server/scripts/import-embroidery-worksheets.mjs "/Volumes/SOFTWARE/Cesar"
//
//   # Machine-readable, for piping into anything else.
//   node server/scripts/import-embroidery-worksheets.mjs /path --json
//
//   # Attach one worksheet to design 0 of request 12 (WRITES to the DB).
//   node server/scripts/import-embroidery-worksheets.mjs "/path/HOME 2.pdf" \
//     --request 12 --design 0
//
// The report is READ-ONLY and needs no database — run it against a drive to
// see what the parser gets before trusting any of it. Only --request writes,
// and it writes exactly what the admin upload route writes, minus the file
// upload to Spaces (the PDF stays where it is; pass it through the admin UI
// if the customer needs a copy with the quote).

import fs from 'fs';
import path from 'path';
import { parseEmbroideryWorksheet } from '../lib/embroideryWorksheet.js';

const args = process.argv.slice(2);
// Flags that take a value, so their value is not mistaken for the path.
const VALUED = new Set(['--request', '--design']);
const opts = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (VALUED.has(a)) opts[a.slice(2)] = args[++i];
  else if (a.startsWith('--')) opts[a.slice(2)] = true;
  else positional.push(a);
}

const target = positional[0];
const asJson = opts.json === true;
const requestId = opts.request ?? null;
const designIndex = Number(opts.design ?? 0);

if (!target) {
  console.error('usage: import-embroidery-worksheets.mjs <file.pdf|folder> [--json] [--request <id> --design <n>]');
  process.exit(2);
}

// Collect PDFs. macOS AppleDouble sidecars (._Name.pdf) are metadata, not
// documents — they are 4 KB of resource fork and parse to nothing.
function collectPdfs(root) {
  const stat = fs.statSync(root);
  if (stat.isFile()) return /\.pdf$/i.test(root) ? [root] : [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('._') || entry.name.startsWith('.')) continue;
    const full = path.join(root, entry.name);
    try {
      if (entry.isDirectory()) out.push(...collectPdfs(full));
      else if (/\.pdf$/i.test(entry.name)) out.push(full);
    } catch { /* unreadable path — skip */ }
  }
  return out;
}

const pdfs = collectPdfs(target);
if (pdfs.length === 0) {
  console.error(`no PDFs found under ${target}`);
  process.exit(1);
}

const results = [];
for (const file of pdfs) {
  let spec;
  try { spec = parseEmbroideryWorksheet(fs.readFileSync(file)); }
  catch (e) { spec = { confidence: 'none', warnings: [`read failed: ${e.message}`], stitch_count: null }; }
  results.push({ file, spec });
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const ok = results.filter((r) => r.spec.stitch_count);
  console.log(`\n${results.length} PDF(s) read — ${ok.length} with a stitch count\n`);
  const col = (s, w) => String(s ?? '—').padEnd(w).slice(0, w);
  console.log(col('design', 22) + col('stitches', 10) + col('col', 5) + col('size (in)', 14) + col('thread ft', 10) + 'source');
  console.log('-'.repeat(84));
  for (const { file, spec } of results) {
    const size = spec.width_in && spec.height_in ? `${spec.width_in} x ${spec.height_in}` : null;
    console.log(
      col(spec.design_name || path.basename(file, '.pdf'), 22)
      + col(spec.stitch_count?.toLocaleString(), 10)
      + col(spec.colors, 5)
      + col(size, 14)
      + col(spec.thread_ft, 10)
      + (spec.source || 'unrecognised')
    );
    for (const w of spec.warnings) console.log(`    ! ${w}`);
  }
  console.log();
}

// --- optional write -------------------------------------------------------

if (requestId) {
  if (results.length !== 1) {
    console.error(`--request attaches ONE worksheet; ${results.length} PDFs were given. Point it at a single file.`);
    process.exit(2);
  }
  const { spec } = results[0];
  if (!spec.stitch_count) {
    console.error('refusing to attach: no stitch count was parsed, so there is nothing to bill from.');
    process.exit(1);
  }
  if (!Number.isInteger(designIndex) || designIndex < 0 || designIndex > 9) {
    console.error('--design must be 0-9');
    process.exit(2);
  }

  const { default: pool } = await import('../db.js');
  const { rows } = await pool.query('SELECT id, design_files, embroidery_job_id FROM embroidery_requests WHERE id = $1', [requestId]);
  if (rows.length === 0) {
    console.error(`request ${requestId} not found`);
    await pool.end();
    process.exit(1);
  }
  const files = Array.isArray(rows[0].design_files) ? [...rows[0].design_files] : [];
  while (files.length <= designIndex) files.push(null);
  // Merge, never clobber: an existing DST url / admin label on this design
  // must survive. A stitch count already on the row also stands — it may
  // have been corrected by hand.
  const entry = { ...(files[designIndex] || {}) };
  entry.worksheet = spec;
  entry.stitch_count = entry.stitch_count ?? spec.stitch_count;
  entry.label = entry.label || spec.design_name || null;
  files[designIndex] = entry;

  await pool.query(
    'UPDATE embroidery_requests SET design_files = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(files), requestId]
  );
  if (rows[0].embroidery_job_id && spec.colors) {
    await pool.query(
      'UPDATE embroidery_jobs SET colors = COALESCE(colors, $1), updated_at = NOW() WHERE id = $2',
      [spec.colors, rows[0].embroidery_job_id]
    );
  }
  console.log(`attached to request ${requestId}, design ${designIndex}: `
    + `${entry.stitch_count.toLocaleString()} stitches, ${spec.colors ?? '?'} colours`);
  await pool.end();
}
