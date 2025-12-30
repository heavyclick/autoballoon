"""
Pydantic models for AutoBalloon API
Single source of truth for all data models.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ==================
# Enums
# ==================

class ErrorCode(str, Enum):
    """Error codes for API responses"""
    INVALID_FILE = "INVALID_FILE"
    FILE_TOO_LARGE = "FILE_TOO_LARGE"
    UNSUPPORTED_FORMAT = "UNSUPPORTED_FORMAT"
    VISION_API_ERROR = "VISION_API_ERROR"
    OCR_API_ERROR = "OCR_API_ERROR"
    OCR_FAILED = "OCR_FAILED"
    VISION_FAILED = "VISION_FAILED"
    PARSE_ERROR = "PARSE_ERROR"
    PROCESSING_ERROR = "PROCESSING_ERROR"
    PROCESSING_FAILED = "PROCESSING_FAILED"
    EXPORT_FAILED = "EXPORT_FAILED"
    USAGE_LIMIT_EXCEEDED = "USAGE_LIMIT_EXCEEDED"
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED"
    PAYMENT_FAILED = "PAYMENT_FAILED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class ExportFormat(str, Enum):
    """Supported export formats"""
    CSV = "csv"
    XLSX = "xlsx"


class ExportTemplate(str, Enum):
    """Export templates"""
    SIMPLE = "SIMPLE"
    AS9102_FORM3 = "AS9102_FORM3"
    PPAP = "PPAP"
    CUSTOM = "CUSTOM"


class ToleranceType(str, Enum):
    """Types of tolerance specifications"""
    BILATERAL = "bilateral"
    LIMIT = "limit"
    BASIC = "basic"
    MAX = "max"
    MIN = "min"
    GDT = "gdt"
    FIT = "fit"
    FLATNESS = "flatness"


class FitType(str, Enum):
    """Type of ISO fit"""
    HOLE = "Hole"
    SHAFT = "Shaft"
    NONE = "None"


class FeatureType(str, Enum):
    """Engineering feature types (Subtypes)"""
    LINEAR = "Linear"
    DIAMETER = "Diameter"
    RADIUS = "Radius"
    CHAMFER = "Chamfer"
    ANGLE = "Angle"
    NOTE = "Note"
    WELD = "Weld"
    FINISH = "Finish"
    GDT = "GD&T"
    UNKNOWN = "Unknown"


# ==================
# Core Models
# ==================

class BoundingBox(BaseModel):
    """Normalized bounding box coordinates (0-1000 scale)"""
    ymin: float = Field(..., ge=0, le=1000)
    xmin: float = Field(..., ge=0, le=1000)
    ymax: float = Field(..., ge=0, le=1000)
    xmax: float = Field(..., ge=0, le=1000)
    center_x: Optional[float] = None
    center_y: Optional[float] = None
    
    def __init__(self, **data):
        super().__init__(**data)
        # Safe initialization for calculated fields
        if self.center_x is None:
            object.__setattr__(self, 'center_x', (self.xmin + self.xmax) / 2)
        if self.center_y is None:
            object.__setattr__(self, 'center_y', (self.ymin + self.ymax) / 2)


class ParsedValues(BaseModel):
    """Parsed numerical data for validation and export"""
    nominal: float = 0.0
    
    # Tolerancing
    tolerance_type: ToleranceType = ToleranceType.BILATERAL
    plus_tolerance: float = 0.0
    minus_tolerance: float = 0.0
    upper_limit: float = 0.0
    lower_limit: float = 0.0
    
    # Legacy fields (maintained for backward compatibility)
    upper_tol: float = 0.0
    lower_tol: float = 0.0
    max_limit: float = 0.0
    min_limit: float = 0.0
    
    precision: int = 3
    units: str = "in"  # 'in' or 'mm'
    
    # New Engineering Fields
    quantity: int = 1
    subtype: FeatureType = FeatureType.LINEAR
    
    # Fits
    fit_type: Optional[FitType] = None
    hole_fit_class: Optional[str] = None # e.g., 'H7'
    shaft_fit_class: Optional[str] = None # e.g., 'g6'
    
    # Specifications
    full_specification: Optional[str] = None
    inspection_method: Optional[str] = None # e.g., 'CMM', 'Caliper'
    
    # GD&T Specific Fields
    is_gdt: bool = False
    gdt_symbol: Optional[str] = None    # e.g., 'Position', 'Perpendicularity'
    gdt_tolerance: Optional[float] = None
    gdt_modifiers: Optional[str] = None # e.g., 'MMC', 'LMC'
    gdt_datums: Optional[str] = None    # e.g., 'A, B, C'


class Dimension(BaseModel):
    """A detected dimension with its location and metadata"""
    id: int
    value: str
    zone: Optional[str] = None
    bounding_box: BoundingBox
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    page: int = 1
    manually_added: bool = False
    manually_moved: bool = False
    
    # New Metadata Fields
    chart_char_id: Optional[str] = None
    sheet: Optional[str] = None
    view_name: Optional[str] = None
    capture_region: Optional[Dict[str, Any]] = None
    
    custom_properties: Dict[str, Any] = {}
    
    # Stores the engineering math data
    parsed: Optional[ParsedValues] = None
    
    class Config:
        from_attributes = True


class BillOfMaterialItem(BaseModel):
    """Item for Bill of Materials (Form 1)"""
    part_name: str = ""
    part_number: str = ""
    qty: str = "1"


class SpecificationItem(BaseModel):
    """Item for Specifications (Form 2)"""
    process: str = ""
    spec_number: str = ""
    code: Optional[str] = None


class GridInfo(BaseModel):
    """Grid detection results"""
    detected: bool
    columns: List[str] = []
    rows: List[str] = []
    boundaries: Optional[dict] = None


class ProcessingMetadata(BaseModel):
    """Metadata about the processing operation"""
    filename: Optional[str] = None
    original_format: Optional[str] = None
    processed_at: Optional[datetime] = None
    dimension_count: Optional[int] = None
    processing_time_ms: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None


class PageResult(BaseModel):
    """Result for a single page in multi-page processing"""
    page_number: int
    image: str  # Base64 encoded PNG
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
    """Response from /api/process endpoint"""
    success: bool
    total_pages: int = 1
    pages: List[PageResult] = []
    image: Optional[str] = None  # Base64 encoded image (single-page backward compat)
    dimensions: List[Dimension] = []
    grid: Optional[GridInfo] = None
    metadata: Optional[ProcessingMetadata] = None
    message: Optional[str] = None
    error: Optional[dict] = None


class ErrorResponse(BaseModel):
    """Error details"""
    code: ErrorCode
    message: str


class ExportMetadata(BaseModel):
    """Optional metadata for exports"""
    part_number: Optional[str] = None
    part_name: Optional[str] = None
    revision: Optional[str] = None
    serial_number: Optional[str] = None
    fai_report_number: Optional[str] = None
    # Legacy support
    materials: Optional[List[Dict]] = None


class ExportRequest(BaseModel):
    """Request body for /api/export endpoint"""
    format: ExportFormat
    template: ExportTemplate = ExportTemplate.AS9102_FORM3
    dimensions: List[dict]
    bom: List[BillOfMaterialItem] = []
    specifications: List[SpecificationItem] = []
    metadata: Optional[ExportMetadata] = None
    filename: str = "inspection"
    total_pages: int = 1
    grid_detected: bool = True


class UpdateBalloonRequest(BaseModel):
    """Request to update a balloon's position"""
    dimension_id: int
    new_bounding_box: BoundingBox


class UpdateBalloonResponse(BaseModel):
    """Response after updating balloon position"""
    success: bool
    updated_zone: Optional[str] = None


class AddBalloonRequest(BaseModel):
    """Request to manually add a balloon"""
    value: str
    bounding_box: Optional[BoundingBox] = None
    # Support simpler xy inputs used by frontend
    x: Optional[float] = None
    y: Optional[float] = None
    page: int = 1


class AddBalloonResponse(BaseModel):
    """Response after adding a balloon"""
    success: bool
    dimension: Optional[Dimension] = None


class MoveBalloonRequest(BaseModel):
    """Request to move a balloon"""
    id: int
    x: float
    y: float


class DeleteBalloonRequest(BaseModel):
    """Request to delete a balloon"""
    id: int


class HealthResponse(BaseModel):
    """Response from /api/health endpoint"""
    status: str
    version: str
