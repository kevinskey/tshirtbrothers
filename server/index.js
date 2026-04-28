import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdir, readFile } from 'fs/promises';
import pool from './db.js';

import productsRouter from './routes/products.js';
import categoriesRouter from './routes/categories.js';
import quotesRouter from './routes/quotes.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import designRouter from './routes/design.js';
import designsRouter from './routes/designs.js';
import paymentsRouter from './routes/payments.js';
import shippingRouter from './routes/shipping.js';
import invoicesRouter from './routes/invoices.js';
import blogRouter from './routes/blog.js';
import deepseekRouter from './routes/deepseek.js';
import gangsheetRouter from './routes/gangsheet.js';
import embroideryRouter from './routes/embroidery.js';
import mockupsRouter from './routes/mockups.js';
import localBusinessesRouter from './routes/localBusinesses.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.set('trust proxy', 1);
app.use(cors());

// Stripe webhook needs raw body - must come before json parser
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(join(__dirname, 'uploads')));

// API routes
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/quotes', quotesRouter);
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/design', designRouter);
app.use('/api/designs', designsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/shipping', shippingRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/blog', blogRouter);
app.use('/api/deepseek', deepseekRouter);
app.use('/api/admin/gangsheets', gangsheetRouter);
app.use('/api/admin', embroideryRouter);
app.use('/api', mockupsRouter);
app.use('/api/local-businesses', localBusinessesRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(statusCode).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`T-Shirt Brothers API running on port ${PORT}`);
  runBootMigrations().catch((err) => {
    console.error('[migrations] fatal:', err);
  });
});

// Apply every SQL file in ./migrations on boot. All migrations use
// IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so repeated runs are safe.
//
// We also keep a schema_migrations table so we never re-run a file that
// already succeeded (or that failed with a benign "must be owner" error
// because the schema change is already present in the DB).
async function runBootMigrations() {
  const dir = join(__dirname, 'migrations');
  let files;
  try {
    files = await readdir(dir);
  } catch {
    console.log('[migrations] no migrations directory, skipping');
    return;
  }

  // Ensure the tracking table exists. If we can't create it (no privs),
  // we just fall back to running every migration every boot.
  let haveTrackingTable = false;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    haveTrackingTable = true;
  } catch (err) {
    console.warn('[migrations] no schema_migrations table:', err.message);
  }

  let applied = new Set();
  if (haveTrackingTable) {
    try {
      const { rows } = await pool.query('SELECT filename FROM schema_migrations');
      applied = new Set(rows.map((r) => r.filename));
    } catch { /* ignore */ }
  }

  const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();
  for (const file of sqlFiles) {
    if (applied.has(file)) continue;
    try {
      const sql = await readFile(join(dir, file), 'utf-8');
      await pool.query(sql);
      console.log(`[migrations] applied ${file}`);
      if (haveTrackingTable) {
        await pool.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
      }
    } catch (err) {
      const benign = /must be owner of/i.test(err.message || '');
      console.error(`[migrations] ${file} failed:`, err.message);
      // If the error is just "not the owner" it means the schema change is
      // already present (another role applied it). Record the file so we
      // don't keep retrying and spamming logs every boot.
      if (benign && haveTrackingTable) {
        try {
          await pool.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
        } catch { /* ignore */ }
      }
    }
  }
}

export default app;
