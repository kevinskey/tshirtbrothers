#!/usr/bin/env node
// DigiRIP print agent — runs on the shop PC next to the Prestige.
//
// Every POLL_SECONDS it asks tshirtbrothers.com for paid gang sheets that
// nobody has started on, downloads each one from its private Spaces link,
// writes it into DigiRIP's hot folder, and tells the server it did so. The
// server then shows "Pulled to printer" in /admin and moves the order to
// in_production. No dependencies: Node 20+ only.
//
//   node agent.mjs            poll forever (Task Scheduler / run-agent.bat)
//   node agent.mjs --once     one pass, then exit
//   node agent.mjs --check    verify the key, the API, and the hot folder
//
// Config lives in config.json beside this file (see config.example.json);
// any key can be overridden by an environment variable of the same name in
// upper case (e.g. HOT_FOLDER, API_KEY).

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ARGS = new Set(process.argv.slice(2));

// ── Config ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  api_base: 'https://tshirtbrothers.com',
  api_key: '',
  hot_folder: '',
  poll_seconds: 30,
  // Widest sheet the press can take. Orders wider than this are skipped
  // (and logged once) so they stay in the admin queue for a vendor send.
  max_width_in: 24,
  printer_name: 'Prestige L2 Pro',
  // Downloads land here first and are renamed into the hot folder only once
  // complete and verified, so DigiRIP never sees a half-written PNG.
  staging_dir: path.join(HERE, 'staging'),
  // Optional: also keep a copy of every pulled sheet here (DigiRIP deletes
  // hot-folder files once it ingests them). Empty = don't.
  archive_dir: '',
};

