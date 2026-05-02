import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import pool from '../db.js';
import { uploadObject } from '../services/spaces.js';

const router = Router();

// All design routes require authentication
router.use(authenticate);

// Helper: upload base64 image to DO Spaces. Delegates to the shared helper
// in services/spaces.js so the endpoint/region/URL stay consistent with
// every other uploader in the app.
async function uploadToSpaces(base64Data, folder, filename) {
  if (!process.env.SPACES_KEY || !process.env.SPACES_SECRET) return null;
  try {
    return await uploadObject({
      key: `${folder}/${filename}`,
      body: base64Data,
      contentType: 'image/png',
    });
  } catch (err) {
    console.error('[designs] upload failed:', err.message);
    return null;
  }
}

// GET / - List user's saved designs
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, product_name, product_image, thumbnail, updated_at FROM saved_designs WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.user.id]
    );
    res.json({ designs: result.rows });
  } catch (err) {
    next(err);
  }
});

// --- Upload library routes MUST be before /:id to avoid "uploads" matching the :id param ---

// GET /uploads - Get user's upload library
router.get('/uploads', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, url, filename, created_at FROM user_uploads WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /uploads - Save an uploaded image to the user's library
router.post('/uploads', async (req, res, next) => {
  try {
    const { imageBase64, filename } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 required' });

    const url = await uploadToSpaces(
      imageBase64,
      `customers/${req.user.id}/uploads`,
      `${(filename || 'upload').replace(/[^a-zA-Z0-9.-]/g, '-')}-${Date.now()}.png`
    );

    if (!url) return res.status(500).json({ error: 'Upload failed' });

    const result = await pool.query(
      'INSERT INTO user_uploads (user_id, url, filename) VALUES ($1, $2, $3) RETURNING id, url, filename, created_at',
      [req.user.id, url, filename || 'upload.png']
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /uploads/:id - Remove an upload from library
router.delete('/uploads/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM user_uploads WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// --- End upload library routes ---

// GET /:id - Load a specific design
router.get('/:id', async (req, res, next) => {
  try {
    const designId = parseInt(req.params.id, 10);
    if (isNaN(designId)) return res.status(400).json({ error: 'Invalid design ID' });
    const result = await pool.query(
      'SELECT * FROM saved_designs WHERE id = $1 AND user_id = $2',
      [designId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Design not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Detect a Fabric v2 (canvas.toJSON) payload as opposed to a legacy v1
// DesignElement[] array. v2 is a plain object with schemaVersion === 2;
// v1 is an array. Anything else (null, empty, malformed) returns false.
function isV2Elements(elements) {
  return (
    elements
    && !Array.isArray(elements)
    && typeof elements === 'object'
    && elements.schemaVersion === 2
  );
}

// Walk the Fabric v2 `objects` array and upload any FabricImage with a
// data: src to Spaces, replacing src with the hosted URL. Mirrors the v1
// pass that runs in POST/PUT for legacy DesignElement[] payloads.
//
// Reasoning: without this, the saved_designs.elements column accumulates
// embedded base64 PNGs — a single shirt mockup is several hundred KB
// inline. Spaces hosts the image; we store a URL.
//
// The `src` field is what FabricImage.toObject emits for image source.
// Type matching is loose ("type" or "Image" in some Fabric versions) so
// we match either.
async function uploadV2DataImages(v2, userId) {
  if (!isV2Elements(v2)) return v2;
  const objects = Array.isArray(v2.objects) ? v2.objects : [];
  for (const obj of objects) {
    const isImage = obj && (obj.type === 'image' || obj.type === 'Image' || obj.type === 'FabricImage');
    if (!isImage) continue;
    if (typeof obj.src !== 'string' || !obj.src.startsWith('data:')) continue;
    try {
      const url = await uploadToSpaces(
        obj.src,
        `customers/${userId}/design-elements`,
        `element-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
      );
      if (url) obj.src = url;
    } catch {
      // Leave src as-is on failure — the design still renders, just bloated.
    }
  }
  return v2;
}

// POST / - Save a new design
router.post('/', async (req, res, next) => {
  try {
    const { name, product_ss_id, product_name, product_image, color_index, elements } = req.body;
    const designName = name || 'Untitled design';

    // v1: walk DesignElement[] and upload data-URL images. v2: skip — the
    // Fabric path uploads images to Spaces at add-time (or accepts the
    // bloat for now, see PR #8 follow-ups). Either way, never iterate a
    // non-array as an array (would throw).
    let savedElements;
    if (Array.isArray(elements)) {
      savedElements = [];
      for (const el of elements) {
        if (el.type === 'image' && el.content && el.content.startsWith('data:')) {
          try {
            const url = await uploadToSpaces(
              el.content,
              `customers/${req.user.id}/design-elements`,
              `element-${Date.now()}-${Math.random().toString(36).slice(2)}.png`
            );
            savedElements.push({ ...el, content: url || el.content });
          } catch {
            savedElements.push(el);
          }
        } else {
          savedElements.push(el);
        }
      }
    } else {
      // v2 (Fabric): mirror the v1 image-upload pass so we don't store
      // base64-inline images that bloat the saved_designs.elements column.
      savedElements = await uploadV2DataImages(elements, req.user.id);
    }

    // Upload thumbnail snapshot to Spaces if it's a data URL
    let thumbnailUrl = product_image;
    const { thumbnail } = req.body;
    if (thumbnail && thumbnail.startsWith('data:')) {
      try {
        const url = await uploadToSpaces(
          thumbnail,
          `customers/${req.user.id}/thumbnails`,
          `thumb-${Date.now()}.png`
        );
        if (url) thumbnailUrl = url;
      } catch { /* keep default */ }
    } else if (thumbnail) {
      thumbnailUrl = thumbnail;
    }

    const schemaVersion = isV2Elements(savedElements) ? 2 : 1;
    const result = await pool.query(
      `INSERT INTO saved_designs (user_id, name, product_ss_id, product_name, product_image, color_index, elements, thumbnail, schema_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, updated_at`,
      [req.user.id, designName, product_ss_id, product_name, product_image, color_index || 0, JSON.stringify(savedElements), thumbnailUrl, schemaVersion]
    );
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /:id - Update an existing design
router.put('/:id', async (req, res, next) => {
  try {
    const designId = parseInt(req.params.id, 10);
    if (isNaN(designId)) return res.status(400).json({ error: 'Invalid design ID' });
    const { name, product_ss_id, product_name, product_image, color_index, elements, thumbnail, original_legacy_payload } = req.body;

    // Upload thumbnail snapshot to Spaces if it's a data URL
    let thumbnailUrl = thumbnail;
    if (thumbnail && thumbnail.startsWith('data:')) {
      try {
        const url = await uploadToSpaces(
          thumbnail,
          `customers/${req.user.id}/thumbnails`,
          `thumb-${Date.now()}.png`
        );
        if (url) thumbnailUrl = url;
      } catch { /* keep as-is */ }
    }

    // v2 image upload pass — same reasoning as POST. Mutates `elements`
    // in place so the JSON.stringify below picks up the hosted URLs.
    if (isV2Elements(elements)) {
      await uploadV2DataImages(elements, req.user.id);
    }

    // First-time v1 → v2 transition: persist the original legacy payload
    // to elements_legacy so the admin restore endpoint (PR #8) has a
    // byte-for-byte rollback target. The client only sends
    // original_legacy_payload when (a) the page was loaded from a v1
    // design, and (b) we're now saving a v2 payload from the Fabric
    // renderer. Server-side guard: only write if the column is currently
    // NULL — never overwrite an existing snapshot, never archive on a
    // pure v1 → v1 save.
    const v2Save = isV2Elements(elements);
    const shouldArchive =
      v2Save
      && original_legacy_payload != null
      && Array.isArray(original_legacy_payload);

    if (shouldArchive) {
      await pool.query(
        `UPDATE saved_designs
           SET elements_legacy = $1, legacy_archived_at = NOW()
         WHERE id = $2 AND elements_legacy IS NULL`,
        [JSON.stringify(original_legacy_payload), designId]
      );
    }

    // Admins can edit any design; customers can only edit their own.
    const isAdmin = req.user?.role === 'admin';
    const newSchemaVersion = v2Save ? 2 : null;
    const result = await pool.query(
      `UPDATE saved_designs SET
        name = COALESCE($1, name),
        product_ss_id = COALESCE($2, product_ss_id),
        product_name = COALESCE($3, product_name),
        product_image = COALESCE($4, product_image),
        color_index = COALESCE($5, color_index),
        elements = COALESCE($6, elements),
        thumbnail = COALESCE($7, thumbnail),
        schema_version = COALESCE($8, schema_version),
        updated_at = NOW()
       WHERE id = $9 ${isAdmin ? '' : 'AND user_id = $10'}
       RETURNING id, name, updated_at`,
      isAdmin
        ? [name, product_ss_id, product_name, product_image, color_index, elements ? JSON.stringify(elements) : null, thumbnailUrl, newSchemaVersion, designId]
        : [name, product_ss_id, product_name, product_image, color_index, elements ? JSON.stringify(elements) : null, thumbnailUrl, newSchemaVersion, designId, req.user.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Design not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /:id - Delete a design
router.delete('/:id', async (req, res, next) => {
  try {
    const designId = parseInt(req.params.id, 10);
    if (isNaN(designId)) return res.status(400).json({ error: 'Invalid design ID' });
    const result = await pool.query(
      'DELETE FROM saved_designs WHERE id = $1 AND user_id = $2 RETURNING id',
      [designId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Design not found' });
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

// GET /my-assets - the logged-in customer's private asset library
// (admin uploads graphics to a customer via /api/admin/customers/:id/assets;
// the customer sees them here.)
router.get('/my-assets', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, image_url, file_type, width, height, size_bytes, created_at FROM customer_assets WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
