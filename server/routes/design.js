import { Router } from 'express';
import { generateDesign } from '../services/openai.js';

const router = Router();

// POST /generate - Generate a design with AI
router.post('/generate', async (req, res, next) => {
  try {
    const { prompt, color, garmentType } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const imageUrl = await generateDesign(prompt, color, garmentType);

    res.json({ imageUrl });
  } catch (err) {
    next(err);
  }
});

export default router;