function loadConfig() {
  const file = path.join(HERE, 'config.json');
  let fromFile = {};
  if (fs.existsSync(file)) {
    try { fromFile = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (err) { die(`config.json is not valid JSON: ${err.message}`); }
  }
  const cfg = { ...DEFAULTS, ...fromFile };
  for (const key of Object.keys(DEFAULTS)) {
    const env = process.env[key.toUpperCase()];
    if (env !== undefined && env !== '') cfg[key] = typeof DEFAULTS[key] === 'number' ? Number(env) : env;
  }
  cfg.api_base = String(cfg.api_base).replace(/\/+$/, '');
  cfg.poll_seconds = Math.max(5, Number(cfg.poll_seconds) || 30);
  cfg.max_width_in = Number(cfg.max_width_in) || DEFAULTS.max_width_in;
  if (!cfg.api_key) die('api_key is empty — paste the PRINT_AGENT_KEY from the server into config.json');
  if (!cfg.hot_folder) die('hot_folder is empty — set it to the folder DigiRIP watches (see README.md)');
  return cfg;
}

// ── Logging ───────────────────────────────────────────────────────────────

const LOG_FILE = path.join(HERE, 'agent.log');
function log(level, msg) {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${msg}`;
  (level === 'ERROR' ? console.error : console.log)(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch { /* disk full / read-only: console still has it */ }
}
const info = (m) => log('INFO', m);
const warn = (m) => log('WARN', m);
const error = (m) => log('ERROR', m);
function die(msg) { error(msg); process.exit(1); }

// ── Local state ───────────────────────────────────────────────────────────
// Belt and braces alongside the server's printer_pulled_at: if the file was
// written but the "pulled" report never reached the server (network blip,
// crash), we must not download it a second time and double-print it.

const STATE_FILE = path.join(HERE, 'state.json');
function loadState() {
  try { return { pulled: {}, unreported: {}, warned_width: {}, ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) }; }
  catch { return { pulled: {}, unreported: {}, warned_width: {} }; }
}
function saveState(state) {
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE);
}

// ── API ───────────────────────────────────────────────────────────────────

async function api(cfg, method, route, body) {
  const res = await fetch(`${cfg.api_base}/api/gangsheet-store/print-agent${route}`, {
    method,
    headers: {
      'x-print-agent-key': cfg.api_key,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const detail = json?.error || text.slice(0, 200) || res.statusText;
    throw new Error(`${method} ${route} → ${res.status} ${detail}`);
  }
  return json;
}

// ── Files ─────────────────────────────────────────────────────────────────

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function slug(s) {
  return String(s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40);
}

function filenameFor(order) {
  const tier = order.tier === 'hot_rush' ? '-HOTRUSH' : order.tier === 'rush' ? '-RUSH' : '';
  const who = slug(order.customer_name);
  return `TSB-${order.id}-${order.width_in}in-x-${order.length_ft}ft${who ? `-${who}` : ''}${tier}.png`;
}

async function downloadTo(url, dest, expectedBytes) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`download → ${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(dest));
  const st = await fsp.stat(dest);
  if (expectedBytes != null && st.size !== expectedBytes) {
    throw new Error(`download incomplete: got ${st.size} bytes, expected ${expectedBytes}`);
  }
  const fd = await fsp.open(dest, 'r');
  try {
    const head = Buffer.alloc(8);
    await fd.read(head, 0, 8, 0);
    if (!head.equals(PNG_MAGIC)) throw new Error('downloaded file is not a PNG');
  } finally { await fd.close(); }
  return st.size;
}

// Unique final name in the hot folder (a re-pull after a manual delete must
// not overwrite a file DigiRIP is mid-way through reading).
async function uniquePath(dir, filename) {
  const base = filename.replace(/\.png$/i, '');
  let candidate = path.join(dir, filename);
  for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(dir, `${base}-${n}.png`);
  return candidate;
}

// Move staging → hot folder so the file appears complete in one step. rename
// is atomic on the same volume; across volumes (staging on C:, hot folder on
// a network share) fall back to copying under a .part name that DigiRIP
// ignores, then renaming within the hot folder.
async function moveIntoHotFolder(src, dest) {
  try {
    await fsp.rename(src, dest);
  } catch (err) {
    if (err.code !== 'EXDEV') throw err;
    const part = dest + '.part';
    await fsp.copyFile(src, part);
    await fsp.rename(part, dest);
    await fsp.unlink(src);
  }
}

// ── One pass ──────────────────────────────────────────────────────────────

async function reportUnreported(cfg, state) {
  for (const [id, rec] of Object.entries(state.unreported)) {
    try {
      await api(cfg, 'POST', `/orders/${id}/pulled`, { printer: cfg.printer_name, filename: rec.filename });
      delete state.unreported[id];
      saveState(state);
      info(`order #${id}: pull reported to server (late)`);
    } catch (err) {
      warn(`order #${id}: still can't report pull — ${err.message}`);
    }
  }
}

async function pass(cfg, state) {
  await reportUnreported(cfg, state);

  const { orders } = await api(cfg, 'GET', '/queue');
  if (!orders.length) return 0;

  let pulled = 0;
  for (const order of orders) {
    const id = String(order.id);
    if (state.pulled[id]) {
      // We wrote this one already; the server just hasn't heard (handled above).
      continue;
    }
    if (order.width_in > cfg.max_width_in) {
      if (!state.warned_width[id]) {
        warn(`order #${id}: ${order.width_in}" sheet is wider than this press (${cfg.max_width_in}") — skipping; send it to a vendor from /admin`);
        state.warned_width[id] = true;
        saveState(state);
      }
      continue;
    }

    const filename = filenameFor(order);
    const staged = path.join(cfg.staging_dir, filename);
    try {
      info(`order #${id}: downloading ${order.width_in}" × ${order.length_ft} ft (${order.tier}) for ${order.customer_name || 'walk-in'}`);
      const size = await downloadTo(order.file_url, staged, order.bytes);

      if (cfg.archive_dir) {
        await fsp.mkdir(cfg.archive_dir, { recursive: true });
        await fsp.copyFile(staged, path.join(cfg.archive_dir, filename));
      }

      const dest = await uniquePath(cfg.hot_folder, filename);
      await moveIntoHotFolder(staged, dest);
      const finalName = path.basename(dest);
      info(`order #${id}: → ${dest} (${(size / 1048576).toFixed(1)} MB)`);
      if (order.white_bg_flag) warn(`order #${id}: server flagged a possible white background — check the sheet before it prints`);
      if (order.admin_note) info(`order #${id}: shop note: ${order.admin_note}`);
      if (order.note) info(`order #${id}: customer note: ${order.note}`);

      state.pulled[id] = { filename: finalName, at: new Date().toISOString() };
      state.unreported[id] = { filename: finalName };
      saveState(state);
      pulled++;

      await api(cfg, 'POST', `/orders/${id}/pulled`, { printer: cfg.printer_name, filename: finalName });
      delete state.unreported[id];
      saveState(state);
    } catch (err) {
      error(`order #${id}: ${err.message}`);
      // A failed download leaves nothing in the hot folder; drop the partial
      // so the next pass starts clean. A failed *report* keeps the file and
      // the unreported record, retried at the top of the next pass.
      if (!state.pulled[id]) await fsp.rm(staged, { force: true }).catch(() => {});
    }
  }
  return pulled;
}

// ── Entry ─────────────────────────────────────────────────────────────────

async function check(cfg) {
  info(`API      ${cfg.api_base}`);
  const ping = await api(cfg, 'GET', '/ping');
  info(`API key  OK (bucket ${ping.bucket})`);
  await fsp.mkdir(cfg.staging_dir, { recursive: true });
  if (!fs.existsSync(cfg.hot_folder)) die(`hot folder does not exist: ${cfg.hot_folder}`);
  const probe = path.join(cfg.hot_folder, `.tsb-agent-probe-${process.pid}.tmp`);
  await fsp.writeFile(probe, 'ok');
  await fsp.unlink(probe);
  info(`hot folder ${cfg.hot_folder} is writable`);
  const { orders } = await api(cfg, 'GET', '/queue');
  info(`queue    ${orders.length} sheet(s) waiting`);
  for (const o of orders) {
    const fits = o.width_in <= cfg.max_width_in ? '' : `  (too wide for ${cfg.max_width_in}" — vendor)`;
    info(`  #${o.id}  ${o.width_in}" × ${o.length_ft} ft  ${o.tier}  ${o.customer_name || ''}${fits}`);
  }
}

async function main() {
  const cfg = loadConfig();
  if (ARGS.has('--check')) { await check(cfg); return; }

  await fsp.mkdir(cfg.staging_dir, { recursive: true });
  if (!fs.existsSync(cfg.hot_folder)) die(`hot folder does not exist: ${cfg.hot_folder}`);
  const state = loadState();
  info(`print agent up — ${cfg.printer_name}, max ${cfg.max_width_in}", hot folder ${cfg.hot_folder}, every ${cfg.poll_seconds}s`);

  let stopping = false;
  const stop = () => { stopping = true; info('stopping'); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  do {
    try {
      const n = await pass(cfg, state);
      if (n) info(`pass done: ${n} sheet(s) pulled`);
    } catch (err) {
      error(`pass failed: ${err.message}`);
    }
    if (ARGS.has('--once') || stopping) break;
    await new Promise((r) => setTimeout(r, cfg.poll_seconds * 1000));
  } while (!stopping);
}

main().catch((err) => die(err.stack || err.message));
