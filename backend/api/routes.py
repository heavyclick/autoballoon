"""
API Routes - Fixed Version
Handles file upload, processing, and export generation.
Compatible with both single-page and multi-page PDFs.
"""
from typing import Optional, List
from fastapi import APIRouter, File, UploadFile, HTTPException, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io
import os

from models.schemas import (
    ExportFormat, 
    ExportTemplate, 
    ExportRequest,
    ExportMetadata,
)

# FIX: Import the export service (THIS WAS CAUSING THE 500 ERROR)
from services.export_service import export_service

router = APIRouter()  # NO PREFIX - endpoints registered at root, main.py handles routing


# ==================
# Helper function to create detection service
# ==================

def get_detection_service():
    """Create detection service with API keys from environment"""
    from services.detection_service import create_detection_service
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
                        "confidence": dim.confidence
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
                "confidence": dim.confidence
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
                    "confidence": dim.confidence
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


@router.post("/export")
async def export_inspection_data(request: ExportRequest):
    """
    Export dimension data to CSV or AS9102 Excel.
    
    Supports:
    - CSV format (simple)
    - Excel with AS9102 Form 3 template
    - Multi-page drawings with Sheet column
    """
    from models.schemas import ExportMetadata
    
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


@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok", "service": "autoballoon-api"}
