import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { rateLimit } from 'express-rate-limit';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { renderEmbroideryPreview } from '../lib/embroideryPreview.js';

// Only this fixed loopback endpoint is reachable; clients cannot supply a URL.
export function createStitchEstimatorRouter({ request = fetch } = {}) {
  const router = Router();
  let busy = false;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 3, parts: 4, fieldSize: 100 },
  }).single('file');
  router.use(authenticate, adminOnly);
  router.use(rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: 'Please wait a minute before estimating more artwork.' } }));
  router.post('/', (req, res) => {
    if (busy) return res.status(429).json({ error: 'An estimate is processing. Please try again shortly.' });
    busy = true;
    upload(req, res, async (err) => {
      try {
        if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'Upload one PNG, up to 8 MB.' });
        if (!req.file || !req.file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
          return res.status(422).json({ error: 'Please upload a valid PNG image.' });
        }
        const width = Number(req.body.width_in);
        const height = req.body.height_in ? Number(req.body.height_in) : null;
        const spacing = req.body.spacing_mm ? Number(req.body.spacing_mm) : 0.42;
        if (!Number.isFinite(width) || width < 0.25 || width > 20 ||
            (height !== null && (!Number.isFinite(height) || height < 0.25 || height > 20)) ||
            !Number.isFinite(spacing) || spacing < 0.25 || spacing > 1.2) {
          return res.status(422).json({ error: 'Size must be 0.25–20 inches and spacing 0.25–1.2 mm.' });
        }
        let png;
        try {
          const image = sharp(req.file.buffer, { limitInputPixels: 12_000_000, animated: false });
          const meta = await image.metadata();
          if (meta.format !== 'png' || (meta.pages || 1) > 1) throw new Error('PNG only');
          // Bound processing work in the Python service; preserve alpha and aspect ratio.
          png = await image.resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        } catch {
          return res.status(422).json({ error: 'Invalid PNG. Use a still image under 12 megapixels.' });
        }
        try {
          const form = new FormData();
          form.append('file', new Blob([png], { type: 'image/png' }), 'artwork.png');
          form.append('width_in', String(width));
          if (height !== null) form.append('height_in', String(height));
          form.append('spacing_mm', String(spacing));
          const upstream = await request('http://127.0.0.1:8765/api/v1/embroidery/estimate', {
            method: 'POST', body: form, signal: AbortSignal.timeout(30_000),
          });
          const data = await upstream.json();
          if (!upstream.ok) return res.status(upstream.status === 422 ? 422 : 503).json({
            error: upstream.status === 422 && typeof data.detail === 'string' ? data.detail : 'Estimator is temporarily unavailable. Please try again.',
          });
          const embroidery_preview = await renderEmbroideryPreview(png, { widthIn: width, spacingMm: spacing });
          res.set('Cache-Control', 'no-store').json({ ...data, embroidery_preview });
        } catch {
          res.status(503).json({ error: 'Estimator is temporarily unavailable. Please try again.' });
        }
      } finally { busy = false; }
    });
  });
  return router;
}

export default createStitchEstimatorRouter();
