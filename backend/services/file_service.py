"""
File Service - Multi-Page PDF Processing
Handles PDF page extraction, image conversion, and file validation.

Supports:
- Multi-page PDF extraction (up to 20 pages)
- High-resolution PNG conversion for each page
- Single image passthrough
- Hybrid Vector Text Extraction (extracts selectable text from PDFs)

Uses pdf2image (with poppler backend) for PDF to image conversion.
Uses pypdf for vector text extraction.
"""
import io
import base64
import logging
import math
from typing import Optional, List, Tuple, Dict, Any
from dataclasses import dataclass
from enum import Enum
from PIL import Image
from pdf2image import convert_from_bytes
from pypdf import PdfReader

# Configure logger
logger = logging.getLogger(__name__)

class FileType(Enum):
    """Supported file types"""
    PDF = "pdf"
    PNG = "png"
    JPEG = "jpeg"
    UNKNOWN = "unknown"


@dataclass
class PageImage:
    """Represents a single page converted to image"""
    page_number: int
    image_bytes: bytes
    width: int
    height: int
    base64_image: str  # For API response
    vector_text: Optional[List[Dict[str, Any]]] = None  # Extracted text with coordinates


@dataclass
class FileProcessingResult:
    """Result of file processing"""
    success: bool
    file_type: FileType
    total_pages: int
    pages: List[PageImage]
    error_message: Optional[str] = None


