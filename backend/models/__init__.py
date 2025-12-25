"""
Models Package - All Pydantic models and enums
FIXED: Includes ErrorCode that ocr_service.py needs
"""
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel


# ==================
# Error Codes (REQUIRED by ocr_service.py)
# ==================

class ErrorCode(str, Enum):
    """Error codes for API responses"""
    INVALID_FILE = "INVALID_FILE"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
    PROCESSING_FAILED = "PROCESSING_FAILED"
    OCR_FAILED = "OCR_FAILED"
    VISION_FAILED = "VISION_FAILED"
    EXPORT_FAILED = "EXPORT_FAILED"
    USAGE_LIMIT_EXCEEDED = "USAGE_LIMIT_EXCEEDED"
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


# ==================
# Export Enums
# ==================

class ExportFormat(str, Enum):
    """Supported export formats"""
    CSV = "csv"
    XLSX = "xlsx"


class ExportTemplate(str, Enum):
    """Export templates"""
    SIMPLE = "SIMPLE"
    AS9102_FORM3 = "AS9102_FORM3"


# ==================
# Bounding Box
# ==================

class BoundingBox(BaseModel):
    """Bounding box for detected dimension"""
    xmin: float
    ymin: float
    xmax: float
    ymax: float
    center_x: Optional[float] = None
    center_y: Optional[float] = None
    
    def __init__(self, **data):
        super().__init__(**data)
        if self.center_x is None:
            self.center_x = (self.xmin + self.xmax) / 2
        if self.center_y is None:
            self.center_y = (self.ymin + self.ymax) / 2


# ==================
# Dimension Model
# ==================

class Dimension(BaseModel):
    """A detected dimension with balloon info"""
    id: int
    value: str
    zone: Optional[str] = None
    page: int = 1  # NEW: Page number for multi-page support
    bounding_box: BoundingBox
    confidence: float = 1.0
    manually_added: bool = False
    manually_moved: bool = False
    
    class Config:
        from_attributes = True


# ==================
# Page Result (NEW for multi-page)
# ==================

class PageResult(BaseModel):
    """Result for a single page"""
    page_number: int
    image: str  # base64 encoded
    width: int
    height: int
    dimensions: List[Dimension] = []
    grid_detected: bool = True


# ==================
# Request/Response Models
# ==================

class ProcessRequest(BaseModel):
    """Request to process a blueprint"""
    visitor_id: Optional[str] = None


class ProcessResponse(BaseModel):
    """Response from processing"""
    success: bool
    image: Optional[str] = None  # base64 for single page (backward compat)
    dimensions: Optional[List[Dimension]] = None  # All dimensions (backward compat)
    total_pages: int = 1  # NEW
    pages: Optional[List[PageResult]] = None  # NEW: Per-page data
    grid: Optional[dict] = None
    metadata: Optional[dict] = None
    message: Optional[str] = None  # NEW: For warnings like "Processed 20 of 25 pages"
    error: Optional[dict] = None


class ExportRequest(BaseModel):
    """Request to export dimensions"""
    format: ExportFormat = ExportFormat.XLSX
    template: ExportTemplate = ExportTemplate.AS9102_FORM3
    dimensions: List[dict]
    filename: Optional[str] = "inspection"
    total_pages: int = 1  # NEW
    grid_detected: bool = True  # NEW


class ExportMetadata(BaseModel):
    """Metadata for exports"""
    part_number: Optional[str] = None
    part_name: Optional[str] = None
    revision: Optional[str] = None
    serial_number: Optional[str] = None
    fai_report_number: Optional[str] = None


class AddBalloonRequest(BaseModel):
    """Request to add a balloon manually"""
    value: str
    x: float
    y: float
    page: int = 1  # NEW


class MoveBalloonRequest(BaseModel):
    """Request to move a balloon"""
    id: int
    x: float
    y: float


class DeleteBalloonRequest(BaseModel):
    """Request to delete a balloon"""
    id: int


# ==================
# Exports
# ==================

__all__ = [
    # Error codes
    "ErrorCode",
    
    # Enums
    "ExportFormat",
    "ExportTemplate",
    
    # Core models
    "BoundingBox",
    "Dimension",
    "PageResult",
    
    # Request/Response
    "ProcessRequest",
    "ProcessResponse",
    "ExportRequest",
    "ExportMetadata",
    "AddBalloonRequest",
    "MoveBalloonRequest",
    "DeleteBalloonRequest",
]
