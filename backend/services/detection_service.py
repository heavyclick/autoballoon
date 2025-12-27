"""
Detection Service - Enhanced Multi-Page Support with Improved Detection
Orchestrates OCR + Gemini Vision fusion for accurate dimension detection.

FIXES APPLIED:
- Debug logging for troubleshooting
- Fixed deduplication (by location, not value)
- Better tolerance stack grouping
- Better mixed fraction handling
- Thread callout extraction
"""
import re
import json
import time
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, asdict
from difflib import SequenceMatcher
from datetime import datetime

from services.ocr_service import OCRService, OCRDetection, create_ocr_service
from services.vision_service import VisionService, create_vision_service
from services.file_service import FileService, PageImage, FileProcessingResult
from models.schemas import Dimension, BoundingBox, ErrorCode


# Global debug storage (last N processing results)
DEBUG_LOG = []
MAX_DEBUG_ENTRIES = 10


def get_debug_log():
    """Return the debug log for the /api/debug endpoint"""
    return DEBUG_LOG


def add_debug_entry(entry: dict):
    """Add a debug entry, keeping only the last N"""
    global DEBUG_LOG
    entry['timestamp'] = datetime.utcnow().isoformat()
    DEBUG_LOG.append(entry)
    if len(DEBUG_LOG) > MAX_DEBUG_ENTRIES:
        DEBUG_LOG = DEBUG_LOG[-MAX_DEBUG_ENTRIES:]


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
    """
    
    # Modifier pattern - things that modify dimensions but aren't dimensions themselves
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
        r'^Key$|'
        r'^[+-]$',
        re.IGNORECASE
    )
    
    # Thread callout patterns
    THREAD_PATTERN = re.compile(
        r'(?:'
        r'(?:\#?\d+|\d+/\d+)\s*-\s*\d+\s*(?:UNC|UNF|UN|UNEF|UNJC|UNJF)?\s*(?:THD|THREAD|THRD)?|'
        r'M\d+(?:\.\d+)?\s*[xX×-]\s*\d+(?:\.\d+)?|'
        r'\d+/\d+\s*-?\s*\d*\s*(?:NPT|NPTF|BSPT|BSPP|NPS)|'
        r'[Ff]or\s+(?:\#?\d+|\d+/\d+)\s*-\s*\d+'
        r')',
        re.IGNORECASE
    )
    
    # Tolerance pattern - matches -0.0015, +0.002, etc.
    TOLERANCE_PATTERN = re.compile(r'^[+-]\s*[\d.]+$')
    
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
        debug_entry = {
            'filename': filename,
            'pages': []
        }
        
        file_result = self.file_service.process_file(file_bytes, filename)
        
        if not file_result.success:
            debug_entry['error'] = file_result.error_message
            add_debug_entry(debug_entry)
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
            page_debug = {'page_number': page_image.page_number}
            
            page_dimensions, page_debug_info = await self._detect_dimensions_on_page(
                page_image.image_bytes,
                page_image.width,
                page_image.height
            )
            
            page_debug.update(page_debug_info)
            
            grid_detected = True
            
            for dim in page_dimensions:
                dim.zone = self._calculate_zone(
                    dim.bounding_box.center_x,
                    dim.bounding_box.center_y,
                    None
                )
                dim.id = current_dimension_id
                dim.page = page_image.page_number
                current_dimension_id += 1
            
            page_debug['final_dimensions'] = [{'id': d.id, 'value': d.value, 'zone': d.zone} for d in page_dimensions]
            debug_entry['pages'].append(page_debug)
            
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
        
        debug_entry['total_dimensions'] = len(all_dimensions)
        add_debug_entry(debug_entry)
        
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
    ) -> Tuple[List[Dimension], dict]:
        """Detect dimensions for a single page with enhanced detection."""
        debug_info = {}
        
        # Step 1: Run OCR
        raw_ocr = await self._run_ocr_raw(image_bytes, image_width, image_height)
        debug_info['raw_ocr_count'] = len(raw_ocr)
        debug_info['raw_ocr_sample'] = [d.text for d in raw_ocr[:30]]  # First 30 tokens
        
        # Step 2: Group OCR results
        grouped_ocr = self._group_ocr_detections(raw_ocr)
        debug_info['grouped_ocr_count'] = len(grouped_ocr)
        debug_info['grouped_ocr'] = [d.text for d in grouped_ocr]
        
        # Step 3: Run Gemini
        gemini_dimensions = await self._run_gemini(image_bytes)
        debug_info['gemini_dimensions'] = gemini_dimensions
        
        # Step 4: Extract thread callouts from OCR (Gemini sometimes misses these)
        thread_callouts = self._extract_thread_callouts(grouped_ocr)
        debug_info['thread_callouts_from_ocr'] = thread_callouts
        
        # Add threads not already in Gemini's list
        for thread in thread_callouts:
            normalized_thread = self._normalize_for_matching(thread)
            if not any(self._normalize_for_matching(d) == normalized_thread for d in gemini_dimensions):
                gemini_dimensions.append(thread)
        
        # Step 5: Match dimensions (NO value-based deduplication - allow same value in different places)
        matched_dimensions = self._match_dimensions(grouped_ocr, gemini_dimensions)
        debug_info['matched_count'] = len(matched_dimensions)
        
        # Step 6: Sort in reading order
        sorted_dimensions = self._sort_reading_order(matched_dimensions)
        
        return sorted_dimensions, debug_info
    
    async def _run_ocr_raw(
        self, 
        image_bytes: bytes, 
        image_width: int, 
        image_height: int
    ) -> List[OCRDetection]:
        """Run OCR and return raw (ungrouped) detections"""
        if not self.ocr_service:
            return []
        
        try:
            detections = await self.ocr_service.detect_text(
                image_bytes, image_width, image_height
            )
            return detections
        except Exception as e:
            print(f"OCR error: {e}")
            return []
    
    def _group_ocr_detections(self, detections: List[OCRDetection]) -> List[OCRDetection]:
        """
        Group OCR detections into logical units.
        Handles:
        - Mixed fractions: "3" + "1/4" -> "3 1/4"
        - Tolerance stacks: "0.2500in" + "-0.0015" + "-0.0030" -> "0.2500in -0.0015 -0.0030"
        - Compound dimensions: "0.188"" + "Wd." + "x" + "7/8"" + "Lg." -> "0.188" Wd. x 7/8" Lg."
        """
        if not detections:
            return []
        
        # Sort by Y position (row), then X position (left to right)
        sorted_detections = sorted(
            detections,
            key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"])
        )
        
        grouped = []
        current_group = [sorted_detections[0]]
        
        # Thresholds (normalized 0-1000 coordinates)
        HORIZONTAL_THRESHOLD = 50  # Increased for tolerance stacks
        VERTICAL_THRESHOLD = 20    # Increased for better line detection
        
        for detection in sorted_detections[1:]:
            prev = current_group[-1]
            
            # Calculate positions
            y_diff = abs(detection.bounding_box["ymin"] - prev.bounding_box["ymin"])
            x_gap = detection.bounding_box["xmin"] - prev.bounding_box["xmax"]
            
            # Determine if we should group
            should_group = False
            curr_text = detection.text.strip()
            prev_text = prev.text.strip()
            
            # Check if on same line (or nearly same line)
            same_line = y_diff <= VERTICAL_THRESHOLD
            
            # Check horizontal proximity
            horizontally_close = -10 <= x_gap <= HORIZONTAL_THRESHOLD
            
            if same_line and horizontally_close:
                # CASE 1: Mixed fraction - whole number followed by fraction
                # "3" followed by "1/4" or "3/4"
                is_mixed_fraction = (
                    re.match(r'^\d+$', prev_text) and 
                    re.match(r'^\d+/\d+["\']?$', curr_text)
                )
                
                # CASE 2: Tolerance value following a dimension
                # "-0.0015" following "0.2500in" or another tolerance
                is_tolerance = bool(self.TOLERANCE_PATTERN.match(curr_text))
                prev_is_dimension_or_tolerance = (
                    bool(re.search(r'\d', prev_text)) or 
                    bool(self.TOLERANCE_PATTERN.match(prev_text))
                )
                is_tolerance_continuation = is_tolerance and prev_is_dimension_or_tolerance
                
                # CASE 3: Compound dimension parts
                # "Wd.", "Lg.", "x", "Key" etc.
                is_compound_modifier = bool(re.match(
                    r'^(?:x|X|×|Wd\.?|Lg\.?|Dia\.?|Rad\.?|THK\.?|Key|in|mm)$',
                    curr_text, re.IGNORECASE
                ))
                
                # CASE 4: Dimension followed by unit
                # "0.188" followed by '"' or "in"
                is_unit = curr_text in ['"', "'", "in", "mm", "cm"]
                
                # CASE 5: Previous was connector "x", current is dimension
                prev_is_connector = prev_text.lower() in ['x', '×']
                
                # CASE 6: Very small gap - likely same element
                very_small_gap = x_gap <= 15
                
                # Decide
                if is_mixed_fraction:
                    should_group = True
                elif is_tolerance_continuation:
                    should_group = True
                elif is_compound_modifier:
                    should_group = True
                elif is_unit:
                    should_group = True
                elif prev_is_connector:
                    should_group = True
                elif very_small_gap:
                    # Very small gap - group unless both look like complete standalone dimensions
                    if self._is_complete_dimension(prev_text) and self._is_complete_dimension(curr_text):
                        should_group = False
                    else:
                        should_group = True
                else:
                    # Moderate gap - be more conservative
                    if self._is_complete_dimension(prev_text) and self._is_complete_dimension(curr_text):
                        should_group = False
                    elif self._starts_new_dimension(curr_text):
                        should_group = False
                    else:
                        should_group = True
            
            if should_group:
                current_group.append(detection)
            else:
                grouped.append(self._merge_group(current_group))
                current_group = [detection]
        
        # Don't forget last group
        if current_group:
            grouped.append(self._merge_group(current_group))
        
        return grouped
    
    def _is_complete_dimension(self, text: str) -> bool:
        """Check if text is a complete standalone dimension (not needing more parts)."""
        text = text.strip()
        # Complete if: has number AND (has unit OR is a clear decimal with 2+ decimal places)
        patterns = [
            r'^\d+\s+\d+/\d+["\']$',      # Mixed fraction with unit: 3 1/4"
            r'^\d+/\d+["\']$',             # Fraction with unit: 1/4"
            r'^\d+\.?\d*["\']$',           # Decimal with unit: 0.45"
            r'^\d+\.\d{3,}\s*(?:in|mm)?$', # Long decimal: 0.2500in, 0.094
            r'^[ØøR]\d+\.?\d*["\']?$',     # Diameter/radius: Ø5, R2.5
            r'^\d+\s*mm$',                 # Metric: 32mm
        ]
        return any(re.match(p, text, re.IGNORECASE) for p in patterns)
    
    def _starts_new_dimension(self, text: str) -> bool:
        """Check if text starts a new dimension."""
        text = text.strip()
        # Starts with diameter, radius, or is a whole number (potential fraction start)
        return bool(re.match(r'^[ØøR]\d', text, re.IGNORECASE))
    
    def _merge_group(self, group: List[OCRDetection]) -> OCRDetection:
        """Merge a group of OCR detections into one."""
        if len(group) == 1:
            return group[0]
        
        # Build merged text with appropriate spacing
        texts = []
        for i, d in enumerate(group):
            curr_text = d.text
            if i > 0:
                prev = group[i - 1]
                gap = d.bounding_box["xmin"] - prev.bounding_box["xmax"]
                prev_text = prev.text.strip()
                
                # Determine spacing
                if gap > 15:
                    # Larger gap - add space
                    texts.append(" ")
                elif curr_text.startswith(('x', 'X', '×')):
                    # Space before "x" connector
                    texts.append(" ")
                elif self.TOLERANCE_PATTERN.match(curr_text):
                    # Space before tolerance
                    texts.append(" ")
                elif re.match(r'^\d+/\d+', curr_text) and prev_text.isdigit():
                    # Space between whole number and fraction (mixed fraction)
                    texts.append(" ")
                # Otherwise no space
            
            texts.append(curr_text)
        
        merged_text = "".join(texts)
        
        # Merged bounding box
        merged_box = {
            "xmin": min(d.bounding_box["xmin"] for d in group),
            "xmax": max(d.bounding_box["xmax"] for d in group),
            "ymin": min(d.bounding_box["ymin"] for d in group),
            "ymax": max(d.bounding_box["ymax"] for d in group),
        }
        
        avg_confidence = sum(d.confidence for d in group) / len(group)
        
        return OCRDetection(
            text=merged_text,
            bounding_box=merged_box,
            confidence=avg_confidence
        )
    
    def _extract_thread_callouts(self, ocr_detections: List[OCRDetection]) -> List[str]:
        """Extract thread specifications from OCR detections."""
        threads = []
        for ocr in ocr_detections:
            text = ocr.text.strip()
            if self.THREAD_PATTERN.search(text):
                threads.append(text)
        return threads
    
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
    
    def _match_dimensions(
        self, 
        ocr_detections: List[OCRDetection],
        gemini_dimensions: List[str]
    ) -> List[Dimension]:
        """
        Match Gemini's dimension list against OCR detections.
        
        IMPORTANT: Does NOT deduplicate by value - allows same dimension value
        to appear multiple times if it's in different locations on the drawing.
        """
        matched = []
        used_ocr_indices = set()
        
        for dim_value in gemini_dimensions:
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
            
            # Base value match
            if normalized_base == normalized_ocr:
                return (ocr, 0.95, None)
            
            # Partial containment
            if normalized_ocr and normalized_ocr in normalized_dim:
                score = len(normalized_ocr) / len(normalized_dim)
                if score > 0.5 and score > best_score:
                    best_score = score
                    best_match = ocr
                    best_merged_box = None
            
            # Reverse containment
            if normalized_dim and normalized_dim in normalized_ocr:
                score = len(normalized_dim) / len(normalized_ocr)
                if score > 0.5 and score > best_score:
                    best_score = score
                    best_match = ocr
                    best_merged_box = None
            
            # Fuzzy match
            fuzzy_score = self._fuzzy_match_score(normalized_base, normalized_ocr)
            if fuzzy_score > best_score and fuzzy_score > 0.7:
                best_score = fuzzy_score
                best_match = ocr
                best_merged_box = None
        
        if best_match:
            return (best_match, best_score, best_merged_box)
        return None
    
    def _is_modifier_only(self, text: str) -> bool:
        """Check if OCR text is a modifier only."""
        return bool(self.MODIFIER_PATTERN.match(text.strip()))
    
    def _extract_base_value(self, dimension: str) -> str:
        """Extract the base numeric value from a dimension."""
        base = dimension
        # Remove trailing modifiers
        base = re.sub(r'\s*[\(\[]\d+[xX][\)\]]\s*$', '', base)
        base = re.sub(r'\s+(TYP|TYPICAL|REF|REFERENCE|C/C|C-C|B\.?C\.?|PCD|MAX|MIN|NOM|BSC|BASIC|THRU|DEEP|EQ\s*SP)\.?\s*$', '', base, flags=re.IGNORECASE)
        base = re.sub(r'\s+\d+\s*PL(ACES?)?\.?\s*$', '', base, flags=re.IGNORECASE)
        base = re.sub(r'\s*(Wd|Lg|Dia|Rad|THK|Key)\.?\s*$', '', base, flags=re.IGNORECASE)
        return base.strip()
    
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
        if not s1 or not s2:
            return 0.0
        return SequenceMatcher(None, s1, s2).ratio()
    
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
