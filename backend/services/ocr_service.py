"""
OCR Service - Google Cloud Vision Integration
Returns raw text detections with bounding boxes.
"""
import base64
import httpx
from typing import Optional, List
from dataclasses import dataclass

from config import GOOGLE_CLOUD_API_KEY, NORMALIZED_COORD_SYSTEM
from models import ErrorCode


class OCRServiceError(Exception):
    def __init__(self, code: ErrorCode, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


@dataclass
class OCRDetection:
    """Single text detection from OCR."""
    text: str
    bounding_box: dict  # {xmin, xmax, ymin, ymax} normalized 0-1000
    confidence: float
    
    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "bounding_box": self.bounding_box,
            "confidence": self.confidence
        }


class OCRService:
    """Google Cloud Vision OCR integration."""
    
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
        """Detect text in image."""
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        
        payload = {
            "requests": [{
                "image": {"content": image_b64},
                "features": [{"type": "TEXT_DETECTION", "maxResults": 500}],
                "imageContext": {
                    "languageHints": ["en"],
                    "textDetectionParams": {"enableTextDetectionConfidenceScore": True}
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
            raise OCRServiceError(ErrorCode.OCR_API_ERROR, "OCR request timed out")
        except httpx.HTTPStatusError as e:
            raise OCRServiceError(ErrorCode.OCR_API_ERROR, f"OCR error: {e.response.status_code}")
        except Exception as e:
            raise OCRServiceError(ErrorCode.OCR_API_ERROR, f"OCR failed: {str(e)}")
        
        return self._parse_response(result, image_width, image_height)
    
    def _parse_response(
        self, 
        response: dict, 
        width: int, 
        height: int
    ) -> List[OCRDetection]:
        """Parse Vision API response."""
        detections = []
        
        try:
            responses = response.get("responses", [])
            if not responses:
                return detections
            
            annotations = responses[0].get("textAnnotations", [])
            
            # Skip first (full text), process individual words
            for ann in annotations[1:]:
                text = ann.get("description", "").strip()
                if not text:
                    continue
                
                vertices = ann.get("boundingPoly", {}).get("vertices", [])
                if len(vertices) < 4:
                    continue
                
                x_coords = [v.get("x", 0) for v in vertices]
                y_coords = [v.get("y", 0) for v in vertices]
                
                # Normalize to 0-1000
                box = {
                    "xmin": int((min(x_coords) / width) * NORMALIZED_COORD_SYSTEM),
                    "xmax": int((max(x_coords) / width) * NORMALIZED_COORD_SYSTEM),
                    "ymin": int((min(y_coords) / height) * NORMALIZED_COORD_SYSTEM),
                    "ymax": int((max(y_coords) / height) * NORMALIZED_COORD_SYSTEM),
                }
                
                # Clamp
                for k in box:
                    box[k] = max(0, min(NORMALIZED_COORD_SYSTEM, box[k]))
                
                detections.append(OCRDetection(
                    text=text,
                    bounding_box=box,
                    confidence=ann.get("confidence", 0.95)
                ))
                
        except Exception as e:
            raise OCRServiceError(ErrorCode.PARSE_ERROR, f"Parse error: {str(e)}")
        
        return detections


def create_ocr_service(api_key: Optional[str] = None) -> OCRService:
    return OCRService(api_key=api_key)
