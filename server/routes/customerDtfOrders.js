import { Router } from 'express';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import pool from '../db.js';
import { orderSheets } from '../lib/dtfCart.js';
import { authenticate } from '../middleware/auth.js';
import { getSpacesClient, SPACES_BUCKET } from '../services/spaces.js';

const columns = `id, sheets_json, file_key, width_in, length_ft, file_width_px, file_height_px,
  date_needed::text AS date_needed, tier, delivery, price_cents, shipping_cents, status, created_at`;
// Always resolve email from the current account row, never from request input.
// Pending/unpaid uploads are not purchases and are excluded from the library.
const ownership = `(user_id = $1 OR lower(customer_email) =
  (SELECT lower(email) FROM users WHERE id = $1 AND deleted_at IS NULL))
  AND status IN ('paid', 'in_production', 'ready', 'completed', 'shipped')`;

async function signDownload(order) {
  return getSignedUrl(getSpacesClient(), new GetObjectCommand({
    Bucket: SPACES_BUCKET, Key: order.file_key,
    ResponseContentDisposition: `attachment; filename="TSB-DTF-${order.id}-sheet-${(order.sheet_index || 0) + 1}.png"`,
  }), { expiresIn: 900 });
}

export function createCustomerDtfOrdersRouter({ db = pool, sign = signDownload } = {}) {
  const router = Router();
  router.use(authenticate);
  router.get('/', async (req, res, next) => {
    try {
      const { rows } = await db.query(`SELECT ${columns} FROM gang_sheet_orders
        WHERE ${ownership} ORDER BY created_at DESC LIMIT 100`, [req.user.id]);
      // Listing orders must work even if file storage is temporarily unavailable.
      res.json(rows.map(({ file_key, sheets_json, ...order }) => ({ ...order,
        sheets: orderSheets({ ...order, file_key, sheets_json }).map(({ file_key: key, layout, ...sheet }) => sheet),
      })));
    } catch (err) { next(err); }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isSafeInteger(id) || id < 1) return res.status(404).json({ error: 'Order not found' });
      const { rows } = await db.query(`SELECT ${columns} FROM gang_sheet_orders
        WHERE ${ownership} AND id = $2`, [req.user.id, id]);
      if (!rows.length) return res.status(404).json({ error: 'Order not found' });
      const order = rows[0];
      // Durable key is returned only to the owner, allowing a fresh checkout
      // from the original file without reuploading or silently charging again.
      const sheets = await Promise.all(orderSheets(order).map(async (sheet, index) => ({ ...sheet,
        download_url: await sign({ ...order, ...sheet, sheet_index: index }),
      })));
      res.json({ ...order, sheets, download_url: sheets[0]?.download_url || null });
    } catch (err) { next(err); }
  });
  return router;
}

export default createCustomerDtfOrdersRouter();