class FileService:
    """
    Handles multi-page PDF and image file processing.
    """
    
    # Configuration
    MAX_PAGES = 20  # Maximum pages to process
    DEFAULT_DPI = 200  # Resolution for PDF to image conversion
    MAX_IMAGE_DIMENSION = 4096  # Maximum width/height for images
    
    def __init__(self, max_pages: int = 20, dpi: int = 200):
        """
        Initialize file service.
        
        Args:
            max_pages: Maximum number of pages to process (default 20)
            dpi: DPI for PDF to image conversion (default 200)
        """
        self.max_pages = max_pages
        self.dpi = dpi
    
    def detect_file_type(self, file_bytes: bytes, filename: Optional[str] = None) -> FileType:
        """
        Detect file type from bytes and/or filename.
        
        Args:
            file_bytes: Raw file bytes
            filename: Optional filename with extension
            
        Returns:
            Detected FileType
        """
        # Check magic bytes first
        if file_bytes[:4] == b'%PDF':
            return FileType.PDF
        if file_bytes[:8] == b'\x89PNG\r\n\x1a\n':
            return FileType.PNG
        if file_bytes[:2] == b'\xff\xd8':
            return FileType.JPEG
        
        # Fallback to filename extension
        if filename:
            ext = filename.lower().split('.')[-1]
            if ext == 'pdf':
                return FileType.PDF
            if ext == 'png':
                return FileType.PNG
            if ext in ('jpg', 'jpeg'):
                return FileType.JPEG
        
        return FileType.UNKNOWN
    
    def process_file(
        self, 
        file_bytes: bytes, 
        filename: Optional[str] = None
    ) -> FileProcessingResult:
        """
        Process uploaded file, extracting pages as images.
        
        For PDFs: Converts each page to a high-resolution PNG and extracts vector text.
        For images: Returns single page with original image.
        
        Args:
            file_bytes: Raw file bytes
            filename: Optional filename
            
        Returns:
            FileProcessingResult with page images and text data
        """
        file_type = self.detect_file_type(file_bytes, filename)
        
        if file_type == FileType.PDF:
            return self._process_pdf(file_bytes)
        elif file_type in (FileType.PNG, FileType.JPEG):
            return self._process_image(file_bytes, file_type)
        else:
            return FileProcessingResult(
                success=False,
                file_type=FileType.UNKNOWN,
                total_pages=0,
                pages=[],
                error_message="Unsupported file type. Please upload a PDF, PNG, or JPEG."
            )
    
    def _process_pdf(self, pdf_bytes: bytes) -> FileProcessingResult:
        """
        Process multi-page PDF, converting each page to PNG and extracting text.
        
        Args:
            pdf_bytes: Raw PDF file bytes
            
        Returns:
            FileProcessingResult with all page images and vector data
        """
        try:
            # Initialize pypdf Reader for text extraction
            pdf_reader = PdfReader(io.BytesIO(pdf_bytes))
            total_pages_pdf = len(pdf_reader.pages)
            
            # Determine pages to process
            pages_to_process = min(total_pages_pdf, self.max_pages)
            
            # Convert PDF pages to images using pdf2image
            pil_images = convert_from_bytes(
                pdf_bytes,
                dpi=self.dpi,
                first_page=1,
                last_page=pages_to_process,
                fmt='png'
            )
            
            pages = []
            for i, pil_img in enumerate(pil_images):
                page_num = i + 1
                
                # --- Vector Text Extraction (Hybrid Engine) ---
                vector_data = []
                try:
                    pypdf_page = pdf_reader.pages[i]
                    
                    # Visitor function to extract text and bounding boxes with ROTATION support
                    def visitor_body(text, cm, tm, fontDict, fontSize):
                        if text and text.strip():
                            # Normalize to 0-1000 scale
                            w_page = float(pypdf_page.mediabox.width)
                            h_page = float(pypdf_page.mediabox.height)
                            
                            if w_page > 0 and h_page > 0:
                                # 1. Calculate Effective Font Size (Scale * Raw Size)
                                # tm[0] is X-scale, tm[3] is Y-scale. 
                                # Use Y-scale for height calculation.
                                # Handle rotation (swap X/Y if rotated 90deg)
                                scale_y = math.sqrt(tm[2]**2 + tm[3]**2) 
                                real_height = fontSize * scale_y
                                
                                # Fallback if scale is zero/invalid
                                if real_height == 0: real_height = fontSize

                                # 2. Matrix Components
                                x_origin = tm[4]
                                y_origin = tm[5]
                                
                                # 3. Calculate Width approx
                                scale_x = math.sqrt(tm[0]**2 + tm[1]**2)
                                text_len_units = len(text) * fontSize * scale_x * 0.6

                                # 4. Handle Rotation
                                is_vertical = abs(tm[1]) > abs(tm[0])
                                
                                if is_vertical:
                                    # Vertical Text (Going UP)
                                    box_w = real_height
                                    box_h = text_len_units
                                    
                                    # Adjust Origin: PDF draws from baseline. 
                                    # For vertical, visual top-left depends on rotation direction, 
                                    # but approximating center is usually safer.
                                    # Let's define the box extending UP from origin.
                                    pdf_xmin = x_origin
                                    pdf_xmax = x_origin + box_w
                                    pdf_ymin = y_origin
                                    pdf_ymax = y_origin + box_h
                                else:
                                    # Horizontal Text
                                    box_w = text_len_units
                                    box_h = real_height
                                    
                                    pdf_xmin = x_origin
                                    pdf_xmax = x_origin + box_w
                                    pdf_ymin = y_origin
                                    pdf_ymax = y_origin + box_h

                                # 5. Convert to System (0-1000, Top-Left Origin)
                                # PDF Y is Bottom-Left. System Y is Top-Left.
                                # y_origin is the BASELINE. 
                                # Box Top (Lower Y value) = PageHeight - (Baseline + Height)
                                # Note: PDF ymin is visually lower, so it becomes System ymax (higher value)
                                sys_xmin = (pdf_xmin / w_page) * 1000
                                sys_xmax = (pdf_xmax / w_page) * 1000
                                
                                # Flip Y axis
                                sys_ymin = ((h_page - pdf_ymax) / h_page) * 1000
                                sys_ymax = ((h_page - pdf_ymin) / h_page) * 1000
                                
                                vector_data.append({
                                    'text': text,
                                    'bbox': {
                                        'xmin': sys_xmin,
                                        'ymin': sys_ymin,
                                        'xmax': sys_xmax,
                                        'ymax': sys_ymax
                                    }
                                })
                    
                    pypdf_page.extract_text(visitor_text=visitor_body)
                except Exception as e:
                    logger.warning(f"Vector extraction failed for page {page_num}: {e}")
                # ---------------------------------------------

                # Convert PIL image to PNG bytes
                png_buffer = io.BytesIO()
                pil_img.save(png_buffer, format='PNG')
                png_bytes = png_buffer.getvalue()
                
                # Get dimensions
                width, height = pil_img.size
                
                # Encode to base64
                base64_image = base64.b64encode(png_bytes).decode('utf-8')
                
                pages.append(PageImage(
                    page_number=page_num,
                    image_bytes=png_bytes,
                    width=width,
                    height=height,
                    base64_image=base64_image,
                    vector_text=vector_data  # Pass extracted data
                ))
            
            warning_msg = None
            if total_pages_pdf > self.max_pages:
                warning_msg = f"Processed {pages_to_process} of {total_pages_pdf} pages (max {self.max_pages})"
            
            return FileProcessingResult(
                success=True,
                file_type=FileType.PDF,
                total_pages=total_pages_pdf,
                pages=pages,
                error_message=warning_msg
            )
            
        except Exception as e:
            logger.error(f"Failed to process PDF: {str(e)}")
            return FileProcessingResult(
                success=False,
                file_type=FileType.PDF,
                total_pages=0,
                pages=[],
                error_message=f"Failed to process PDF: {str(e)}"
            )
    
    def _process_image(
        self, 
        image_bytes: bytes, 
        file_type: FileType
    ) -> FileProcessingResult:
        """
        Process single image file.
        
        Args:
            image_bytes: Raw image bytes
            file_type: Detected file type
            
        Returns:
            FileProcessingResult with single page
        """
        try:
            # Open image to get dimensions and potentially convert
            img = Image.open(io.BytesIO(image_bytes))
            width, height = img.size
            
            # Convert to PNG if JPEG (for consistency)
            if file_type == FileType.JPEG:
                png_buffer = io.BytesIO()
                img.save(png_buffer, format='PNG')
                png_bytes = png_buffer.getvalue()
            else:
                png_bytes = image_bytes
            
            # Encode to base64
            base64_image = base64.b64encode(png_bytes).decode('utf-8')
            
            page = PageImage(
                page_number=1,
                image_bytes=png_bytes,
                width=width,
                height=height,
                base64_image=base64_image,
                vector_text=None # No vector text for images
            )
            
            return FileProcessingResult(
                success=True,
                file_type=file_type,
                total_pages=1,
                pages=[page]
            )
            
        except Exception as e:
            return FileProcessingResult(
                success=False,
                file_type=file_type,
                total_pages=0,
                pages=[],
                error_message=f"Failed to process image: {str(e)}"
            )
    
    def get_page_as_png(
        self, 
        pdf_bytes: bytes, 
        page_number: int
    ) -> Optional[Tuple[bytes, int, int]]:
        """
        Extract a specific page from PDF as PNG.
        
        Args:
            pdf_bytes: Raw PDF bytes
            page_number: Page number (1-indexed)
            
        Returns:
            Tuple of (png_bytes, width, height) or None if failed
        """
        try:
            # Convert just the requested page
            pil_images = convert_from_bytes(
                pdf_bytes,
                dpi=self.dpi,
                first_page=page_number,
                last_page=page_number,
                fmt='png'
            )
            
            if not pil_images:
                return None
            
            pil_img = pil_images[0]
            
            # Convert to PNG bytes
            png_buffer = io.BytesIO()
            pil_img.save(png_buffer, format='PNG')
            png_bytes = png_buffer.getvalue()
            
            width, height = pil_img.size
            
            return (png_bytes, width, height)
            
        except Exception:
            return None


# Singleton instance
file_service = FileService()
