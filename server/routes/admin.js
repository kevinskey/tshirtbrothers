import { Router } from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { fetchProducts } from '../services/ssActivewear.js';
import pool from '../db.js';

const router = Router();

router.use(authenticate, adminOnly);

// POST /sync-products - Sync products from S&S Activewear
router.post('/sync-products', async (req, res, next) => {
  try {
    const result = await fetchProducts({ limit: 500 });
    const products = result.products || [];

    let upserted = 0;
    for (const product of products) {
      await pool.query(
        `INSERT INTO products (ss_id, name, brand, category, base_price, colors, sizes, image_url, back_image_url, specifications, price_breaks, last_synced)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (ss_id) DO UPDATE SET
           name = EXCLUDED.name,
           brand = EXCLUDED.brand,
           category = EXCLUDED.category,
           base_price = EXCLUDED.base_price,
           colors = EXCLUDED.colors,
           sizes = EXCLUDED.sizes,
           image_url = EXCLUDED.image_url,
           back_image_url = EXCLUDED.back_image_url,
           specifications = EXCLUDED.specifications,
           price_breaks = EXCLUDED.price_breaks,
           last_synced = NOW()`,
        [
          product.ss_id,
          product.name,
          product.brand,
          product.category,
          product.base_price,
          JSON.stringify(product.colors || []),
          JSON.stringify(product.sizes || []),
          product.image_url,
          product.back_image_url,
          JSON.stringify(product.specifications || {}),
          JSON.stringify(product.price_breaks || []),
        ]
      );
      upserted++;
    }

    res.json({ message: 'Product sync complete', upserted });
  } catch (err) {
    next(err);
  }
});

// POST /upload-url - Generate presigned upload URL for DO Spaces
router.post('/upload-url', async (req, res, next) => {
  try {
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    const s3Client = new S3Client({
      endpoint: process.env.SPACES_ENDPOINT,
      region: process.env.SPACES_REGION,
      credentials: {
        accessKeyId: process.env.SPACES_KEY,
        secretAccessKey: process.env.SPACES_SECRET,
      },
    });

    const key = `uploads/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
      ContentType: contentType,
      ACL: 'public-read',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const fileUrl = `${process.env.SPACES_ENDPOINT}/${process.env.SPACES_BUCKET}/${key}`;

    res.json({ uploadUrl, fileUrl });
  } catch (err) {
    next(err);
  }
});

export default router;
