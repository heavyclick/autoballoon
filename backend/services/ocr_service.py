"""
OCR Service - Google Cloud Vision Integration
Returns RAW text detections with bounding boxes.
Grouping logic has been moved to detection_service.py for better control.
"""
import base64
import re
import httpx
from typing import Optional, List
from dataclasses import dataclass

from config import GOOGLE_CLOUD_API_KEY, NORMALIZED_COORD_SYSTEM
from models import ErrorCode


class OCRServiceError(Exception):
    """Custom exception for OCR service errors"""
    def __init__(self, code: ErrorCode, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass
class OCRDetection:
    """A single text detection from OCR"""
    text: str
    bounding_box: dict  # {ymin, xmin, ymax, xmax} normalized to 0-1000
    confidence: float
    
    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "bounding_box": self.bounding_box,
            "confidence": self.confidence
        }


class OCRService:
    """
    Google Cloud Vision OCR integration.
    Detects all text in an image with precise bounding boxes.
    """
    
    VISION_API_URL = "https://vision.googleapis.com/v1/images:annotate"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or GOOGLE_CLOUD_API_KEY
        if not self.api_key:
            raise ValueError("Google Cloud API key not configured")
    
    async def detect_text(
        self, 
        image_bytes: bytes, 
        image_width: int, 
        image_height: int
    ) -> List[OCRDetection]:
        """
        Detect all text in an image using Google Cloud Vision.
        Returns RAW detections - grouping is done in detection_service.
        """
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        
        payload = {
            "requests": [{
                "image": {
                    "content": image_b64
                },
                "features": [
                    {
                        "type": "TEXT_DETECTION",
                        "maxResults": 500
                    }
                ],
                "imageContext": {
                    "languageHints": ["en"],
                    "textDetectionParams": {
                        "enableTextDetectionConfidenceScore": True
                    }
                }
            }]
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.VISION_API_URL}?key={self.api_key}",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                response.raise_for_status()
                result = response.json()
        except httpx.TimeoutException:
            raise OCRServiceError(
                ErrorCode.OCR_API_ERROR,
                "Google Cloud Vision API request timed out"
            )
        except httpx.HTTPStatusError as e:
            raise OCRServiceError(
                ErrorCode.OCR_API_ERROR,
                f"Google Cloud Vision API error: {e.response.status_code}"
            )
        except Exception as e:
            raise OCRServiceError(
                ErrorCode.OCR_API_ERROR,
                f"Failed to call Google Cloud Vision API: {str(e)}"
            )
        
        detections = self._parse_response(result, image_width, image_height)
        return detections
    
    def _parse_response(
        self, 
        response: dict, 
        image_width: int, 
        image_height: int
    ) -> List[OCRDetection]:
        """Parse Google Vision API response and normalize bounding boxes."""
        detections = []
        
        try:
            responses = response.get("responses", [])
            if not responses:
                return detections
            
            annotations = responses[0].get("textAnnotations", [])
            
            # Skip first annotation (full text block), process individual words
            for annotation in annotations[1:]:
                text = annotation.get("description", "").strip()
                if not text:
                    continue
                
                vertices = annotation.get("boundingPoly", {}).get("vertices", [])
                if len(vertices) < 4:
                    continue
                
                x_coords = [v.get("x", 0) for v in vertices]
                y_coords = [v.get("y", 0) for v in vertices]
                
                xmin_px = min(x_coords)
                xmax_px = max(x_coords)
                ymin_px = min(y_coords)
                ymax_px = max(y_coords)
                
                # Normalize to 0-1000 scale
                bounding_box = {
                    "xmin": int((xmin_px / image_width) * NORMALIZED_COORD_SYSTEM),
                    "xmax": int((xmax_px / image_width) * NORMALIZED_COORD_SYSTEM),
                    "ymin": int((ymin_px / image_height) * NORMALIZED_COORD_SYSTEM),
                    "ymax": int((ymax_px / image_height) * NORMALIZED_COORD_SYSTEM),
                }
                
                # Clamp to valid range
                for key in bounding_box:
                    bounding_box[key] = max(0, min(NORMALIZED_COORD_SYSTEM, bounding_box[key]))
                
                confidence = annotation.get("confidence", 0.95)
                
                detections.append(OCRDetection(
                    text=text,
                    bounding_box=bounding_box,
                    confidence=confidence
                ))
                
        except (KeyError, IndexError, TypeError) as e:
            raise OCRServiceError(
                ErrorCode.PARSE_ERROR,
                f"Failed to parse Google Vision response: {str(e)}"
            )
        
        return detections
    
    def group_adjacent_text(
        self, 
        detections: List[OCRDetection],
        horizontal_threshold: int = 30,
        vertical_threshold: int = 15
    ) -> List[OCRDetection]:
        """
        DEPRECATED: Grouping is now done in detection_service._group_ocr_detections()
        This method is kept for backward compatibility but just returns the input.
        """
        # Return as-is - grouping is handled in detection_service
        return detections


def create_ocr_service(api_key: Optional[str] = None) -> OCRService:
    """Create OCR service instance"""
    return OCRService(api_key=api_key)
