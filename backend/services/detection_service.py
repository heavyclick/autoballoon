"""
Detection Service - Enhanced Multi-Page Support with Improved Detection
Orchestrates OCR + Gemini Vision fusion for accurate dimension detection..

IMPROVEMENTS:
- Better compound dimension detection (0.188" Wd. x 7/8" Lg.)
- Tolerance stack handling (0.2500in -0.0015 -0.0030)
- Small adjacent dimension grouping
- Text notes with embedded dimensions
"""
import re
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass
from difflib import SequenceMatcher

from services.ocr_service import OCRService, OCRDetection, create_ocr_service
from services.vision_service import VisionService, create_vision_service
from services.file_service import FileService, PageImage, FileProcessingResult
from models.schemas import Dimension, BoundingBox, ErrorCode


@dataclass
class PageDetectionResult:
    """Result of dimension detection for a single page"""
    page_number: int
    dimensions: List[Dimension]
    grid_detected: bool
    image_base64: str
    width: int
    height: int


@dataclass
class MultiPageDetectionResult:
    """Result of dimension detection for all pages"""
    success: bool
    total_pages: int
    pages: List[PageDetectionResult]
    all_dimensions: List[Dimension]
    error_message: Optional[str] = None


class DetectionService:
    """
    Fuses OCR and Gemini Vision results for accurate dimension detection.
    
    ENHANCED PATTERNS for:
    - Compound dimensions: 0.188" Wd. x 7/8" Lg. Key
    - Tolerance stacks: 0.2500in -0.0015 -0.0030
    - Small dimensions close together
    - Text notes with dimensions: Usable Length Range Max.: 1 3/4"
    """
    
    # Enhanced modifier pattern to capture more cases
    MODIFIER_PATTERN = re.compile(
        r'^[\(\[]?\d+[xX][\)\]]?$|'
        r'^[xX]\d+$|'
        r'^TYP(?:ICAL)?\.?$|'
        r'^REF(?:ERENCE)?\.?$|'
        r'^C/?C$|'
        r'^C-C$|'
        r'^B\.?C\.?$|'
        r'^PCD$|'
        r'^MAX(?:IMUM)?\.?$|'
        r'^MIN(?:IMUM)?\.?$|'
        r'^NOM(?:INAL)?\.?$|'
        r'^BSC$|'
        r'^BASIC$|'
        r'^THRU$|'
        r'^DEEP$|'
        r'^DP$|'
        r'^\d+\s*PL(?:ACES?)?\.?$|'
        r'^EQ\.?\s*SP\.?$|'
        r'^Wd\.?$|'
        r'^Lg\.?$|'
        r'^Dia\.?$|'
        r'^Rad\.?$|'
        r'^THK\.?$|'
        r'^[+-]$',  # Standalone plus/minus signs
        re.IGNORECASE
    )
    
    # Pattern to identify dimension-like text
    DIMENSION_PATTERN = re.compile(
        r'''
        (?:
            # Diameter with optional tolerance
            [Øø⌀]\s*[\d.]+(?:\s*[+-]\s*[\d.]+)?|
            # Radius
            R\s*[\d.]+|
            # Fractions
            \d+\s*/\s*\d+|
            # Mixed fractions
            \d+\s+\d+\s*/\s*\d+|
            # Decimals with units
            [\d.]+\s*(?:mm|in|"|'|cm)?|
            # Tolerances
            [+-]\s*[\d.]+|
            # Angle degrees
            [\d.]+\s*[°]
        )
        ''',
        re.VERBOSE | re.IGNORECASE
    )
    
    # Enhanced compound dimension pattern
    COMPOUND_DIMENSION_PATTERN = re.compile(
        r'''
        (?:
            # Pattern: 0.188" Wd. x 7/8" Lg.
            [\d./]+\s*["\']?\s*(?:Wd|Lg|Dia|Rad|THK)\.?\s*[xX×]\s*[\d./]+\s*["\']?\s*(?:Wd|Lg|Dia|Rad|THK)\.?|
            # Pattern: 0.2500in -0.0015 -0.0030 (tolerance stack)
            [\d.]+\s*(?:in|mm)?\s*[+-][\d.]+\s*[+-][\d.]+|
            # Pattern: dimension with bilateral tolerance
            [\d.]+\s*[+-]\s*[\d.]+\s*/\s*[+-]?\s*[\d.]+
        )
        ''',
        re.VERBOSE | re.IGNORECASE
    )
    
    # Thread callout patterns (UNC, UNF, metric, pipe threads)
    THREAD_PATTERN = re.compile(
        r'''
        (?:
            # Standard inch threads: 6-32, 1/4-20, 10-24, #8-32
            (?:\#?\d+|\d+/\d+)\s*-\s*\d+\s*(?:UNC|UNF|UN|UNEF|UNJC|UNJF)?\s*(?:THD|THREAD|THRD)?|
            # Metric threads: M6x1.0, M8-1.25
            M\d+(?:\.\d+)?\s*[xX×-]\s*\d+(?:\.\d+)?|
            # Pipe threads: 1/4-18 NPT, 3/8 NPTF
            \d+/\d+\s*-?\s*\d*\s*(?:NPT|NPTF|BSPT|BSPP|NPS)|
            # "For X-XX" pattern: "For 8-32"
            [Ff]or\s+(?:\#?\d+|\d+/\d+)\s*-\s*\d+
        )
        ''',
        re.VERBOSE | re.IGNORECASE
    )
    
    STANDARD_GRID_COLUMNS = ['H', 'G', 'F', 'E', 'D', 'C', 'B', 'A']
    STANDARD_GRID_ROWS = ['4', '3', '2', '1']
    
    def __init__(
        self, 
        ocr_service: Optional[OCRService] = None,
        vision_service: Optional[VisionService] = None,
        file_service: Optional[FileService] = None,
        grid_service = None
    ):
        self.ocr_service = ocr_service
        self.vision_service = vision_service
        self.file_service = file_service or FileService()
        self.grid_service = grid_service
    
    async def detect_dimensions_multipage(
        self,
        file_bytes: bytes,
        filename: Optional[str] = None
    ) -> MultiPageDetectionResult:
        """
        Detect dimensions from a multi-page PDF or single image.
        All processing happens IN MEMORY - no file storage.
        """
        file_result = self.file_service.process_file(file_bytes, filename)
        
        if not file_result.success:
            return MultiPageDetectionResult(
                success=False,
                total_pages=0,
                pages=[],
                all_dimensions=[],
                error_message=file_result.error_message
            )
        
        page_results = []
        current_dimension_id = 1
        
        for page_image in file_result.pages:
            page_dimensions = await self._detect_dimensions_on_page(
                page_image.image_bytes,
                page_image.width,
                page_image.height
            )
            
            grid_detected = True  # Default to standard grid
            
            # Assign zones and IDs
            for dim in page_dimensions:
                dim.zone = self._calculate_zone(
                    dim.bounding_box.center_x,
                    dim.bounding_box.center_y,
                    None
                )
                dim.id = current_dimension_id
                dim.page = page_image.page_number
                current_dimension_id += 1
            
            page_results.append(PageDetectionResult(
                page_number=page_image.page_number,
                dimensions=page_dimensions,
                grid_detected=grid_detected,
                image_base64=page_image.base64_image,
                width=page_image.width,
                height=page_image.height
            ))
        
        all_dimensions = []
        for page_result in page_results:
            all_dimensions.extend(page_result.dimensions)
        
        return MultiPageDetectionResult(
            success=True,
            total_pages=file_result.total_pages,
            pages=page_results,
            all_dimensions=all_dimensions,
            error_message=file_result.error_message
        )
    
    async def _detect_dimensions_on_page(
        self,
        image_bytes: bytes,
        image_width: int,
        image_height: int
    ) -> List[Dimension]:
        """Detect dimensions for a single page with enhanced detection."""
        ocr_detections = await self._run_ocr(image_bytes, image_width, image_height)
        
        # Enhanced grouping for compound dimensions
        grouped_ocr = self._group_compound_dimensions(ocr_detections)
        
        dimension_values = await self._run_gemini(image_bytes)
        
        # Extract thread callouts from OCR (Gemini often misses these)
        thread_callouts = self._extract_thread_callouts(grouped_ocr)
        
        # Add thread callouts to dimension values if not already present
        for thread in thread_callouts:
            normalized_thread = self._normalize_for_matching(thread)
            if not any(self._normalize_for_matching(d) == normalized_thread for d in dimension_values):
                dimension_values.append(thread)
        
        matched_dimensions = self._match_dimensions(grouped_ocr, dimension_values)
        sorted_dimensions = self._sort_reading_order(matched_dimensions)
        return sorted_dimensions
    
    def _extract_thread_callouts(self, ocr_detections: List[OCRDetection]) -> List[str]:
        """Extract thread specifications from OCR detections."""
        threads = []
        for ocr in ocr_detections:
            text = ocr.text.strip()
            if self.THREAD_PATTERN.search(text):
                # Clean up the thread callout
                threads.append(text)
        return threads
    
    def _calculate_zone(
        self, 
        center_x: float, 
        center_y: float,
        grid: Optional[Dict[str, List[str]]] = None
    ) -> str:
        """Calculate grid zone for a point."""
        columns = grid['columns'] if grid else self.STANDARD_GRID_COLUMNS
        rows = grid['rows'] if grid else self.STANDARD_GRID_ROWS
        
        num_cols = len(columns)
        col_width = 1000 / num_cols
        col_idx = min(int(center_x / col_width), num_cols - 1)
        
        num_rows = len(rows)
        row_height = 1000 / num_rows
        row_idx = min(int(center_y / row_height), num_rows - 1)
        
        column_label = columns[col_idx] if col_idx < len(columns) else '?'
        row_label = rows[row_idx] if row_idx < len(rows) else '?'
        
        return f"{column_label}{row_label}"
    
    async def _run_ocr(
        self, 
        image_bytes: bytes, 
        image_width: int, 
        image_height: int
    ) -> List[OCRDetection]:
        """Run OCR and group adjacent text"""
        if not self.ocr_service:
            return []
        
        try:
            detections = await self.ocr_service.detect_text(
                image_bytes, image_width, image_height
            )
            grouped = self.ocr_service.group_adjacent_text(detections)
            return grouped
        except Exception as e:
            print(f"OCR error: {e}")
            return []
    
    async def _run_gemini(self, image_bytes: bytes) -> List[str]:
        """Run Gemini to identify dimension values"""
        if not self.vision_service:
            return []
        
        try:
            dimensions = await self.vision_service.identify_dimensions(image_bytes)
            return dimensions
        except Exception as e:
            print(f"Gemini error: {e}")
            return []
    
    def _is_modifier_only(self, text: str) -> bool:
        """Check if OCR text is a modifier only."""
        return bool(self.MODIFIER_PATTERN.match(text.strip()))
    
    def _is_tolerance_component(self, text: str) -> bool:
        """Check if text looks like a tolerance value."""
        text = text.strip()
        # Matches: -0.0015, +0.002, ±0.01, etc.
        return bool(re.match(r'^[+-±]?\s*[\d.]+$', text))
    
    def _extract_base_value(self, dimension: str) -> str:
        """Extract the base numeric value from a compound dimension."""
        base = dimension
        # Remove trailing modifiers
        base = re.sub(r'\s*[\(\[]\d+[xX][\)\]]\s*$', '', base)
        base = re.sub(r'\s+(TYP|TYPICAL|REF|REFERENCE|C/C|C-C|B\.?C\.?|PCD|MAX|MIN|NOM|BSC|BASIC|THRU|DEEP|EQ\s*SP)\.?\s*$', '', base, flags=re.IGNORECASE)
        base = re.sub(r'\s+\d+\s*PL(ACES?)?\.?\s*$', '', base, flags=re.IGNORECASE)
        # Remove Wd./Lg. style suffixes
        base = re.sub(r'\s*(Wd|Lg|Dia|Rad|THK)\.?\s*$', '', base, flags=re.IGNORECASE)
        return base.strip()
    
    def _group_compound_dimensions(
        self, 
        detections: List[OCRDetection]
    ) -> List[OCRDetection]:
        """
        Enhanced grouping to handle compound dimensions like:
        - 0.188" Wd. x 7/8" Lg. Key
        - 0.2500in -0.0015 -0.0030
        - Small dimensions close together (like 0.45" next to 3 3/4")
        """
        if not detections:
            return []
        
        # Sort by y position, then x position
        sorted_detections = sorted(
            detections, 
            key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"])
        )
        
        # Enhanced grouping with larger thresholds for compound dimensions
        grouped = []
        current_group = [sorted_detections[0]]
        
        # Thresholds (in normalized 0-1000 coordinates)
        HORIZONTAL_THRESHOLD = 40  # Increased for compound dimensions
        VERTICAL_THRESHOLD = 15    # Slightly increased
        
        for detection in sorted_detections[1:]:
            prev = current_group[-1]
            
            # Check if on same line (similar y)
            y_diff = abs(detection.bounding_box["ymin"] - prev.bounding_box["ymin"])
            
            # Check horizontal distance
            x_gap = detection.bounding_box["xmin"] - prev.bounding_box["xmax"]
            
            # Check if this looks like a tolerance continuation
            is_tolerance = self._is_tolerance_component(detection.text)
            
            # Wider tolerance for tolerance stacks
            effective_h_threshold = HORIZONTAL_THRESHOLD * 2 if is_tolerance else HORIZONTAL_THRESHOLD
            
            if y_diff <= VERTICAL_THRESHOLD and 0 <= x_gap <= effective_h_threshold:
                # Adjacent, add to current group
                current_group.append(detection)
            else:
                # Start new group
                grouped.append(self._merge_ocr_group(current_group))
                current_group = [detection]
        
        # Don't forget last group
        if current_group:
            grouped.append(self._merge_ocr_group(current_group))
        
        return grouped
    
    def _merge_ocr_group(self, group: List[OCRDetection]) -> OCRDetection:
        """Merge a group of adjacent OCR detections into one."""
        if len(group) == 1:
            return group[0]
        
        # Concatenate text with spaces where appropriate
        texts = []
        for i, d in enumerate(group):
            text = d.text
            if i > 0:
                prev = group[i-1]
                # Check if we need a space
                gap = d.bounding_box["xmin"] - prev.bounding_box["xmax"]
                if gap > 10:  # Small gap = likely needs space
                    texts.append(" " + text)
                else:
                    texts.append(text)
            else:
                texts.append(text)
        
        merged_text = "".join(texts)
        
        # Expand bounding box to encompass all
        merged_box = {
            "xmin": min(d.bounding_box["xmin"] for d in group),
            "xmax": max(d.bounding_box["xmax"] for d in group),
            "ymin": min(d.bounding_box["ymin"] for d in group),
            "ymax": max(d.bounding_box["ymax"] for d in group),
        }
        
        # Average confidence
        avg_confidence = sum(d.confidence for d in group) / len(group)
        
        return OCRDetection(
            text=merged_text,
            bounding_box=merged_box,
            confidence=avg_confidence
        )
    
    def _merge_bounding_boxes(self, boxes: List[dict]) -> dict:
        """Merge multiple bounding boxes into one."""
        if not boxes:
            return {}
        if len(boxes) == 1:
            return boxes[0]
        
        xmin = min(b['xmin'] for b in boxes)
        ymin = min(b['ymin'] for b in boxes)
        xmax = max(b['xmax'] for b in boxes)
        ymax = max(b['ymax'] for b in boxes)
        
        return {'xmin': xmin, 'ymin': ymin, 'xmax': xmax, 'ymax': ymax}
    
    def _find_nearby_modifiers(
        self, 
        base_ocr: OCRDetection, 
        ocr_detections: List[OCRDetection],
        used_indices: set
    ) -> List[OCRDetection]:
        """Find modifier OCR boxes near the base dimension box."""
        nearby = []
        base_box = base_ocr.bounding_box
        
        height = base_box['ymax'] - base_box['ymin']
        width = base_box['xmax'] - base_box['xmin']
        
        y_threshold = max(height * 2.5, 80)
        x_threshold = max(width * 2, 100)
        
        base_center_x = (base_box['xmin'] + base_box['xmax']) / 2
        base_center_y = (base_box['ymin'] + base_box['ymax']) / 2
        
        for ocr in ocr_detections:
            if id(ocr) in used_indices or ocr is base_ocr:
                continue
            
            if not self._is_modifier_only(ocr.text) and not self._is_tolerance_component(ocr.text):
                continue
            
            ocr_box = ocr.bounding_box
            ocr_center_x = (ocr_box['xmin'] + ocr_box['xmax']) / 2
            ocr_center_y = (ocr_box['ymin'] + ocr_box['ymax']) / 2
            
            x_dist = abs(ocr_center_x - base_center_x)
            y_dist = abs(ocr_center_y - base_center_y)
            
            if x_dist < x_threshold and y_dist < y_threshold:
                nearby.append(ocr)
        
        return nearby
    
    def _match_dimensions(
        self, 
        ocr_detections: List[OCRDetection],
        gemini_dimensions: List[str]
    ) -> List[Dimension]:
        """Match Gemini's dimension list against OCR detections."""
        matched = []
        used_ocr_indices = set()
        
        # Deduplicate Gemini dimensions (sometimes returns same dim twice)
        seen_dims = set()
        unique_dimensions = []
        for dim in gemini_dimensions:
            normalized = self._normalize_for_matching(dim)
            if normalized not in seen_dims:
                seen_dims.add(normalized)
                unique_dimensions.append(dim)
        
        for dim_value in unique_dimensions:
            best_match = self._find_best_ocr_match(
                dim_value, 
                ocr_detections, 
                used_ocr_indices
            )
            
            if best_match:
                ocr_detection, match_confidence, merged_box = best_match
                used_ocr_indices.add(id(ocr_detection))
                
                combined_confidence = ocr_detection.confidence * match_confidence
                final_box = merged_box if merged_box else ocr_detection.bounding_box
                
                matched.append(Dimension(
                    id=0,
                    value=dim_value,
                    zone=None,
                    bounding_box=BoundingBox(**final_box),
                    confidence=combined_confidence,
                    page=1
                ))
        
        return matched
    
    def _find_best_ocr_match(
        self,
        dimension_value: str,
        ocr_detections: List[OCRDetection],
        used_indices: set
    ) -> Optional[tuple]:
        """Find the OCR detection that best matches the dimension value."""
        normalized_dim = self._normalize_for_matching(dimension_value)
        base_value = self._extract_base_value(dimension_value)
        normalized_base = self._normalize_for_matching(base_value)
        
        best_match = None
        best_score = 0.0
        best_merged_box = None
        
        for ocr in ocr_detections:
            if id(ocr) in used_indices:
                continue
            
            if self._is_modifier_only(ocr.text):
                continue
            
            normalized_ocr = self._normalize_for_matching(ocr.text)
            
            # Exact match
            if normalized_dim == normalized_ocr:
                return (ocr, 1.0, None)
            
            # Base value match (dimension without modifiers)
            if normalized_base == normalized_ocr:
                nearby_modifiers = self._find_nearby_modifiers(ocr, ocr_detections, used_indices)
                if nearby_modifiers:
                    all_boxes = [ocr.bounding_box] + [m.bounding_box for m in nearby_modifiers]
                    merged_box = self._merge_bounding_boxes(all_boxes)
                    return (ocr, 0.95, merged_box)
                else:
                    return (ocr, 0.9, None)
            
            # Partial match - OCR text is contained in dimension
            if normalized_ocr in normalized_dim:
                if len(normalized_ocr) >= len(normalized_base) * 0.5:
                    nearby_modifiers = self._find_nearby_modifiers(ocr, ocr_detections, used_indices)
                    score = len(normalized_ocr) / len(normalized_dim)
                    if nearby_modifiers:
                        all_boxes = [ocr.bounding_box] + [m.bounding_box for m in nearby_modifiers]
                        merged_box = self._merge_bounding_boxes(all_boxes)
                        if score > best_score:
                            best_score = score
                            best_match = ocr
                            best_merged_box = merged_box
                    else:
                        if score > best_score:
                            best_score = score
                            best_match = ocr
                            best_merged_box = None
            
            # Fuzzy match
            score = self._fuzzy_match_score(normalized_base, normalized_ocr)
            if score > best_score and score > 0.7:
                best_score = score
                best_match = ocr
                best_merged_box = None
        
        if best_match:
            return (best_match, best_score, best_merged_box)
        return None
    
    def _normalize_for_matching(self, text: str) -> str:
        """Normalize text for matching."""
        normalized = text.lower()
        replacements = {
            "ø": "o", "⌀": "o", "°": "", "±": "+-", " ": "", ",": ".",
            '"': '', "'": '', "″": "", "′": ""
        }
        for old, new in replacements.items():
            normalized = normalized.replace(old, new)
        normalized = re.sub(r'[^\w.\-+/]', '', normalized)
        return normalized
    
    def _fuzzy_match_score(self, s1: str, s2: str) -> float:
        """Calculate fuzzy match score."""
        return SequenceMatcher(None, s1, s2).ratio()
    
    def _sort_reading_order(self, dimensions: List[Dimension]) -> List[Dimension]:
        """Sort dimensions in reading order."""
        if not dimensions:
            return []
        
        band_height = 100
        
        def get_band(dim: Dimension) -> int:
            return int(dim.bounding_box.center_y) // band_height
        
        return sorted(
            dimensions,
            key=lambda d: (get_band(d), d.bounding_box.center_x)
        )


def create_detection_service(
    ocr_api_key: Optional[str] = None,
    gemini_api_key: Optional[str] = None
) -> DetectionService:
    """Factory function to create detection service."""
    ocr_service = None
    vision_service = None
    
    try:
        if ocr_api_key:
            ocr_service = create_ocr_service(ocr_api_key)
    except ValueError:
        pass
    
    try:
        if gemini_api_key:
            vision_service = create_vision_service(gemini_api_key)
    except ValueError:
        pass
    
    return DetectionService(
        ocr_service=ocr_service,
        vision_service=vision_service
    )
