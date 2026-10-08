// Admin "All Uploads" browser — every file in the DO Spaces bucket, no matter
// which route put it there (quote uploads, gang sheets, embroidery, mail
// attachments, mockups, art library, customer assets, ...). The Art Editor's
// library only shows admin_designs rows, so graphics uploaded anywhere else
// were invisible; this lists the bucket itself so nothing is missed.
//
// GET    /api/admin/uploads            list (folder, q, type, sort, offset, limit, refresh)
// GET    /api/admin/uploads/file?key=  stream one object (used to load private
//                                      files into the editor without CORS)
// DELETE /api/admin/uploads            body { keys: string[] } — deletes the
//                                      objects and any library rows pointing at them

import { Router } from 'express';
import express from 'express';
import { ListObjectsV2Command, GetObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticate, adminOnly } from '../middleware/auth.js';
import pool from '../db.js';
import { getSpacesClient, publicUrl, SPACES_BUCKET, SPACES_REGION } from '../services/spaces.js';

const router = Router();
router.use(authenticate, adminOnly);

// Folders written with acl:'private' — their CDN URL 403s, so the editor has
// to pull them through /file instead.
const PRIVATE_PREFIXES = ['gangsheet-orders/'];

const PREVIEWABLE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']);
const GRAPHIC = new Set([...PREVIEWABLE, 'pdf', 'ai', 'eps', 'psd', 'tif', 'tiff', 'heic', 'heif',
  'dst', 'pes', 'exp', 'jef', 'vp3', 'xxx', 'emb']);

const MAX_OBJECTS = 100_000;
const CACHE_MS = 60_000;
let cache = { at: 0, objects: null };

export function extOf(key) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(key);
  return m ? m[1].toLowerCase() : '';
}

export function isPrivateKey(key) {
  return PRIVATE_PREFIXES.some((p) => key.startsWith(p));
}

async function listAll(force = false) {
  if (!force && cache.objects && Date.now() - cache.at < CACHE_MS) return cache.objects;
  const client = getSpacesClient();
  const out = [];
  let token;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: SPACES_BUCKET, ContinuationToken: token, MaxKeys: 1000,
    }));
    for (const o of page.Contents || []) {
      if (!o.Key || o.Key.endsWith('/')) continue; // folder placeholders
      out.push({ key: o.Key, size: o.Size || 0, lastModified: o.LastModified ? o.LastModified.toISOString() : null });
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token && out.length < MAX_OBJECTS);
  cache = { at: Date.now(), objects: out };
  return out;
}

// Pure filter/sort/page step, split out so it can be unit tested.
export function filterObjects(objects, { folder = '', q = '', type = 'graphics', sort = 'newest' } = {}) {
  const needle = String(q).trim().toLowerCase();
  let rows = objects.filter((o) => {
    if (type === 'graphics' && !GRAPHIC.has(extOf(o.key))) return false;
    if (folder === '(root)') { if (o.key.includes('/')) return false; }
    else if (folder && !o.key.startsWith(folder.endsWith('/') ? folder : `${folder}/`)) return false;
    if (needle && !o.key.toLowerCase().includes(needle)) return false;
    return true;
  });
  const cmp = {
    newest: (a, b) => String(b.lastModified).localeCompare(String(a.lastModified)),
    oldest: (a, b) => String(a.lastModified).localeCompare(String(b.lastModified)),
    largest: (a, b) => b.size - a.size,
    name: (a, b) => a.key.localeCompare(b.key),
  }[sort] || ((a, b) => String(b.lastModified).localeCompare(String(a.lastModified)));
  rows = rows.slice().sort(cmp);
  return rows;
}

