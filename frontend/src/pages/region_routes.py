"""
Region Routes - Smart Manual Ballooning
Handles OCR and parsing for specific user-selected regions of an image.
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from PIL import Image
import io
import os

from services.detection_service import create_detection_service

router = APIRouter()

def get_detection_service():
    """Helper to initialize service with keys."""
    return create_detection_service(
        ocr_api_key=os.getenv("GOOGLE_CLOUD_API_KEY"),
        gemini_api_key=os.getenv("GEMINI_API_KEY")
    )

@router.post("/detect-region")
async def detect_region(
    file: UploadFile = File(...),
    xmin: float = Form(...),
    xmax: float = Form(...),
    ymin: float = Form(...),
    ymax: float = Form(...)
):
    """
    Smart Extract: Receives an image and crop coordinates.
    Returns the parsed engineering data (value, tolerance, limits) found in that box.
    """
    try:
        # 1. Read and Load Image
        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Empty file")
            
        image = Image.open(io.BytesIO(image_bytes))
        
        # 2. Calculate Crop Box
        # Coordinates come in normalized 0-1000 format
        w, h = image.size
        
        # Clamp coordinates
        xmin = max(0, min(1000, xmin))
        xmax = max(0, min(1000, xmax))
        ymin = max(0, min(1000, ymin))
        ymax = max(0, min(1000, ymax))
        
        # Convert to pixels
        left = (xmin / 1000) * w
        top = (ymin / 1000) * h
        right = (xmax / 1000) * w
        bottom = (ymax / 1000) * h
        
        # Ensure valid box
        if right <= left or bottom <= top:
             raise HTTPException(status_code=400, detail="Invalid coordinates")

        # 3. Crop
        cropped = image.crop((left, top, right, bottom))
        
        # Convert crop back to bytes for OCR service
        crop_byte_arr = io.BytesIO()
        cropped.save(crop_byte_arr, format='PNG')
        crop_bytes = crop_byte_arr.getvalue()

        # 4. Run OCR on the crop
        service = get_detection_service()
        
        # Use existing OCR service (pass crop dimensions)
        detections = await service.ocr_service.detect_text(
            crop_bytes, 
            cropped.width, 
            cropped.height
        )
        
        if not detections:
            return {
                "success": False, 
                "message": "No text found in selected region"
            }

        # 5. Parse Logic
        # Combine all found words into one string (e.g. "Ø" + "0.250" -> "Ø 0.250")
        full_text = " ".join([d.text for d in detections])
        
        # Run the parsing engine
        parsed_data = service._parse_dimension_value(full_text, "in")

        return {
            "success": True,
            "text": full_text,
            "parsed": parsed_data,
            "confidence": detections[0].confidence if detections else 0.0
        }

    except Exception as e:
        print(f"Region detection error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
