"""
API Routes - Unified Version
Handles file upload, processing, export, and smart region detection.
Compatible with both single-page and multi-page PDFs.
"""
from typing import Optional, List
from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io
import os
import json
from PIL import Image

from models.schemas import (
    ExportFormat, 
    ExportTemplate, 
    ExportRequest,
    ExportMetadata,
)

# Services
from services.export_service import export_service
from services.alignment_service import alignment_service
from services.detection_service import create_detection_service
from services.cmm_parser_service import cmm_parser_service
from services.sampling_service import sampling_service

# We DO NOT import region_routes here anymore to avoid the ImportError.
# The logic is now integrated directly below.

router = APIRouter()

# ==================
# Data Models
# ==================

class SamplingRequest(BaseModel):
    lot_size: int
    aql: float
    level: str

# ==================
# Helper function to create detection service
# ==================

def get_detection_service():
    """Create detection service with API keys from environment"""
    return create_detection_service(
        ocr_api_key=os.getenv("GOOGLE_CLOUD_API_KEY"),
        gemini_api_key=os.getenv("GEMINI_API_KEY")
    )


# ==================
# API Endpoints
# ==================

@router.post("/process")
async def process_drawing(file: UploadFile = File(...)):
    """
    Process uploaded engineering drawing (PDF or image).
    
    Supports:
    - Multi-page PDF (up to 20 pages)
    - Single images (PNG, JPEG)
    
    Returns:
    - All pages with base64 images
    - Dimensions with sequential balloon numbers across all pages
    - Grid detection status per page
    """
    # Create detection service inside function (not as parameter)
    detection_service = get_detection_service()
    
    # Read file bytes
    file_bytes = await file.read()
    
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Empty file uploaded")
    
    # Process file (handles both PDF and images)
    result = await detection_service.detect_dimensions_multipage(
        file_bytes=file_bytes,
        filename=file.filename
    )
    
    if not result.success:
        raise HTTPException(
            status_code=422, 
            detail=result.error_message or "Failed to process file"
        )
    
    # Build response - compatible with both old and new frontend
    response_data = {
        "success": True,
        "total_pages": result.total_pages,
        "message": result.error_message,  # e.g., "Processed 20 of 25 pages"
    }
    
    # Multi-page response format
    if result.total_pages > 1:
        pages = []
        for page_result in result.pages:
            pages.append({
                "page_number": page_result.page_number,
                "image": page_result.image_base64,
                "width": page_result.width,
                "height": page_result.height,
                "dimensions": [
                    {
                        "id": dim.id,
                        "value": dim.value,
                        "zone": dim.zone,
                        "page": dim.page,
                        "bounding_box": {
                            "xmin": dim.bounding_box.xmin,
                            "ymin": dim.bounding_box.ymin,
                            "xmax": dim.bounding_box.xmax,
                            "ymax": dim.bounding_box.ymax,
                        },
                        "confidence": dim.confidence,
                        "parsed": dim.parsed
                    }
                    for dim in page_result.dimensions
                ],
                "grid_detected": page_result.grid_detected
            })
        response_data["pages"] = pages
        
        # Also include flattened dimensions for backward compatibility
        response_data["dimensions"] = [
            {
                "id": dim.id,
                "value": dim.value,
                "zone": dim.zone,
                "page": dim.page,
                "bounding_box": {
                    "xmin": dim.bounding_box.xmin,
                    "ymin": dim.bounding_box.ymin,
                    "xmax": dim.bounding_box.xmax,
                    "ymax": dim.bounding_box.ymax,
                },
                "confidence": dim.confidence,
                "parsed": dim.parsed
            }
            for dim in result.all_dimensions
        ]
    else:
        # Single page - backward compatible format
        if result.pages:
            page = result.pages[0]
            response_data["image"] = page.image_base64
            response_data["dimensions"] = [
                {
                    "id": dim.id,
                    "value": dim.value,
                    "zone": dim.zone,
                    "bounding_box": {
                        "xmin": dim.bounding_box.xmin,
                        "ymin": dim.bounding_box.ymin,
                        "xmax": dim.bounding_box.xmax,
                        "ymax": dim.bounding_box.ymax,
                    },
                    "confidence": dim.confidence,
                    "parsed": dim.parsed
                }
                for dim in page.dimensions
            ]
            response_data["grid"] = {
                "detected": page.grid_detected,
                "columns": ["H", "G", "F", "E", "D", "C", "B", "A"],
                "rows": ["4", "3", "2", "1"]
            }
            response_data["metadata"] = {
                "filename": file.filename,
                "width": page.width,
                "height": page.height
            }
    
    return response_data


