import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import productsRouter from './routes/products.js';
import categoriesRouter from './routes/categories.js';
import quotesRouter from './routes/quotes.js';
import authRouter from './routes/auth.js';
import adminRouter from './routes/admin.js';
import designRouter from './routes/design.js';
import designsRouter from './routes/designs.js';
import paymentsRouter from './routes/payments.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
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
});

export default app;
