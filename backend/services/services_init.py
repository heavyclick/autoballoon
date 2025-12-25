from .file_service import FileService, FileServiceError, file_service, FileType, PageImage, FileProcessingResult
from .ocr_service import OCRService, OCRServiceError, OCRDetection, create_ocr_service
from .vision_service import VisionService, VisionServiceError, create_vision_service
from .detection_service import DetectionService, DetectionServiceError, create_detection_service, PageDetectionResult, MultiPageDetectionResult
from .grid_service import GridService, create_grid_service
from .export_service import ExportService, export_service
from .download_service import DownloadService, download_service, BalloonStyle, DownloadResult  # NEW
from .database_service import DatabaseService, get_db
from .email_service import EmailService, email_service
from .auth_service import AuthService, auth_service, User
from .payment_service import PaymentService, payment_service
from .usage_service import UsageService, usage_service
from .history_service import HistoryService, history_service

__all__ = [
    # File processing
    "FileService",
    "FileServiceError", 
    "file_service",
    "FileType",
    "PageImage",
    "FileProcessingResult",
    
    # OCR
    "OCRService",
    "OCRServiceError",
    "OCRDetection",
    "create_ocr_service",
    
    # Vision AI
    "VisionService",
    "VisionServiceError",
    "create_vision_service",
    
    # Detection
    "DetectionService",
    "DetectionServiceError",
    "create_detection_service",
    "PageDetectionResult",
    "MultiPageDetectionResult",
    
    # Grid
    "GridService",
    "create_grid_service",
    
    # Export
    "ExportService",
    "export_service",
    
    # Download (NEW)
    "DownloadService",
    "download_service",
    "BalloonStyle",
    "DownloadResult",
    
    # Database
    "DatabaseService",
    "get_db",
    
    # Email
    "EmailService",
    "email_service",
    
    # Authentication
    "AuthService",
    "auth_service",
    "User",
    
    # Payments
    "PaymentService",
    "payment_service",
    
    # Usage tracking
    "UsageService",
    "usage_service",
    
    # History
    "HistoryService",
    "history_service",
]
