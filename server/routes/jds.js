import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { fetchJdsProducts } from '../services/jds.js';

const router = Router();
router.use(authenticate, adminOnly);

// POST /lookup { skus: string[] } — product details, pricing tiers, and
// inventory for up to 100 JDS SKUs.
router.post('/lookup', async (req, res, next) => {
  try {
    const skus = Array.isArray(req.body?.skus) ? req.body.skus.map(String) : [];
    if (!skus.length) return res.status(400).json({ error: 'skus is required' });
    if (skus.length > 100) return res.status(400).json({ error: 'max 100 SKUs per lookup' });
    res.json(await fetchJdsProducts(skus));
  } catch (err) {
    next(err);
  }
});

export default router;
