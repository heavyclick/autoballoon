/**
 * Gemini API Route - Semantic Dimension Structuring
 */

import { Router } from 'express';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'No text provided' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Gemini API key not configured' });
    }

    const prompt = `You are an expert in engineering drawings and manufacturing specifications.

Parse the following dimension text into structured JSON:

Input: "${text}"

Output must be valid JSON with this exact schema:
{
  "nominal": number or null,
  "plus_tolerance": number or null,
  "minus_tolerance": number or null,
  "units": "in" | "mm" | "deg" | null,
  "tolerance_type": "bilateral" | "limit" | "fit" | "basic" | null,
  "subtype": "Linear" | "Diameter" | "Radius" | "Angle" | "Thread" | "GD&T" | "Note" | null,
  "is_gdt": boolean,
  "gdt_symbol": string or null,
  "fit_class": string or null,
  "thread_spec": string or null,
  "upper_limit": number or null,
  "lower_limit": number or null,
  "full_specification": string
}

Rules:
1. If tolerance is ±X, set both plus_tolerance and minus_tolerance to X
2. If limits like "2.5-2.8", set upper_limit=2.8, lower_limit=2.5, tolerance_type="limit"
3. Detect diameter (Ø), radius (R), angle (∠) symbols
4. Extract GD&T symbols (⌖, ⏥, etc.) if present
5. Thread specs like "1/4-20 UNC" go in thread_spec
6. Default units to "in" unless "mm" is explicit

Return ONLY the JSON object, no explanation.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!generatedText) {
      throw new Error('No response from Gemini');
    }

    // Extract JSON from markdown code blocks if present
    let jsonText = generatedText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const parsed = JSON.parse(jsonText);

    return res.json({
      success: true,
      parsed,
      raw_text: text,
    });
  } catch (error: any) {
    console.error('Gemini API error:', error);
    return res.status(500).json({
      error: 'Failed to parse dimension',
      message: error.message,
    });
  }
});

export default router;
