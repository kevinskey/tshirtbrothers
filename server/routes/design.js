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

// POST /remove-bg - Remove background from an uploaded image using remove.bg
router.post('/remove-bg', async (req, res, next) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    const apiKey = process.env.REMOVEBG_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Background removal not configured' });
    }

    // Strip data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const formData = new FormData();
    formData.append('image_file_b64', base64Data);
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return res.status(response.status).json({ error: `remove.bg error: ${errText}` });
    }

    const buffer = await response.arrayBuffer();
    const resultBase64 = Buffer.from(buffer).toString('base64');
    res.json({ imageBase64: `data:image/png;base64,${resultBase64}` });
  } catch (err) {
    next(err);
  }
});

export default router;