# ==================
# NEW ENDPOINT: Detect Region (Merged from region_routes.py)
# ==================
@router.post("/detect-region")
async def detect_region(
    file: UploadFile = File(...),
    xmin: float = Form(...),
    xmax: float = Form(...),
    ymin: float = Form(...),
    ymax: float = Form(...)
):
    """
    Smart Extract: Receives an image and crop coordinates (0-1000 scale).
    Returns the parsed engineering data (value, tolerance, limits) found in that box.
    """
    try:
        # 1. Read and Load Image
        image_bytes = await file.read()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="Empty file")
            
        image = Image.open(io.BytesIO(image_bytes))
        
        # 2. Calculate Crop Box
        # Coordinates come in normalized 0-1000 format from frontend
        w, h = image.size
        
        # Clamp coordinates to ensure valid crop
        xmin = max(0, min(1000, float(xmin)))
        xmax = max(0, min(1000, float(xmax)))
        ymin = max(0, min(1000, float(ymin)))
        ymax = max(0, min(1000, float(ymax)))
        
        # Convert to pixels
        left = (xmin / 1000) * w
        top = (ymin / 1000) * h
        right = (xmax / 1000) * w
        bottom = (ymax / 1000) * h
        
        # Ensure valid box size
        if (right - left) < 5 or (bottom - top) < 5:
             raise HTTPException(status_code=400, detail="Selected region is too small")

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
                "message": "No text found in selected region",
                "text": ""
            }

        # 5. Parse Logic
        # Combine all found words into one string (e.g. "Ø" + "0.250" -> "Ø 0.250")
        full_text = " ".join([d.text for d in detections])
        
        # Run the parsing engine (This uses the updated detection_service with Fits/Tolerances)
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


@router.post("/compare")
async def compare_revisions(
    file_a: UploadFile = File(...),
    file_b: UploadFile = File(...)
):
    """
    Compare two revisions using Computer Vision Alignment (Homography).
    Matches dimensions despite rotation, shifting, or scanning artifacts.
    Returns Revision B with IDs anchored to Revision A.
    """
    detection_service = get_detection_service()

    # 1. Process Rev A (Reference)
    bytes_a = await file_a.read()
    result_a = await detection_service.detect_dimensions_multipage(bytes_a, file_a.filename)
    
    # 2. Process Rev B (Target)
    bytes_b = await file_b.read()
    result_b = await detection_service.detect_dimensions_multipage(bytes_b, file_b.filename)

    if not result_a.success or not result_b.success:
        raise HTTPException(status_code=422, detail="Failed to process one or both files for comparison")

    # NOTE: Currently supports single-page comparison for reliability.
    # Future: Loop through pages if multi-page.
    page_a = result_a.pages[0] if result_a.pages else None
    page_b = result_b.pages[0] if result_b.pages else None

    if not page_a or not page_b:
        raise HTTPException(status_code=422, detail="One of the files contains no readable pages")

    # 3. Perform Alignment & Comparison via OpenCV
    processed_dims_b, removed_dims, stats = alignment_service.align_and_compare(
        img_a_b64=page_a.image_base64,
        img_b_b64=page_b.image_base64,
        dims_a=page_a.dimensions,
        dims_b=page_b.dimensions
    )

    # 4. Construct Response
    return {
        "success": True,
        "summary": stats,
        "image": page_b.image_base64, # Return Rev B image (users want to see the new drawing)
        "dimensions": [
            {
                "id": dim.id,
                "value": dim.value,
                "status": getattr(dim, "status", "unknown"),
                "old_value": getattr(dim, "old_value", None),
                "bounding_box": {
                    "xmin": dim.bounding_box.xmin,
                    "ymin": dim.bounding_box.ymin,
                    "xmax": dim.bounding_box.xmax,
                    "ymax": dim.bounding_box.ymax,
                },
                "zone": dim.zone,
                "confidence": getattr(dim, "confidence", 0.0),
                "parsed": dim.parsed
            }
            for dim in processed_dims_b
        ],
        "removed_dimensions": [
            {
                "id": dim.id,
                "value": dim.value,
                "status": "removed",
                "bounding_box": { # Return A coords for removed items (ghosts)
                    "xmin": dim.bounding_box.xmin,
                    "ymin": dim.bounding_box.ymin,
                    "xmax": dim.bounding_box.xmax,
                    "ymax": dim.bounding_box.ymax,
                },
                "zone": dim.zone
            }
            for dim in removed_dims
        ],
        "metadata": {
            "filename": file_b.filename,
            "width": page_b.width,
            "height": page_b.height
        }
    }


@router.post("/export")
async def export_inspection_data(request: ExportRequest):
    """
    Export dimension data to CSV or AS9102 Excel.
    
    Supports:
    - CSV format (simple)
    - Excel with AS9102 Form 3 template
    - Multi-page drawings with Sheet column
    """
    # Build metadata
    metadata = None
    if request.metadata:
        metadata = request.metadata
    
    # Generate export
    file_bytes, content_type, filename = export_service.generate_export(
        dimensions=request.dimensions,
        format=request.format,
        template=request.template,
        metadata=metadata,
        filename=request.filename or "inspection",
        grid_detected=getattr(request, 'grid_detected', True),
        total_pages=getattr(request, 'total_pages', 1)
    )
    
    # Return as downloadable file
    return StreamingResponse(
        io.BytesIO(file_bytes),
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )

@router.post("/cmm/parse")
async def parse_cmm_file(file: UploadFile = File(...)):
    """
    Parse raw CMM reports (PC-DMIS, Calypso, CSV) into standardized JSON.
    Used by the CMMImport frontend component.
    """
    try:
        content = await file.read()
        # The service handles decoding and format detection automatically
        results = cmm_parser_service.parse_file(content, file.filename)
        return {"success": True, "results": results}
    except Exception as e:
        return {"success": False, "message": f"Parsing failed: {str(e)}"}


@router.post("/sampling/calculate")
async def calculate_sampling(req: SamplingRequest):
    """
    Calculate sampling plan based on ANSI/ASQ Z1.4.
    """
    return sampling_service.get_sampling_plan(req.lot_size, req.level, req.aql)


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "autoballoon-api"}
