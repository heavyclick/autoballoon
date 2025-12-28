"""
Region Detection Endpoint - For Add Balloon OCR feature
POST /api/detect-region

Takes a cropped image region and returns detected dimension text.

USAGE: Add this endpoint to your main FastAPI app (main.py):

    from api.detect_region import detect_region, RegionDetectRequest
    
    @app.post("/api/detect-region")
    async def detect_region_endpoint(request: RegionDetectRequest):
        return await detect_region(request)

OR if you use APIRouter, add this file to your api folder and include it.
"""
from pydantic import BaseModel
import base64
import re
from typing import Optional, List


class RegionDetectRequest(BaseModel):
    """Request body for region detection."""
    image: str  # Base64 encoded cropped image
    width: int
    height: int


class RegionDetectResponse(BaseModel):
    """Response with detected text."""
    success: bool
    detected_text: Optional[str] = None
    dimensions: Optional[List[dict]] = None
    error: Optional[str] = None


async def detect_region(request: RegionDetectRequest) -> RegionDetectResponse:
    """
    Detect dimension text in a cropped image region.
    
    This endpoint is called when a user draws a rectangle in Add Balloon mode.
    It runs OCR on the cropped region to extract the dimension value.
    """
    try:
        # Import your existing services
        from services.ocr_service import create_ocr_service
        from config import GOOGLE_CLOUD_API_KEY
        
        # Decode the image
        image_bytes = base64.b64decode(request.image)
        
        detected_text = None
        
        # Run OCR on the cropped region
        if GOOGLE_CLOUD_API_KEY:
            try:
                ocr_service = create_ocr_service(GOOGLE_CLOUD_API_KEY)
                ocr_results = await ocr_service.detect_text(
                    image_bytes, 
                    request.width, 
                    request.height
                )
                
                if ocr_results:
                    # Combine all detected text tokens
                    texts = [r.text for r in ocr_results if r.text.strip()]
                    if texts:
                        # Join with space
                        combined = ' '.join(texts)
                        
                        # Clean up common OCR issues
                        combined = _clean_ocr_text(combined)
                        
                        if combined and _looks_like_dimension(combined):
                            detected_text = combined
                            
            except Exception as e:
                print(f"OCR detection failed: {e}")
        
        if detected_text:
            return RegionDetectResponse(
                success=True,
                detected_text=detected_text,
                dimensions=[{"value": detected_text}]
            )
        else:
            return RegionDetectResponse(
                success=False,
                error="No dimension text detected in region"
            )
            
    except Exception as e:
        print(f"Region detection error: {e}")
        return RegionDetectResponse(
            success=False,
            error=str(e)
        )


def _clean_ocr_text(text: str) -> str:
    """Clean up common OCR artifacts."""
    if not text:
        return ""
    
    # Remove extra whitespace
    text = ' '.join(text.split())
    
    # Common OCR fixes
    replacements = [
        ('|', 'l'),      # Pipe often misread as l
        ('O', '0'),      # Only if followed by digits (handled below)
        ('  ', ' '),     # Double spaces
    ]
    
    for old, new in replacements:
        if old == 'O':
            # Only replace O with 0 if it looks like a number context
            text = re.sub(r'O(?=\d)', '0', text)
            text = re.sub(r'(?<=\d)O', '0', text)
        else:
            text = text.replace(old, new)
    
    return text.strip()


def _looks_like_dimension(text: str) -> bool:
    """Quick check if text looks like a dimension value."""
    if not text or len(text.strip()) < 1:
        return False
    
    text = text.strip()
    
    # Must have at least one digit
    if not any(c.isdigit() for c in text):
        return False
    
    # Common dimension patterns
    patterns = [
        r'\d+\.?\d*["\']',           # 0.5", 0.45", 25'
        r'\d+\.?\d*\s*(?:in|mm|cm)', # 0.5in, 25mm
        r'\d+\s*/\s*\d+',            # 1/4, 3/8
        r'[ØøR]\s*\d+',              # Ø5, R2
        r'M\s*\d+',                   # M8
        r'\d+\s*[-–]\s*\d+',         # 6-32, 1/4-20
        r'\d+\.\d{2,}',              # 0.250, 0.45 (2+ decimal places)
        r'\d+\s*[xX]\s*',            # 4x, 2X
        r'Teeth',                     # 21 Teeth
        r'Pitch',                     # 0.080in Pitch
        r'Diameter',                  # Shaft Diameter
        r'Width',                     # Belt Width
        r'Lg\.',                      # Lg. (length)
        r'Wd\.',                      # Wd. (width)
    ]
    
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)
