/**
 * OCR API Route - Google Cloud Vision Integration
 */

import { Router } from 'express';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Extract base64 data
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const visionApiKey = process.env.GOOGLE_VISION_API_KEY;

    if (!visionApiKey) {
      return res.status(500).json({ error: 'Google Vision API key not configured' });
    }

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Data },
              features: [
                {
                  type: 'DOCUMENT_TEXT_DETECTION',
                  maxResults: 100,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Vision API error: ${response.statusText}`);
    }

    const data = await response.json();
    const textAnnotations = data.responses?.[0]?.textAnnotations;

    if (!textAnnotations || textAnnotations.length === 0) {
      return res.json({ text: '', confidence: 0 });
    }

    // First annotation is the full text
    const fullText = textAnnotations[0].description || '';
    const confidence = textAnnotations[0].confidence || 0;

    return res.json({
      text: fullText,
      confidence,
    });
  } catch (error: any) {
    console.error('OCR error:', error);
    return res.status(500).json({
      error: 'OCR failed',
      message: error.message,
    });
  }
});

export default router;
