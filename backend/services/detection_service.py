"""
Detection Service - Enhanced with Gemini Location Hints
Orchestrates OCR + Gemini Vision fusion for accurate dimension detection.

KEY IMPROVEMENTS:
1. Gemini returns dimensions WITH approximate bounding boxes
2. Better handling of partial OCR matches
3. Prevents over-grouping of adjacent dimensions
4. Handles vertical tolerance stacks
5. Uses pattern library for robust detection
"""
import re
import json
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, asdict
from difflib import SequenceMatcher
from datetime import datetime

from services.ocr_service import OCRService, OCRDetection, create_ocr_service
from services.vision_service import VisionService, create_vision_service
from services.file_service import FileService, PageImage, FileProcessingResult
from services.pattern_library import ManufacturingPatterns, PATTERNS
from models.schemas import Dimension, BoundingBox, ErrorCode


# Global debug storage
DEBUG_LOG = []
MAX_DEBUG_ENTRIES = 10


def get_debug_log():
    """Return the debug log for the /api/debug endpoint"""
    return DEBUG_LOG


def add_debug_entry(entry: dict):
    """Add a debug entry"""
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


@dataclass
class GeminiDimension:
    """Dimension returned by Gemini with location hint"""
    value: str
    x_percent: float  # Approximate x position (0-100)
    y_percent: float  # Approximate y position (0-100)
    confidence: float