// Top-level folder counts for the filter chips (respects the type filter).
export function folderCounts(objects, type = 'graphics') {
  const counts = new Map();
  for (const o of objects) {
    if (type === 'graphics' && !GRAPHIC.has(extOf(o.key))) continue;
    const top = o.key.includes('/') ? o.key.slice(0, o.key.indexOf('/')) : '(root)';
    counts.set(top, (counts.get(top) || 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

function presign(key, filename) {
  return getSignedUrl(getSpacesClient(), new GetObjectCommand({
    Bucket: SPACES_BUCKET,
    Key: key,
    ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename.replace(/["\\\r\n]/g, '')}"` } : {}),
  }), { expiresIn: 3600 });
}

router.get('/', async (req, res, next) => {
  try {
    const objects = await listAll(req.query.refresh === '1');
    const type = req.query.type === 'all' ? 'all' : 'graphics';
    const rows = filterObjects(objects, {
      folder: req.query.folder ? String(req.query.folder) : '',
      q: req.query.q ? String(req.query.q) : '',
      type,
      sort: String(req.query.sort || 'newest'),
    });
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 60));
    const slice = rows.slice(offset, offset + limit);
    const items = await Promise.all(slice.map(async (o) => {
      const name = o.key.slice(o.key.lastIndexOf('/') + 1);
      const ext = extOf(o.key);
      return {
        ...o,
        name,
        ext,
        folder: o.key.includes('/') ? o.key.slice(0, o.key.lastIndexOf('/')) : '',
        previewable: PREVIEWABLE.has(ext),
        private: isPrivateKey(o.key),
        publicUrl: publicUrl(o.key),
        viewUrl: await presign(o.key),
        downloadUrl: await presign(o.key, name),
      };
    }));
    res.json({
      items,
      total: rows.length,
      offset,
      limit,
      folders: folderCounts(objects, type),
      bucketTotal: objects.length,
      truncated: objects.length >= MAX_OBJECTS,
    });
  } catch (err) { next(err); }
});

router.get('/file', async (req, res, next) => {
  try {
    const key = String(req.query.key || '');
    if (!key) return res.status(400).json({ error: 'key required' });
    const obj = await getSpacesClient().send(new GetObjectCommand({ Bucket: SPACES_BUCKET, Key: key }));
    res.setHeader('Content-Type', obj.ContentType || 'application/octet-stream');
    if (obj.ContentLength) res.setHeader('Content-Length', String(obj.ContentLength));
    res.setHeader('Cache-Control', 'private, no-store');
    obj.Body.pipe(res);
  } catch (err) {
    if (err?.name === 'NoSuchKey') return res.status(404).json({ error: 'File not found' });
    next(err);
  }
});

router.delete('/', express.json(), async (req, res, next) => {
  try {
    const keys = Array.isArray(req.body?.keys) ? req.body.keys.filter((k) => typeof k === 'string' && k) : [];
    if (keys.length === 0) return res.status(400).json({ error: 'keys required' });
    if (keys.length > 1000) return res.status(400).json({ error: 'At most 1000 files per delete' });

    const result = await getSpacesClient().send(new DeleteObjectsCommand({
      Bucket: SPACES_BUCKET,
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false },
    }));
    const deleted = (result.Deleted || []).map((d) => d.Key);
    const errors = (result.Errors || []).map((e) => ({ key: e.Key, message: e.Message }));

    // Drop library rows that pointed at the deleted files so the Art Editor
    // library and customer asset lists don't show broken tiles.
    if (deleted.length) {
      const urls = deleted.flatMap((k) => [
        publicUrl(k),
        `https://${SPACES_BUCKET}.${SPACES_REGION}.digitaloceanspaces.com/${k}`,
      ]);
      await pool.query('DELETE FROM admin_designs WHERE image_url = ANY($1)', [urls]).catch(() => {});
      await pool.query('DELETE FROM customer_assets WHERE image_url = ANY($1)', [urls]).catch(() => {});
    }

    if (cache.objects) {
      const gone = new Set(deleted);
      cache.objects = cache.objects.filter((o) => !gone.has(o.key));
    }
    res.json({ deleted, errors });
  } catch (err) { next(err); }
});

export default router;
