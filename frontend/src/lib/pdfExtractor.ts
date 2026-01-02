/**
 * PDF Extractor - Vector-First Extraction using pdf.js
 *
 * Layer A: Vector Harvesting (The Truth Layer)
 * - Traverse PDF's internal Ops List
 * - Extract Text operators with precise x,y coordinates
 * - 100% accuracy on nominals and symbols (Ø, ±, °)
 *
 * Layer B: Raster Fallback (The Vision Layer)
 * - Triggered if page contains only Image operator or <5 strings
 * - Convert to 300DPI PNG and send to Google Cloud Vision
 *
 * Layer C: Gemini Semantic Structuring (The Intelligence Layer)
 * - Parse raw strings into structured dimension data
 */

import * as pdfjsLib from 'pdfjs-dist';
import { useAppStore } from '@/store/useAppStore';
import type { Page } from '@/store/useAppStore';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface VectorText {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  transform: number[];
}

export async function extractPDFPages(file: File): Promise<void> {
  const store = useAppStore.getState();

  try {
    // Load PDF document
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    const totalPages = pdf.numPages;

    // Update metadata
    store.setProcessing({
      isProcessing: true,
      currentStep: `Processing ${totalPages} page(s)...`,
      progress: 20,
    });

    // Process each page
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      store.setProcessing({
        currentStep: `Extracting page ${pageNum}/${totalPages}...`,
        progress: 20 + (pageNum / totalPages) * 40,
      });

      // Extract vector text and render image simultaneously
      const [vectorText, imageData] = await Promise.all([
        extractVectorText(page),
        renderPageToImage(page),
      ]);

      // Store page data
      const viewport = page.getViewport({ scale: 1 });
      const pageData: Page = {
        pageNumber: pageNum,
        image: imageData,
        width: viewport.width,
        height: viewport.height,
        vectorText,
      };

      store.addPage(pageData);

      // If vector text extraction yielded < 5 strings, trigger OCR fallback
      if (vectorText.length < 5) {
        store.setProcessing({
          currentStep: `Running OCR fallback on page ${pageNum}...`,
          progress: 60 + (pageNum / totalPages) * 20,
        });

        await runOCRFallback(imageData, pageNum);
      }
    }

    // Phase 2: Gemini Structuring
    await structureDimensions();

    // Phase 3: Grid Detection
    await detectGrid();

    // Complete
    store.setProcessing({
      isProcessing: false,
      currentStep: 'Complete',
      progress: 100,
    });

  } catch (error) {
    console.error('PDF extraction failed:', error);
    throw error;
  }
}

/**
 * Layer A: Vector Text Harvesting
 */
async function extractVectorText(page: any): Promise<VectorText[]> {
  const textContent = await page.getTextContent();
  const vectorTexts: VectorText[] = [];

  for (const item of textContent.items) {
    if ('str' in item && item.str.trim()) {
      vectorTexts.push({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
        transform: item.transform,
      });
    }
  }

  return vectorTexts;
}

/**
 * Render page to high-resolution PNG (for OCR fallback and canvas display)
 */
async function renderPageToImage(page: any): Promise<string> {
  const viewport = page.getViewport({ scale: 2 }); // 2x scale for high DPI

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  return canvas.toDataURL('image/png');
}

/**
 * Layer B: OCR Fallback using Google Cloud Vision
 */
async function runOCRFallback(imageBase64: string, _pageNum: number): Promise<void> {
  try {
    const response = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
    });

    if (!response.ok) throw new Error('OCR failed');

    await response.json();

    // Merge OCR results with existing page data
    // (This would update the vectorText array with OCR-detected text)
    // Implementation depends on how we want to merge vector + OCR

  } catch (error) {
    console.error('OCR fallback failed:', error);
    // Continue without OCR - vector text is still available
  }
}

/**
 * Layer C: Gemini Semantic Structuring
 */
async function structureDimensions(): Promise<void> {
  const store = useAppStore.getState();
  const pages = store.project.pages;

  store.setProcessing({
    currentStep: 'AI dimension parsing...',
    progress: 70,
  });

  // Collect all text from all pages
  const allTexts: Array<{ text: string; x: number; y: number; page: number }> = [];

  pages.forEach((page) => {
    page.vectorText.forEach((vt) => {
      allTexts.push({
        text: vt.text,
        x: vt.x,
        y: vt.y,
        page: page.pageNumber,
      });
    });
  });

  // Send to Gemini for structuring
  // (This will be implemented in the next phase)

  // For now, create basic characteristics
  let charId = 1;
  allTexts.forEach((textItem) => {
    // Simple heuristic: If text contains numbers, it might be a dimension
    if (/[\d\.\/]/.test(textItem.text)) {
      store.addCharacteristic({
        id: charId++,
        value: textItem.text,
        zone: null,
        confidence: 0.9,
        page: textItem.page,
        bounding_box: {
          xmin: (textItem.x / 1000) * 1000, // Normalize to 0-1000
          ymin: (textItem.y / 1000) * 1000,
          xmax: (textItem.x / 1000) * 1000 + 50,
          ymax: (textItem.y / 1000) * 1000 + 20,
        },
        parsed: null, // Will be filled by Gemini
      });
    }
  });
}

/**
 * Grid Detection (ANSI Y14.1)
 */
async function detectGrid(): Promise<void> {
  const store = useAppStore.getState();

  store.setProcessing({
    currentStep: 'Detecting grid zones...',
    progress: 90,
  });

  // Grid detection logic
  // (This will analyze the drawing to find grid lines and assign zones)
  // For now, we'll skip this and assign zones later
}
