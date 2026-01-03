/**
 * Image Cropping Utility
 * Creates high-quality zoomed thumbnails of dimension text from blueprint images
 */

/**
 * Crops a dimension from the blueprint image with intelligent padding
 * @param {string} blueprintImageSrc - Base64 or URL of the blueprint image
 * @param {object} dimension - Dimension object with bounding_box
 * @returns {Promise<string>} Base64 data URL of the cropped image
 */
export async function cropDimensionImage(blueprintImageSrc, dimension) {
  return new Promise((resolve, reject) => {
    if (!dimension || !dimension.bounding_box) {
      reject(new Error('Invalid dimension data'));
      return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    // Enable CORS for external images
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const { xmin, ymin, xmax, ymax } = dimension.bounding_box;

        // CRITICAL: Convert from normalized 0-1000 scale to actual pixel coordinates
        const actualXmin = (xmin / 1000) * img.width;
        const actualYmin = (ymin / 1000) * img.height;
        const actualXmax = (xmax / 1000) * img.width;
        const actualYmax = (ymax / 1000) * img.height;

        // Calculate text dimensions in pixels
        const textWidth = actualXmax - actualXmin;
        const textHeight = actualYmax - actualYmin;

        // Smart padding based on text size
        // More padding for small text (to show context)
        // Less padding for large text (to avoid too much whitespace)
        let paddingX = Math.max(30, textWidth * 0.35);
        let paddingY = Math.max(20, textHeight * 0.45);

        // Detect multi-line text by aspect ratio
        const aspectRatio = textHeight / textWidth;
        const isMultiLine = aspectRatio > 0.4;

        if (isMultiLine) {
          paddingY *= 1.5; // Extra vertical padding for multi-line
        }

        // Detect long text
        const isLongText = textWidth > 200;
        if (isLongText) {
          paddingX = Math.max(40, textWidth * 0.25); // Less relative padding for long text
        }

        // Calculate crop region (constrained to image bounds)
        const cropX = Math.max(0, actualXmin - paddingX);
        const cropY = Math.max(0, actualYmin - paddingY);
        const cropWidth = Math.min(img.width - cropX, textWidth + 2 * paddingX);
        const cropHeight = Math.min(img.height - cropY, textHeight + 2 * paddingY);

        // Ensure minimum crop size
        const minWidth = 100;
        const minHeight = 60;
        const finalWidth = Math.max(minWidth, cropWidth);
        const finalHeight = Math.max(minHeight, cropHeight);

        // Set canvas size (2x for high resolution / retina displays)
        const scale = 2;
        canvas.width = finalWidth * scale;
        canvas.height = finalHeight * scale;

        // Enable high-quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw the cropped region
        ctx.drawImage(
          img,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );

        // Optional: Add subtle border for definition
        ctx.strokeStyle = 'rgba(230, 57, 70, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

        // Convert to data URL
        const croppedDataURL = canvas.toDataURL('image/png', 0.95);
        resolve(croppedDataURL);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load blueprint image'));
    };

    img.src = blueprintImageSrc;
  });
}

/**
 * Batch crop multiple dimensions at once
 * @param {string} blueprintImageSrc - Base64 or URL of the blueprint image
 * @param {Array} dimensions - Array of dimension objects
 * @returns {Promise<Map>} Map of dimension IDs to cropped images
 */
export async function batchCropDimensions(blueprintImageSrc, dimensions) {
  const results = new Map();

  for (const dimension of dimensions) {
    try {
      const croppedImage = await cropDimensionImage(blueprintImageSrc, dimension);
      results.set(dimension.id, croppedImage);
    } catch (error) {
      console.error(`Failed to crop dimension ${dimension.id}:`, error);
      results.set(dimension.id, null);
    }
  }

  return results;
}
