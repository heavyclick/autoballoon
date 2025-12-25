"""
Download Service - Multi-Page Ballooned Output Generation
Generates downloadable files with balloons rendered on drawings.

Supports:
1. Single ballooned PDF (all pages with balloons rendered)
2. ZIP bundle (ballooned images + AS9102 Excel)
3. Individual page images with balloons
"""
import io
import zipfile
import base64
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from services.export_service import ExportService, export_service
from models import ExportFormat, ExportTemplate, ExportMetadata


@dataclass
class BalloonStyle:
    """Configuration for balloon appearance"""
    fill_color: str = "#E63946"  # Red fill
    stroke_color: str = "#FFFFFF"  # White border
    text_color: str = "#FFFFFF"  # White text
    stroke_width: int = 2
    radius: int = 18  # Balloon circle radius
    font_size: int = 14
    leader_color: str = "#E63946"  # Leader line color
    leader_width: int = 2


@dataclass
class DownloadResult:
    """Result of download generation"""
    success: bool
    file_bytes: bytes
    filename: str
    content_type: str
    error_message: Optional[str] = None


class DownloadService:
    """
    Generates downloadable files with balloons rendered on drawings.
    """
    
    def __init__(self):
        self.balloon_style = BalloonStyle()
        self.export_service = export_service
    
    # ==================
    # Main Download Methods
    # ==================
    
    def generate_ballooned_pdf(
        self,
        pages: List[Dict[str, Any]],
        metadata: Optional[ExportMetadata] = None,
        filename: str = "ballooned_drawing"
    ) -> DownloadResult:
        """
        Generate a single PDF with all pages ballooned.
        
        Args:
            pages: List of page dicts with:
                - page_number: int
                - image_base64: str (base64 PNG)
                - width: int
                - height: int
                - dimensions: List[dict] with id, value, bounding_box
            metadata: Optional part info
            filename: Base filename
            
        Returns:
            DownloadResult with PDF bytes
        """
        try:
            pdf_buffer = io.BytesIO()
            
            # Create PDF with first page size
            if not pages:
                return DownloadResult(
                    success=False,
                    file_bytes=b"",
                    filename="",
                    content_type="",
                    error_message="No pages to process"
                )
            
            # Use landscape A4 as default, will adjust per page
            c = canvas.Canvas(pdf_buffer)
            
            for page_data in pages:
                # Render balloons on the image
                ballooned_image = self._render_balloons_on_image(
                    image_base64=page_data.get("image") or page_data.get("image_base64"),
                    dimensions=page_data.get("dimensions", []),
                    width=page_data.get("width", 1700),
                    height=page_data.get("height", 2200)
                )
                
                if ballooned_image:
                    # Get image dimensions
                    img_width, img_height = ballooned_image.size
                    
                    # Set page size to match image aspect ratio
                    # Scale to fit on A4 landscape
                    max_width = 842  # A4 landscape width in points
                    max_height = 595  # A4 landscape height in points
                    
                    scale = min(max_width / img_width, max_height / img_height)
                    scaled_width = img_width * scale
                    scaled_height = img_height * scale
                    
                    # Center on page
                    x_offset = (max_width - scaled_width) / 2
                    y_offset = (max_height - scaled_height) / 2
                    
                    c.setPageSize((max_width, max_height))
                    
                    # Convert PIL image to bytes for ReportLab
                    img_buffer = io.BytesIO()
                    ballooned_image.save(img_buffer, format='PNG')
                    img_buffer.seek(0)
                    
                    # Draw image on PDF
                    c.drawImage(
                        ImageReader(img_buffer),
                        x_offset, y_offset,
                        width=scaled_width,
                        height=scaled_height
                    )
                    
                    # Add page number footer
                    c.setFont("Helvetica", 8)
                    c.setFillColorRGB(0.5, 0.5, 0.5)
                    page_num = page_data.get("page_number", 1)
                    total_pages = len(pages)
                    c.drawCentredString(
                        max_width / 2, 
                        10, 
                        f"Page {page_num} of {total_pages} | Generated by AutoBalloon"
                    )
                    
                    c.showPage()
            
            c.save()
            pdf_bytes = pdf_buffer.getvalue()
            
            # Build filename
            parts = []
            if metadata:
                if metadata.part_number:
                    parts.append(metadata.part_number)
                if metadata.revision:
                    parts.append(f"Rev{metadata.revision}")
            if not parts:
                parts.append(filename)
            parts.append("ballooned")
            full_filename = "_".join(parts) + ".pdf"
            
            return DownloadResult(
                success=True,
                file_bytes=pdf_bytes,
                filename=full_filename,
                content_type="application/pdf"
            )
            
        except Exception as e:
            return DownloadResult(
                success=False,
                file_bytes=b"",
                filename="",
                content_type="",
                error_message=f"Failed to generate PDF: {str(e)}"
            )
    
    def generate_zip_bundle(
        self,
        pages: List[Dict[str, Any]],
        metadata: Optional[ExportMetadata] = None,
        filename: str = "inspection_package",
        include_excel: bool = True,
        include_images: bool = True,
        grid_detected: bool = True
    ) -> DownloadResult:
        """
        Generate a ZIP bundle with ballooned images and AS9102 Excel.
        
        Args:
            pages: List of page dicts
            metadata: Optional part info
            filename: Base filename
            include_excel: Include AS9102 Form 3 Excel
            include_images: Include ballooned PNG images
            grid_detected: Whether grid was auto-detected
            
        Returns:
            DownloadResult with ZIP bytes
        """
        try:
            zip_buffer = io.BytesIO()
            
            with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
                # Collect all dimensions for Excel
                all_dimensions = []
                
                for page_data in pages:
                    page_num = page_data.get("page_number", 1)
                    dims = page_data.get("dimensions", [])
                    
                    # Add page number to each dimension
                    for dim in dims:
                        dim_copy = dict(dim) if isinstance(dim, dict) else dim.dict()
                        dim_copy["page"] = page_num
                        all_dimensions.append(dim_copy)
                    
                    if include_images:
                        # Render balloons on image
                        ballooned_image = self._render_balloons_on_image(
                            image_base64=page_data.get("image") or page_data.get("image_base64"),
                            dimensions=dims,
                            width=page_data.get("width", 1700),
                            height=page_data.get("height", 2200)
                        )
                        
                        if ballooned_image:
                            # Save as PNG in ZIP
                            img_buffer = io.BytesIO()
                            ballooned_image.save(img_buffer, format='PNG')
                            img_bytes = img_buffer.getvalue()
                            
                            img_filename = f"page_{page_num:02d}_ballooned.png"
                            zf.writestr(f"images/{img_filename}", img_bytes)
                
                if include_excel and all_dimensions:
                    # Generate AS9102 Excel
                    excel_bytes, _, excel_filename = self.export_service.generate_export(
                        dimensions=all_dimensions,
                        format=ExportFormat.XLSX,
                        template=ExportTemplate.AS9102_FORM3,
                        metadata=metadata,
                        filename="inspection",
                        grid_detected=grid_detected,
                        total_pages=len(pages)
                    )
                    zf.writestr(excel_filename, excel_bytes)
                
                # Add README
                readme = self._generate_readme(pages, metadata, grid_detected)
                zf.writestr("README.txt", readme)
            
            zip_bytes = zip_buffer.getvalue()
            
            # Build filename
            parts = []
            if metadata:
                if metadata.part_number:
                    parts.append(metadata.part_number)
                if metadata.revision:
                    parts.append(f"Rev{metadata.revision}")
            if not parts:
                parts.append(filename)
            parts.append("FAI_package")
            full_filename = "_".join(parts) + ".zip"
            
            return DownloadResult(
                success=True,
                file_bytes=zip_bytes,
                filename=full_filename,
                content_type="application/zip"
            )
            
        except Exception as e:
            return DownloadResult(
                success=False,
                file_bytes=b"",
                filename="",
                content_type="",
                error_message=f"Failed to generate ZIP: {str(e)}"
            )
    
    def generate_single_ballooned_image(
        self,
        image_base64: str,
        dimensions: List[Dict],
        width: int,
        height: int,
        format: str = "png"
    ) -> DownloadResult:
        """
        Generate a single ballooned image.
        
        Args:
            image_base64: Base64 encoded source image
            dimensions: List of dimension dicts
            width: Image width
            height: Image height
            format: Output format (png or jpeg)
            
        Returns:
            DownloadResult with image bytes
        """
        try:
            ballooned = self._render_balloons_on_image(
                image_base64=image_base64,
                dimensions=dimensions,
                width=width,
                height=height
            )
            
            if not ballooned:
                return DownloadResult(
                    success=False,
                    file_bytes=b"",
                    filename="",
                    content_type="",
                    error_message="Failed to render balloons"
                )
            
            img_buffer = io.BytesIO()
            if format.lower() == "jpeg":
                ballooned = ballooned.convert("RGB")  # Remove alpha for JPEG
                ballooned.save(img_buffer, format='JPEG', quality=95)
                content_type = "image/jpeg"
                ext = "jpg"
            else:
                ballooned.save(img_buffer, format='PNG')
                content_type = "image/png"
                ext = "png"
            
            return DownloadResult(
                success=True,
                file_bytes=img_buffer.getvalue(),
                filename=f"ballooned_drawing.{ext}",
                content_type=content_type
            )
            
        except Exception as e:
            return DownloadResult(
                success=False,
                file_bytes=b"",
                filename="",
                content_type="",
                error_message=f"Failed to generate image: {str(e)}"
            )
    
    # ==================
    # Balloon Rendering
    # ==================
    
    def _render_balloons_on_image(
        self,
        image_base64: str,
        dimensions: List[Dict],
        width: int,
        height: int
    ) -> Optional[Image.Image]:
        """
        Render balloon markers on an image.
        
        Args:
            image_base64: Base64 encoded source image
            dimensions: List of dimension dicts with id, bounding_box
            width: Image width in pixels
            height: Image height in pixels
            
        Returns:
            PIL Image with balloons rendered, or None on error
        """
        try:
            # Decode base64 image
            image_bytes = base64.b64decode(image_base64)
            img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
            
            # Create overlay for balloons
            overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)
            
            # Try to load a font, fall back to default
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 
                                         self.balloon_style.font_size)
            except:
                try:
                    font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
                                             self.balloon_style.font_size)
                except:
                    font = ImageFont.load_default()
            
            # Actual image dimensions
            actual_width, actual_height = img.size
            
            # Draw each balloon
            for dim in dimensions:
                balloon_id = dim.get("id", 0)
                bbox = dim.get("bounding_box", {})
                
                if not bbox:
                    continue
                
                # Convert normalized coordinates (0-1000) to pixel coordinates
                # Handle both dict and object access
                if isinstance(bbox, dict):
                    center_x = bbox.get("center_x")
                    center_y = bbox.get("center_y")
                    if center_x is None:
                        xmin = bbox.get("xmin", 0)
                        xmax = bbox.get("xmax", 0)
                        center_x = (xmin + xmax) / 2
                    if center_y is None:
                        ymin = bbox.get("ymin", 0)
                        ymax = bbox.get("ymax", 0)
                        center_y = (ymin + ymax) / 2
                else:
                    center_x = getattr(bbox, "center_x", 500)
                    center_y = getattr(bbox, "center_y", 500)
                
                # Scale to actual image size
                px_x = int((center_x / 1000) * actual_width)
                px_y = int((center_y / 1000) * actual_height)
                
                # Calculate balloon position (offset from dimension)
                # Place balloon above and to the right of the dimension
                balloon_x = px_x + self.balloon_style.radius + 10
                balloon_y = px_y - self.balloon_style.radius - 10
                
                # Keep balloon within image bounds
                balloon_x = max(self.balloon_style.radius + 2, 
                               min(actual_width - self.balloon_style.radius - 2, balloon_x))
                balloon_y = max(self.balloon_style.radius + 2, 
                               min(actual_height - self.balloon_style.radius - 2, balloon_y))
                
                # Draw leader line from dimension to balloon
                self._draw_leader_line(draw, px_x, px_y, balloon_x, balloon_y)
                
                # Draw balloon circle
                self._draw_balloon(draw, balloon_x, balloon_y, str(balloon_id), font)
            
            # Composite overlay onto original image
            result = Image.alpha_composite(img, overlay)
            
            return result.convert("RGB")
            
        except Exception as e:
            print(f"Error rendering balloons: {e}")
            return None
    
    def _draw_leader_line(
        self, 
        draw: ImageDraw.Draw, 
        start_x: int, 
        start_y: int, 
        end_x: int, 
        end_y: int
    ):
        """Draw a leader line from dimension to balloon"""
        # Parse color
        color = self._hex_to_rgb(self.balloon_style.leader_color)
        
        # Draw line
        draw.line(
            [(start_x, start_y), (end_x, end_y)],
            fill=(*color, 255),
            width=self.balloon_style.leader_width
        )
        
        # Draw small circle at dimension end
        dot_radius = 3
        draw.ellipse(
            [start_x - dot_radius, start_y - dot_radius,
             start_x + dot_radius, start_y + dot_radius],
            fill=(*color, 255)
        )
    
    def _draw_balloon(
        self, 
        draw: ImageDraw.Draw, 
        x: int, 
        y: int, 
        text: str, 
        font: ImageFont.FreeTypeFont
    ):
        """Draw a balloon circle with number"""
        r = self.balloon_style.radius
        
        # Parse colors
        fill_color = self._hex_to_rgb(self.balloon_style.fill_color)
        stroke_color = self._hex_to_rgb(self.balloon_style.stroke_color)
        text_color = self._hex_to_rgb(self.balloon_style.text_color)
        
        # Draw outer circle (border)
        draw.ellipse(
            [x - r - self.balloon_style.stroke_width, 
             y - r - self.balloon_style.stroke_width,
             x + r + self.balloon_style.stroke_width, 
             y + r + self.balloon_style.stroke_width],
            fill=(*stroke_color, 255)
        )
        
        # Draw inner circle (fill)
        draw.ellipse(
            [x - r, y - r, x + r, y + r],
            fill=(*fill_color, 255)
        )
        
        # Draw text centered in balloon
        # Get text bounding box for centering
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        text_x = x - text_width / 2
        text_y = y - text_height / 2 - 2  # Slight adjustment for visual centering
        
        draw.text(
            (text_x, text_y),
            text,
            font=font,
            fill=(*text_color, 255)
        )
    
    def _hex_to_rgb(self, hex_color: str) -> Tuple[int, int, int]:
        """Convert hex color to RGB tuple"""
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    
    def _generate_readme(
        self, 
        pages: List[Dict], 
        metadata: Optional[ExportMetadata],
        grid_detected: bool
    ) -> str:
        """Generate README content for ZIP bundle"""
        total_dims = sum(len(p.get("dimensions", [])) for p in pages)
        
        lines = [
            "=" * 60,
            "AutoBalloon FAI Package",
            "=" * 60,
            "",
            f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "",
        ]
        
        if metadata:
            if metadata.part_number:
                lines.append(f"Part Number: {metadata.part_number}")
            if metadata.part_name:
                lines.append(f"Part Name: {metadata.part_name}")
            if metadata.revision:
                lines.append(f"Revision: {metadata.revision}")
            lines.append("")
        
        lines.extend([
            f"Total Pages: {len(pages)}",
            f"Total Characteristics: {total_dims}",
            "",
            "-" * 60,
            "Contents:",
            "-" * 60,
            "",
            "images/",
            "  - Ballooned drawing images (PNG format)",
            "  - One image per page with balloon markers",
            "",
            "*.xlsx",
            "  - AS9102 Form 3 Excel file",
            "  - Contains all characteristics with:",
            "    * Characteristic Number (balloon ID)",
            "    * Reference Location (zone)",
            "    * Requirement (dimension value)",
            "    * Sheet number (for multi-page)",
            "",
        ])
        
        if not grid_detected:
            lines.extend([
                "NOTE: Grid zones were calculated using the standard",
                "8×4 grid (H-A × 4-1) as the drawing grid was not",
                "auto-detected. Verify zones manually if needed.",
                "",
            ])
        
        lines.extend([
            "-" * 60,
            "Generated by AutoBalloon - autoballoon.space",
            "-" * 60,
        ])
        
        return "\n".join(lines)


# Singleton instance
download_service = DownloadService()
