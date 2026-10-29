import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { runEmbroideryWorker } from '../lib/embroideryWorkers.js';
import { createEstimateRecordsRouter } from './embroideryEstimates.js';

export function createStitchEstimatorRouter({ request = fetch, records, worker = runEmbroideryWorker } = {}) {
  const router = Router();
  const cache = new Map();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 5, parts: 6, fieldSize: 100 } }).single('file');
  router.use(authenticate, adminOnly);
  router.use('/saved', records || createEstimateRecordsRouter({ cache }));
  router.use(rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Please wait a minute before estimating more artwork.' } }));
  router.post('/', (req, res) => upload(req, res, async err => {
    if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'Upload one PNG, up to 8 MB.' });
    if (!req.file || !req.file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return res.status(422).json({ error: 'Please upload a valid PNG image.' });
    const width = Number(req.body.width_in), height = req.body.height_in ? Number(req.body.height_in) : null;
    const spacing = req.body.spacing_mm ? Number(req.body.spacing_mm) : 0.42;
    const background = req.body.background || 'remove_white_edges', trim = req.body.trim !== 'false';
    if (!Number.isFinite(width) || width < 0.25 || width > 20 || (height !== null && (!Number.isFinite(height) || height < 0.25 || height > 20)) || !Number.isFinite(spacing) || spacing < 0.25 || spacing > 1.2 || !['preserve', 'remove_white_edges'].includes(background)) return res.status(422).json({ error: 'Use a size of 0.25–20 inches and spacing of 0.25–1.2 mm.' });
    const cancelled = new AbortController();
    res.once('close', () => { if (!res.writableEnded) cancelled.abort(); });
    let prepared;
    try { prepared = await worker('prepare', req.file.buffer, { widthIn: width, heightIn: height, trim, background }); }
    catch (error) { return res.status(error.status || 422).json({ error: error.message }); }
    try {
      if (res.destroyed) return;
      const png = Buffer.from(prepared.png);
      const form = new FormData();
      form.append('file', new Blob([png], { type: 'image/png' }), 'artwork.png');
      form.append('width_in', String(width)); form.append('height_in', String(prepared.height_in));
      form.append('spacing_mm', String(spacing)); form.append('background_mode', 'alpha');
      const upstream = await request('http://127.0.0.1:8765/api/v1/embroidery/estimate', { method: 'POST', body: form, signal: AbortSignal.any([AbortSignal.timeout(30_000), cancelled.signal]) });
      const data = await upstream.json();
      if (!upstream.ok) return res.status(upstream.status === 422 ? 422 : 503).json({ error: typeof data.detail === 'string' ? data.detail : 'Estimator unavailable. Try again.' });
      if (![data.estimated_stitches, data.low_stitches, data.high_stitches, data.color_count_estimate, data.coverage_pct, ...['fill','satin','running','underlay'].map(key => data.breakdown?.[key])].every(value => Number.isFinite(value) && value >= 0) || data.estimated_stitches <= 0 || data.low_stitches > data.estimated_stitches || data.high_stitches < data.estimated_stitches) throw new Error('Invalid estimator response');
      if (res.destroyed) return;
      const embroidery_preview = await worker('preview', png, { widthIn: width, spacingMm: spacing });
      if (res.destroyed) return;
      const estimate_key = randomUUID();
      const result = { ...data, filename: req.file.originalname, width_in: width, height_in: Number(prepared.height_in.toFixed(3)), embroidery_preview, estimate_key,
        algorithm_version: 'planning-v2-bounds', settings: { spacing_mm: spacing, background, trim, aspect_locked: height === null },
        artwork: { bounds: prepared.bounds, original: prepared.original }, disclaimer: 'Uncalibrated planning estimate. Confirm with the digitized file.' };
      for (const [key, entry] of cache) if (entry.expires < Date.now()) cache.delete(key);
      while (cache.size >= 4) cache.delete(cache.keys().next().value);
      cache.set(estimate_key, { source: req.file.buffer, filename: req.file.originalname, result, user: req.user.id, expires: Date.now() + 15 * 60_000 });
      res.set('Cache-Control', 'no-store').json(result);
    } catch (error) {
      console.error('[embroidery-estimate]', error.name, error.message);
      res.status(error.status || 503).json({ error: error.status === 429 ? error.message : 'Estimator temporarily unavailable. Please try again.' });
    }
  }));
  return router;
}
export default createStitchEstimatorRouter();