class DetectionService:
    """
    Enhanced dimension detection with Gemini location hints.
    """
    
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
        """Detect dimensions from a multi-page PDF or single image."""
        debug_entry = {'filename': filename, 'pages': []}
        
        file_result = self.file_service.process_file(file_bytes, filename)
        
        if not file_result.success:
            debug_entry['error'] = file_result.error_message
            add_debug_entry(debug_entry)
            return MultiPageDetectionResult(
                success=False, total_pages=0, pages=[], all_dimensions=[],
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
            
            for dim in page_dimensions:
                dim.zone = self._calculate_zone(
                    dim.bounding_box.center_x,
                    dim.bounding_box.center_y,
                    None
                )
                dim.id = current_dimension_id
                dim.page = page_image.page_number
                current_dimension_id += 1
            
            page_debug['final_dimensions'] = [
                {'id': d.id, 'value': d.value, 'zone': d.zone} 
                for d in page_dimensions
            ]
            debug_entry['pages'].append(page_debug)
            
            page_results.append(PageDetectionResult(
                page_number=page_image.page_number,
                dimensions=page_dimensions,
                grid_detected=True,
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
            all_dimensions=all_dimensions
        )
    
    async def _detect_dimensions_on_page(
        self,
        image_bytes: bytes,
        image_width: int,
        image_height: int
    ) -> Tuple[List[Dimension], dict]:
        """Detect dimensions for a single page."""
        debug_info = {}
        
        # Step 1: Run OCR - get RAW tokens
        raw_ocr = await self._run_ocr_raw(image_bytes, image_width, image_height)
        debug_info['raw_ocr_count'] = len(raw_ocr)
        debug_info['raw_ocr_sample'] = [d.text for d in raw_ocr[:30]]
        
        # Step 2: Smart grouping - avoid over-grouping complete dimensions
        grouped_ocr = self._smart_group_ocr(raw_ocr)
        debug_info['grouped_ocr_count'] = len(grouped_ocr)
        debug_info['grouped_ocr'] = [d.text for d in grouped_ocr]
        
        # Step 3: Run Gemini with location hints
        gemini_dimensions = await self._run_gemini_with_locations(image_bytes)
        debug_info['gemini_dimensions'] = [
            {'value': d.value, 'x': d.x_percent, 'y': d.y_percent} 
            for d in gemini_dimensions
        ]
        
        # Step 4: Extract thread callouts from OCR as backup
        thread_callouts = self._extract_thread_callouts(grouped_ocr)
        debug_info['thread_callouts_from_ocr'] = thread_callouts
        
        # Step 5: Match with improved algorithm
        matched_dimensions = self._match_dimensions_smart(
            grouped_ocr, 
            raw_ocr,
            gemini_dimensions,
            thread_callouts
        )
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
        """Run OCR and return raw detections."""
        if not self.ocr_service:
            return []
        
        try:
            return await self.ocr_service.detect_text(
                image_bytes, image_width, image_height
            )
        except Exception as e:
            print(f"OCR error: {e}")
            return []
    
    def _smart_group_ocr(self, detections: List[OCRDetection]) -> List[OCRDetection]:
        """
        Smart grouping that:
        1. Groups tolerance stacks (including vertical)
        2. Groups mixed fractions
        3. Groups compound dimensions (Wd. x Lg.)
        4. Does NOT merge two complete standalone dimensions
        """
        if not detections:
            return []
        
        # Sort by Y, then X
        sorted_dets = sorted(
            detections,
            key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"])
        )
        
        # Build adjacency groups
        groups = []
        used = set()
        
        for i, det in enumerate(sorted_dets):
            if i in used:
                continue
            
            group = [det]
            used.add(i)
            
            # Look for adjacent tokens to merge
            self._expand_group(group, i, sorted_dets, used)
            
            groups.append(group)
        
        # Merge each group
        return [self._merge_group_smart(g) for g in groups]
    
    def _expand_group(
        self, 
        group: List[OCRDetection], 
        start_idx: int,
        all_dets: List[OCRDetection],
        used: set
    ):
        """Expand a group by finding related tokens."""
        HORIZONTAL_THRESHOLD = 60
        VERTICAL_THRESHOLD = 25
        VERTICAL_STACK_THRESHOLD = 40
        
        for i, det in enumerate(all_dets):
            if i in used:
                continue
            
            for group_det in group:
                gbox = group_det.bounding_box
                dbox = det.bounding_box
                
                g_center_x = (gbox["xmin"] + gbox["xmax"]) / 2
                g_center_y = (gbox["ymin"] + gbox["ymax"]) / 2
                d_center_x = (dbox["xmin"] + dbox["xmax"]) / 2
                d_center_y = (dbox["ymin"] + dbox["ymax"]) / 2
                
                x_diff = abs(d_center_x - g_center_x)
                y_diff = abs(d_center_y - g_center_y)
                x_gap = dbox["xmin"] - gbox["xmax"]
                
                curr_text = det.text.strip()
                prev_text = group_det.text.strip()
                
                should_merge = False
                
                # CASE 1: Horizontal adjacency (same line)
                if y_diff <= VERTICAL_THRESHOLD and -10 <= x_gap <= HORIZONTAL_THRESHOLD:
                    should_merge = self._should_merge_horizontal(prev_text, curr_text, x_gap)
                
                # CASE 2: Vertical tolerance stack
                elif x_diff <= 30 and 0 < (d_center_y - g_center_y) <= VERTICAL_STACK_THRESHOLD:
                    if PATTERNS.is_tolerance(curr_text):
                        should_merge = True
                
                if should_merge:
                    group.append(det)
                    used.add(i)
                    self._expand_group(group, i, all_dets, used)
                    break
    
    def _should_merge_horizontal(self, prev: str, curr: str, gap: float) -> bool:
        """Determine if two horizontal tokens should merge."""
        
        # 1. Mixed fraction: "3" + "1/4"
        if prev.isdigit() and re.match(r'^\d+/\d+["\']?$', curr):
            return True
        
        # 2. Fraction + unit: "1/4" + '"'
        if re.match(r'^\d+/\d+$', prev) and curr in ['"', "'", "in", "mm"]:
            return True
        
        # 3. Tolerance
        if PATTERNS.is_tolerance(curr):
            return True
        
        # 4. Compound modifiers
        if re.match(r'^(?:x|X|×|Wd\.?|Lg\.?|Dia\.?|Rad\.?|THK\.?|Key)$', curr, re.IGNORECASE):
            return True
        
        # 5. Previous is connector
        if prev.lower() in ['x', '×']:
            return True
        
        # 6. Unit after number
        if re.match(r'^\d+\.?\d*$', prev) and curr.lower() in ['in', 'mm', 'cm', '"', "'"]:
            return True
        
        # 7. Thread continuation
        if re.match(r'^(?:UN[CFJ]?|NPT|SAE|\(SAE\)|Thread|THD|UNF|UNC)$', curr, re.IGNORECASE):
            return True
        
        # 8. Dash or slash (part of thread callout)
        if curr in ['-', '/', '(', ')'] or prev in ['-', '/']:
            return True
        
        # DON'T merge two complete standalone dimensions
        if self._is_complete_dimension(prev) and self._is_complete_dimension(curr):
            return False
        
        # Default: merge if gap is small and not both complete
        return gap <= 25
    
    def _is_complete_dimension(self, text: str) -> bool:
        """Check if text is a complete standalone dimension."""
        text = text.strip()
        patterns = [
            r'^\d+\s+\d+/\d+["\']$',        # Mixed: 3 1/4"
            r'^\d+/\d+["\']$',               # Fraction: 1/4"
            r'^\d+\.?\d*["\']$',             # Decimal with unit: 0.45"
            r'^\d+\.\d{2,}(?:in|mm)?$',      # Long decimal: 0.2500in
            r'^[Øø]\d+\.?\d*["\']?$',        # Diameter
            r'^R\d+\.?\d*["\']?$',           # Radius
            r'^\d+(?:\.\d+)?\s*mm$',         # Metric
        ]
        return any(re.match(p, text, re.IGNORECASE) for p in patterns)
    
    def _merge_group_smart(self, group: List[OCRDetection]) -> OCRDetection:
        """Merge a group with smart spacing."""
        if len(group) == 1:
            return group[0]
        
        group.sort(key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"]))
        
        texts = []
        for i, det in enumerate(group):
            curr_text = det.text
            
            if i > 0:
                prev = group[i - 1]
                prev_box = prev.bounding_box
                curr_box = det.bounding_box
                
                y_diff = curr_box["ymin"] - prev_box["ymax"]
                if y_diff > 10:
                    texts.append(" ")
                else:
                    x_gap = curr_box["xmin"] - prev_box["xmax"]
                    
                    if x_gap > 15:
                        texts.append(" ")
                    elif curr_text.lower().startswith(('x', '×')):
                        texts.append(" ")
                    elif PATTERNS.is_tolerance(curr_text):
                        texts.append(" ")
                    elif re.match(r'^\d+/\d+', curr_text) and prev.text.strip().isdigit():
                        texts.append(" ")
            
            texts.append(curr_text)
        
        merged_text = "".join(texts)
        
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
    
    def _extract_thread_callouts(self, detections: List[OCRDetection]) -> List[str]:
        """Extract thread specifications from OCR."""
        threads = []
        for det in detections:
            if PATTERNS.is_thread_callout(det.text):
                threads.append(det.text)
        return threads
    
    async def _run_gemini_with_locations(
        self, 
        image_bytes: bytes
    ) -> List[GeminiDimension]:
        """Run Gemini and get dimensions with approximate locations."""
        if not self.vision_service:
            return []
        
        try:
            result = await self.vision_service.identify_dimensions_with_locations(image_bytes)
            return [
                GeminiDimension(
                    value=d['value'],
                    x_percent=d.get('x', 50),
                    y_percent=d.get('y', 50),
                    confidence=d.get('confidence', 0.8)
                )
                for d in result
            ]
        except Exception as e:
            print(f"Gemini with locations error: {e}")
            try:
                dims = await self.vision_service.identify_dimensions(image_bytes)
                return [
                    GeminiDimension(value=d, x_percent=50, y_percent=50, confidence=0.7)
                    for d in dims
                ]
            except Exception as e2:
                print(f"Gemini fallback error: {e2}")
                return []
    
    def _match_dimensions_smart(
        self,
        grouped_ocr: List[OCRDetection],
        raw_ocr: List[OCRDetection],
        gemini_dims: List[GeminiDimension],
        thread_callouts: List[str]
    ) -> List[Dimension]:
        """Smart matching algorithm."""
        matched = []
        used_ocr = set()
        
        gemini_values = {self._normalize(g.value) for g in gemini_dims}
        for thread in thread_callouts:
            if self._normalize(thread) not in gemini_values:
                gemini_dims.append(GeminiDimension(
                    value=thread, x_percent=50, y_percent=50, confidence=0.6
                ))
        
        for gem_dim in gemini_dims:
            result = self._find_best_match(
                gem_dim, grouped_ocr, raw_ocr, used_ocr
            )
            
            if result:
                ocr_det, confidence = result
                used_ocr.add(id(ocr_det))
                
                matched.append(Dimension(
                    id=0,
                    value=gem_dim.value,
                    zone=None,
                    bounding_box=BoundingBox(**ocr_det.bounding_box),
                    confidence=confidence,
                    page=1
                ))
        
        return matched
    
    def _find_best_match(
        self,
        gem_dim: GeminiDimension,
        grouped_ocr: List[OCRDetection],
        raw_ocr: List[OCRDetection],
        used: set
    ) -> Optional[Tuple[OCRDetection, float]]:
        """Find best OCR match for a Gemini dimension."""
        
        normalized_gem = self._normalize(gem_dim.value)
        
        # Strategy 1: Exact match
        for ocr in grouped_ocr:
            if id(ocr) in used:
                continue
            if self._normalize(ocr.text) == normalized_gem:
                return (ocr, 1.0)
        
        # Strategy 2: Partial/fuzzy match
        best_partial = None
        best_partial_score = 0.5
        
        for ocr in grouped_ocr:
            if id(ocr) in used:
                continue
            
            norm_ocr = self._normalize(ocr.text)
            
            if normalized_gem in norm_ocr or norm_ocr in normalized_gem:
                if len(norm_ocr) > 0 and len(normalized_gem) > 0:
                    score = min(len(normalized_gem), len(norm_ocr)) / max(len(normalized_gem), len(norm_ocr))
                    if score > best_partial_score:
                        best_partial = ocr
                        best_partial_score = score
            
            fuzzy_score = SequenceMatcher(None, normalized_gem, norm_ocr).ratio()
            if fuzzy_score > best_partial_score:
                best_partial = ocr
                best_partial_score = fuzzy_score
        
        if best_partial and best_partial_score > 0.6:
            return (best_partial, best_partial_score)
        
        # Strategy 3: Combine raw OCR tokens
        combined = self._try_combine_raw_ocr(gem_dim.value, raw_ocr, used)
        if combined:
            return combined
        
        # Strategy 4: Location-based
        if gem_dim.x_percent != 50 or gem_dim.y_percent != 50:
            location_match = self._find_by_location(gem_dim, grouped_ocr, used)
            if location_match:
                return location_match
        
        return None
    
    def _try_combine_raw_ocr(
        self,
        target: str,
        raw_ocr: List[OCRDetection],
        used: set
    ) -> Optional[Tuple[OCRDetection, float]]:
        """Try to combine raw OCR tokens that form the target."""
        
        normalized_target = self._normalize(target)
        
        candidates = []
        for ocr in raw_ocr:
            if id(ocr) in used:
                continue
            norm_ocr = self._normalize(ocr.text)
            if norm_ocr and len(norm_ocr) >= 1 and norm_ocr in normalized_target:
                candidates.append(ocr)
        
        if len(candidates) < 2:
            return None
        
        candidates.sort(key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"]))
        
        # Check spatial proximity
        max_gap = 100
        filtered = [candidates[0]]
        for c in candidates[1:]:
            prev = filtered[-1]
            x_gap = abs(c.bounding_box["xmin"] - prev.bounding_box["xmax"])
            y_gap = abs(c.bounding_box["ymin"] - prev.bounding_box["ymin"])
            if x_gap < max_gap and y_gap < 50:
                filtered.append(c)
        
        if len(filtered) < 2:
            return None
        
        combined_text = " ".join(c.text for c in filtered)
        combined_norm = self._normalize(combined_text)
        
        similarity = SequenceMatcher(None, normalized_target, combined_norm).ratio()
        
        if similarity > 0.6:
            combined_box = {
                "xmin": min(c.bounding_box["xmin"] for c in filtered),
                "xmax": max(c.bounding_box["xmax"] for c in filtered),
                "ymin": min(c.bounding_box["ymin"] for c in filtered),
                "ymax": max(c.bounding_box["ymax"] for c in filtered),
            }
            
            combined_det = OCRDetection(
                text=combined_text,
                bounding_box=combined_box,
                confidence=sum(c.confidence for c in filtered) / len(filtered)
            )
            
            for c in filtered:
                used.add(id(c))
            
            return (combined_det, similarity)
        
        return None
    
    def _find_by_location(
        self,
        gem_dim: GeminiDimension,
        ocr_list: List[OCRDetection],
        used: set
    ) -> Optional[Tuple[OCRDetection, float]]:
        """Find OCR match based on location hint."""
        
        target_x = gem_dim.x_percent * 10
        target_y = gem_dim.y_percent * 10
        
        best_match = None
        best_distance = float('inf')
        
        for ocr in ocr_list:
            if id(ocr) in used:
                continue
            
            if not PATTERNS.is_dimension_text(ocr.text):
                continue
            
            box = ocr.bounding_box
            center_x = (box["xmin"] + box["xmax"]) / 2
            center_y = (box["ymin"] + box["ymax"]) / 2
            
            distance = ((center_x - target_x) ** 2 + (center_y - target_y) ** 2) ** 0.5
            
            if distance < best_distance and distance < 200:
                best_distance = distance
                best_match = ocr
        
        if best_match:
            confidence = max(0.5, 1.0 - (best_distance / 200))
            return (best_match, confidence)
        
        return None
    
    def _normalize(self, text: str) -> str:
        """Normalize text for comparison."""
        if not text:
            return ""
        
        normalized = text.lower()
        
        replacements = {
            "ø": "o", "⌀": "o", "°": "", "±": "+-", 
            '"': '', "'": '', "″": "", "′": "",
            " ": "", ",": ".", "–": "-", "—": "-"
        }
        for old, new in replacements.items():
            normalized = normalized.replace(old, new)
        
        normalized = re.sub(r'[^\w.\-+/]', '', normalized)
        
        return normalized
    
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
