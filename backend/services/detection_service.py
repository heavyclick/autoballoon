"""
Detection Service - AS9102 Compliant Dimension Detection
Orchestrates OCR + Gemini Vision fusion for accurate dimension detection.

Key improvements:
1. Better OCR grouping - keeps modifiers with dimensions
2. Vertical text grouping - "For 3.0in" + "Flange OD" below
3. No over-grouping - two separate dimensions stay separate
4. Location-based matching using Gemini coordinates
5. Dynamic Thresholds - adapts to drawing scale (zoom level)
"""
import re
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass
from difflib import SequenceMatcher
from datetime import datetime

from services.ocr_service import OCRService, OCRDetection, create_ocr_service
from services.vision_service import VisionService, create_vision_service
from services.file_service import FileService, PageImage, FileProcessingResult
from services.pattern_library import PATTERNS
from models.schemas import Dimension, BoundingBox, ErrorCode


# Debug storage
DEBUG_LOG = []
MAX_DEBUG_ENTRIES = 10


def get_debug_log():
    return DEBUG_LOG


def add_debug_entry(entry: dict):
    global DEBUG_LOG
    entry['timestamp'] = datetime.utcnow().isoformat()
    DEBUG_LOG.append(entry)
    if len(DEBUG_LOG) > MAX_DEBUG_ENTRIES:
        DEBUG_LOG = DEBUG_LOG[-MAX_DEBUG_ENTRIES:]


@dataclass
class GeminiDimension:
    """Dimension from Gemini with location."""
    value: str
    x_percent: float
    y_percent: float
    confidence: float


@dataclass
class PageDetectionResult:
    page_number: int
    dimensions: List[Dimension]
    grid_detected: bool
    image_base64: str
    width: int
    height: int


@dataclass
class MultiPageDetectionResult:
    success: bool
    total_pages: int
    pages: List[PageDetectionResult]
    all_dimensions: List[Dimension]
    error_message: Optional[str] = None


class DetectionService:
    """AS9102-compliant dimension detection."""
    
    STANDARD_GRID_COLUMNS = ['H', 'G', 'F', 'E', 'D', 'C', 'B', 'A']
    STANDARD_GRID_ROWS = ['4', '3', '2', '1']
    
    # Patterns for dimension modifiers that should stay attached
    MODIFIER_PATTERNS = [
        r'^\d+[xX]$',           # 4X, 2X
        r'^[xX]\d+$',           # x4, x2
        r'^\(\d+[xX]\)$',       # (4X)
        r'^TYP\.?$',            # TYP
        r'^REF\.?$',            # REF
    ]
    
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
        """Detect dimensions from PDF or image."""
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
        current_id = 1
        
        for page_image in file_result.pages:
            page_debug = {'page_number': page_image.page_number}
            
            dimensions, debug_info = await self._detect_on_page(
                page_image.image_bytes,
                page_image.width,
                page_image.height
            )
            
            page_debug.update(debug_info)
            
            for dim in dimensions:
                dim.zone = self._calculate_zone(
                    dim.bounding_box.center_x,
                    dim.bounding_box.center_y
                )
                dim.id = current_id
                dim.page = page_image.page_number
                current_id += 1
            
            page_debug['final_dimensions'] = [
                {'id': d.id, 'value': d.value, 'zone': d.zone} 
                for d in dimensions
            ]
            debug_entry['pages'].append(page_debug)
            
            page_results.append(PageDetectionResult(
                page_number=page_image.page_number,
                dimensions=dimensions,
                grid_detected=True,
                image_base64=page_image.base64_image,
                width=page_image.width,
                height=page_image.height
            ))
        
        all_dims = []
        for pr in page_results:
            all_dims.extend(pr.dimensions)
        
        debug_entry['total_dimensions'] = len(all_dims)
        add_debug_entry(debug_entry)
        
        return MultiPageDetectionResult(
            success=True,
            total_pages=file_result.total_pages,
            pages=page_results,
            all_dimensions=all_dims
        )
    
    async def _detect_on_page(
        self,
        image_bytes: bytes,
        width: int,
        height: int
    ) -> Tuple[List[Dimension], dict]:
        """Detect dimensions on single page."""
        debug = {}
        
        # 1. Get raw OCR
        raw_ocr = await self._run_ocr(image_bytes, width, height)
        debug['raw_ocr_count'] = len(raw_ocr)
        debug['raw_ocr_sample'] = [d.text for d in raw_ocr[:30]]
        
        # NEW: Calculate dynamic metrics (Average Character Height)
        avg_height = self._calculate_avg_char_height(raw_ocr)
        debug['avg_char_height'] = avg_height
        
        # 2. Group OCR intelligently - PASS avg_height
        grouped_ocr = self._group_ocr(raw_ocr, avg_height)
        debug['grouped_ocr_count'] = len(grouped_ocr)
        debug['grouped_ocr'] = [d.text for d in grouped_ocr]
        
        # 3. Get Gemini dimensions with locations
        gemini_dims = await self._run_gemini(image_bytes)
        debug['gemini_dimensions'] = [
            {'value': d.value, 'x': d.x_percent, 'y': d.y_percent}
            for d in gemini_dims
        ]
        
        # 4. Match using LOCATION-FIRST strategy - PASS avg_height
        matched = self._match_by_location(grouped_ocr, raw_ocr, gemini_dims, avg_height)
        debug['matched_count'] = len(matched)
        
        # 5. Sort reading order
        sorted_dims = self._sort_reading_order(matched)
        
        return sorted_dims, debug
    
    def _calculate_avg_char_height(self, detections: List[OCRDetection]) -> float:
        """Calculate the average height of text characters on the page."""
        if not detections:
            return 10.0  # Safe default
            
        heights = []
        for d in detections:
            h = d.bounding_box["ymax"] - d.bounding_box["ymin"]
            # Filter out noise (dots) or huge logos/borders
            if 5 < h < 200:
                heights.append(h)
        
        if not heights:
            return 10.0
            
        return sum(heights) / len(heights)

    async def _run_ocr(self, image_bytes: bytes, w: int, h: int) -> List[OCRDetection]:
        """Run OCR."""
        if not self.ocr_service:
            return []
        try:
            return await self.ocr_service.detect_text(image_bytes, w, h)
        except Exception as e:
            print(f"OCR error: {e}")
            return []
    
    async def _run_gemini(self, image_bytes: bytes) -> List[GeminiDimension]:
        """Run Gemini with locations."""
        if not self.vision_service:
            return []
        try:
            results = await self.vision_service.identify_dimensions_with_locations(image_bytes)
            return [
                GeminiDimension(
                    value=d['value'],
                    x_percent=d.get('x', 50),
                    y_percent=d.get('y', 50),
                    confidence=d.get('confidence', 0.8)
                )
                for d in results
            ]
        except Exception as e:
            print(f"Gemini error: {e}")
            return []
    
    def _group_ocr(self, detections: List[OCRDetection], avg_height: float = 10.0) -> List[OCRDetection]:
        """
        Group OCR tokens using dynamic thresholds based on text size.
        """
        if not detections:
            return []
        
        # Sort by Y then X
        sorted_dets = sorted(
            detections,
            key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"])
        )
        
        # Dynamic thresholds with FLOORS to prevent splitting
        # Floor of 40 ensures we don't split valid text just because font is small
        H_THRESH = max(40, int(avg_height * 3.0))   
        V_THRESH = int(avg_height * 0.6)   
        V_STACK = int(avg_height * 2.5)    
        
        groups = []
        used = set()
        
        for i, det in enumerate(sorted_dets):
            if i in used:
                continue
            
            group = [det]
            used.add(i)
            
            # Pass dynamic thresholds to expand_group
            self._expand_group(group, sorted_dets, used, H_THRESH, V_THRESH, V_STACK)
            groups.append(group)
        
        return [self._merge_group(g) for g in groups]
    
    def _expand_group(
        self,
        group: List[OCRDetection],
        all_dets: List[OCRDetection],
        used: set,
        h_thresh: int,
        v_thresh: int,
        v_stack: int
    ):
        """Expand group by finding related tokens."""
        changed = True
        while changed:
            changed = False
            
            for i, det in enumerate(all_dets):
                if i in used:
                    continue
                
                for g_det in list(group):
                    if self._should_group(g_det, det, h_thresh, v_thresh, v_stack):
                        group.append(det)
                        used.add(i)
                        changed = True
                        break
    
    def _should_group(
        self,
        det1: OCRDetection,
        det2: OCRDetection,
        h_thresh: int,
        v_thresh: int,
        v_stack: int
    ) -> bool:
        """Determine if two detections should be grouped."""
        b1 = det1.bounding_box
        b2 = det2.bounding_box
        
        # Calculate positions
        c1_x = (b1["xmin"] + b1["xmax"]) / 2
        c1_y = (b1["ymin"] + b1["ymax"]) / 2
        c2_x = (b2["xmin"] + b2["xmax"]) / 2
        c2_y = (b2["ymin"] + b2["ymax"]) / 2
        
        x_gap = b2["xmin"] - b1["xmax"]
        y_diff = abs(c2_y - c1_y)
        x_diff = abs(c2_x - c1_x)
        
        t1 = det1.text.strip()
        t2 = det2.text.strip()
        
        # Case 1: Horizontal adjacency (same line)
        if y_diff <= v_thresh and -5 <= x_gap <= h_thresh:
            return self._should_merge_horizontal(t1, t2, x_gap)
        
        # Case 2: Vertical stacking (text below)
        # Use v_stack for vertical gap, and loose horizontal alignment check
        if x_diff <= h_thresh * 1.5 and 0 < (c2_y - c1_y) <= v_stack:
            return self._should_merge_vertical(t1, t2)
        
        return False
    
    def _should_merge_horizontal(self, prev: str, curr: str, gap: float) -> bool:
        """Should horizontally adjacent tokens merge?"""
        
        # FIX #1: Clean comparison to handle chaining properly
        # Instead of 'if prev in [...]', check the LAST WORD of prev
        prev_last = prev.strip().split()[-1] if prev.strip() else ""
        curr_first = curr.strip().split()[0] if curr.strip() else ""
        
        # Modifier + dimension: "4X" + "0.2in"
        if self._is_modifier(prev_last) and self._looks_like_dimension(curr):
            return True
        
        # Dimension + modifier: "0.2in" + "4X"
        if self._looks_like_dimension(prev_last) and self._is_modifier(curr):
            return True
            
        # Suffix description: "0.160in" + "For..."
        if self._looks_like_dimension(prev_last) and curr.lower().startswith('for'):
            return True

        # "Teeth", "Pitch", "Places" usage
        if prev_last.isdigit() and re.match(r'^(?:Teeth|Tooth|Pitch|Places|Plcs|Holes|Slots)$', curr, re.IGNORECASE):
            return True
        
        # FIX #2: Pitch Diameter / Connector Logic
        # Allow chaining: "Pitch" (from previous group) + "Diameter" (current)
        connectors = ['x', '×', 'wd', 'lg', 'pitch', 'teeth', 'diameter', 'dia', 'major', 'minor']
        if prev_last.lower() in connectors:
            return True
            
        # Or if current starts with connector
        if re.match(r'^(?:x|X|×|Wd\.?|Lg\.?|Key|OD|ID|Pitch|Teeth|Diameter|Dia\.?|Major|Minor)$', curr, re.IGNORECASE):
            return True
        
        # Mixed fraction: "3" + "1/4"
        if prev_last.isdigit() and re.match(r'^\d+/\d+["\']?$', curr):
            return True
        
        # Fraction + unit: "1/4" + '"'
        if re.match(r'^\d+/\d+$', prev_last) and curr in ['"', "'", "in", "mm"]:
            return True
        
        # Tolerance
        if PATTERNS.is_tolerance(curr):
            return True
        
        # Thread parts
        if re.match(r'^(?:UN[CF]?|UNF|NPT|SAE|\(SAE\)|Thread|THD)$', curr, re.IGNORECASE):
            return True
        
        # Continuation chars
        if curr in ['-', '/', '(', ')', ':']:
            return True
        if prev_last in ['-', '/', ':', 'For', 'for']:
            return True
        
        # Unit after number
        if re.match(r'^[\d.]+$', prev_last) and curr.lower() in ['in', 'mm', '"', "'"]:
            return True
        
        # Small gap simple merge
        if gap <= 15:
            if not (self._is_complete_dim(prev) and self._is_complete_dim(curr)):
                return True
        
        return gap <= 20
    
    def _should_merge_vertical(self, upper: str, lower: str) -> bool:
        """Should vertically stacked tokens merge?"""
        
        # Tolerance below dimension
        if PATTERNS.is_tolerance(lower):
            return True
        
        # Descriptive label below dimension
        if re.match(r'^(?:Flange|Tube|OD|ID|Pipe|Thread|For|Pitch|Teeth|Max|Min|Typ|Diameter|Dia\.?|Major|Minor)$', lower, re.IGNORECASE):
            return True
        
        # "OD" or "ID" labels
        if lower.upper() in ['OD', 'ID']:
            return True
        
        return False
    
    def _is_modifier(self, text: str) -> bool:
        """Is this a quantity/type modifier?"""
        text = text.strip()
        for pat in self.MODIFIER_PATTERNS:
            if re.match(pat, text, re.IGNORECASE):
                return True
        return False
    
    def _looks_like_dimension(self, text: str) -> bool:
        """Does this look like a dimension value?"""
        text = text.strip()
        patterns = [
            r'^\d+\.?\d*["\']?$',      # 0.2, 0.2", 25
            r'^\d+/\d+["\']?$',         # 1/4"
            r'^\d+\s+\d+/\d+["\']?$',   # 3 1/4"
            r'^\d+\.?\d*(?:in|mm)$',    # 0.2in, 25mm
            r'^[ØøR]\d+',               # Ø5, R2.5
        ]
        return any(re.match(p, text, re.IGNORECASE) for p in patterns)
    
    def _is_complete_dim(self, text: str) -> bool:
        """Is this a complete standalone dimension?"""
        text = text.strip()
        patterns = [
            r'^\d+\s+\d+/\d+["\']$',    # 3 1/4"
            r'^\d+/\d+["\']$',           # 1/4"
            r'^\d+\.?\d*["\']$',         # 0.45"
            r'^\d+\.\d{2,}(?:in|mm)?$',  # 0.2500in
            r'^[ØøR]\d+\.?\d*["\']?$',   # Ø5
            r'^\d+(?:\.\d+)?\s*mm$',     # 32mm
        ]
        return any(re.match(p, text, re.IGNORECASE) for p in patterns)
    
    def _merge_group(self, group: List[OCRDetection]) -> OCRDetection:
        """Merge group into single detection."""
        if len(group) == 1:
            return group[0]
        
        # Sort by position
        group.sort(key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"]))
        
        # Build text with spacing
        parts = []
        for i, det in enumerate(group):
            if i > 0:
                prev = group[i-1]
                # Check if vertical vs horizontal
                y_gap = det.bounding_box["ymin"] - prev.bounding_box["ymax"]
                x_gap = det.bounding_box["xmin"] - prev.bounding_box["xmax"]
                
                if y_gap > 8:
                    # Vertical - space
                    parts.append(" ")
                elif x_gap > 10:
                    # Horizontal with gap
                    parts.append(" ")
                # else: no space
            
            parts.append(det.text)
        
        merged_text = "".join(parts)
        
        merged_box = {
            "xmin": min(d.bounding_box["xmin"] for d in group),
            "xmax": max(d.bounding_box["xmax"] for d in group),
            "ymin": min(d.bounding_box["ymin"] for d in group),
            "ymax": max(d.bounding_box["ymax"] for d in group),
        }
        
        return OCRDetection(
            text=merged_text,
            bounding_box=merged_box,
            confidence=sum(d.confidence for d in group) / len(group)
        )
    
    def _match_by_location(
        self,
        grouped_ocr: List[OCRDetection],
        raw_ocr: List[OCRDetection],
        gemini_dims: List[GeminiDimension],
        avg_height: float = 10.0  # Pass avg_height
    ) -> List[Dimension]:
        """
        Match Gemini dimensions to OCR using LOCATION as primary factor.
        """
        matched = []
        used_ocr_ids = set()
        
        for gem in gemini_dims:
            # Convert Gemini's percentage to normalized coords (0-1000)
            target_x = gem.x_percent * 10
            target_y = gem.y_percent * 10
            
            # Dynamic max distance
            max_dist = max(150, avg_height * 5.0) 
            
            best_match = None
            best_score = 0
            
            # === STRATEGY 1: Location + Text Combined ===
            for ocr in grouped_ocr:
                if id(ocr) in used_ocr_ids:
                    continue
                
                box = ocr.bounding_box
                ocr_x = (box["xmin"] + box["xmax"]) / 2
                ocr_y = (box["ymin"] + box["ymax"]) / 2
                
                distance = ((ocr_x - target_x) ** 2 + (ocr_y - target_y) ** 2) ** 0.5
                text_score = self._text_similarity(gem.value, ocr.text)
                
                if text_score < 0.15:
                    continue
                
                location_score = max(0, 1 - (distance / max_dist))
                
                # Combined score
                if location_score > 0.3 and text_score > 0.3:
                    combined = (location_score * 0.5) + (text_score * 0.5)
                    if combined > best_score:
                        best_score = combined
                        best_match = ocr
            
            # === STRATEGY 2: Prioritize Text Match ===
            if not best_match or best_score < 0.5:
                text_candidates = []
                for ocr in grouped_ocr:
                    if id(ocr) in used_ocr_ids:
                        continue
                    
                    text_score = self._text_similarity(gem.value, ocr.text)
                    if text_score >= 0.5:
                        box = ocr.bounding_box
                        ocr_x = (box["xmin"] + box["xmax"]) / 2
                        ocr_y = (box["ymin"] + box["ymax"]) / 2
                        distance = ((ocr_x - target_x) ** 2 + (ocr_y - target_y) ** 2) ** 0.5
                        
                        max_allowed = max_dist * 1.5 if text_score > 0.7 else max_dist
                        if distance < max_allowed:
                            text_candidates.append((ocr, text_score, distance))
                
                if text_candidates:
                    text_candidates.sort(key=lambda x: (-x[1], x[2]))
                    best_match = text_candidates[0][0]
                    best_score = text_candidates[0][1]
            
            # === STRATEGY 3: Combine Raw OCR Tokens ===
            if not best_match or best_score < 0.5:
                combined_match = self._try_combine_nearby(
                    gem, raw_ocr, target_x, target_y, used_ocr_ids, max_dist
                )
                if combined_match:
                    verify_score = self._text_similarity(gem.value, combined_match.text)
                    if verify_score > 0.5:
                        best_match = combined_match
                        best_score = verify_score
            
            # === STRATEGY 4 (NEW): Gemini Trust Fallback ===
            # If no OCR match found, but Gemini was confident, USE GEMINI directly
            # This handles cases where OCR completely failed to group "0.500 Pitch Dia"
            if not best_match and gem.confidence > 0.85:
                # Create a "virtual" match at the location Gemini said
                # We define a small box around the target point
                virtual_box = {
                    "xmin": target_x - 30, "xmax": target_x + 30,
                    "ymin": target_y - 15, "ymax": target_y + 15
                }
                matched.append(Dimension(
                    id=0,
                    value=gem.value,
                    zone=None,
                    bounding_box=BoundingBox(**virtual_box),
                    confidence=gem.confidence,
                    page=1
                ))
                continue # Skip the normal append below

            # Normal append if match found
            if best_match:
                used_ocr_ids.add(id(best_match))
                matched.append(Dimension(
                    id=0,
                    value=gem.value,
                    zone=None,
                    bounding_box=BoundingBox(**best_match.bounding_box),
                    confidence=best_score,
                    page=1
                ))
        
        return matched
    
    def _text_similarity(self, s1: str, s2: str) -> float:
        """Calculate text similarity."""
        n1 = self._normalize(s1)
        n2 = self._normalize(s2)
        
        if n1 == n2:
            return 1.0
        if n1 in n2 or n2 in n1:
            return 0.8
        
        return SequenceMatcher(None, n1, n2).ratio()
    
    def _normalize(self, text: str) -> str:
        """Normalize for comparison."""
        if not text:
            return ""
        n = text.lower()
        for old, new in [('ø', 'o'), ('"', ''), ("'", ''), (' ', ''), ('–', '-')]:
            n = n.replace(old, new)
        return re.sub(r'[^\w.\-+/]', '', n)
    
    def _try_combine_nearby(
        self,
        gem: GeminiDimension,
        raw_ocr: List[OCRDetection],
        target_x: float,
        target_y: float,
        used: set,
        max_dist: float = 150.0  # Pass dynamic dist
    ) -> Optional[OCRDetection]:
        """Try to combine raw OCR tokens near the target location."""
        
        nearby = []
        for ocr in raw_ocr:
            if id(ocr) in used:
                continue
            
            box = ocr.bounding_box
            cx = (box["xmin"] + box["xmax"]) / 2
            cy = (box["ymin"] + box["ymax"]) / 2
            
            dist = ((cx - target_x) ** 2 + (cy - target_y) ** 2) ** 0.5
            if dist < max_dist:  # Within range
                nearby.append((ocr, dist))
        
        if not nearby:
            return None
        
        nearby.sort(key=lambda x: x[1])
        candidates = [n[0] for n in nearby[:6]]
        target_norm = self._normalize(gem.value)
        
        for size in range(len(candidates), 0, -1):
            for combo in self._combinations(candidates, size):
                combo_sorted = sorted(combo, key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"]))
                combo_text = " ".join(d.text for d in combo_sorted)
                combo_norm = self._normalize(combo_text)
                
                similarity = SequenceMatcher(None, target_norm, combo_norm).ratio()
                if similarity > 0.7:
                    return OCRDetection(
                        text=combo_text,
                        bounding_box={
                            "xmin": min(d.bounding_box["xmin"] for d in combo_sorted),
                            "xmax": max(d.bounding_box["xmax"] for d in combo_sorted),
                            "ymin": min(d.bounding_box["ymin"] for d in combo_sorted),
                            "ymax": max(d.bounding_box["ymax"] for d in combo_sorted),
                        },
                        confidence=0.7
                    )
        
        return None
    
    def _combinations(self, items: list, size: int):
        """Generate combinations."""
        if size == 0:
            yield []
        elif items:
            for i, item in enumerate(items):
                for combo in self._combinations(items[i+1:], size-1):
                    yield [item] + combo
    
    def _calculate_zone(self, center_x: float, center_y: float) -> str:
        """Calculate grid zone."""
        cols = self.STANDARD_GRID_COLUMNS
        rows = self.STANDARD_GRID_ROWS
        
        col_idx = min(int(center_x / (1000 / len(cols))), len(cols) - 1)
        row_idx = min(int(center_y / (1000 / len(rows))), len(rows) - 1)
        
        return f"{cols[col_idx]}{rows[row_idx]}"
    
    def _sort_reading_order(self, dims: List[Dimension]) -> List[Dimension]:
        """Sort in reading order."""
        if not dims:
            return []
        
        band = 100
        return sorted(
            dims,
            key=lambda d: (int(d.bounding_box.center_y) // band, d.bounding_box.center_x)
        )


def create_detection_service(
    ocr_api_key: Optional[str] = None,
    gemini_api_key: Optional[str] = None
) -> DetectionService:
    """Create detection service."""
    ocr = None
    vision = None
    
    if ocr_api_key:
        try:
            ocr = create_ocr_service(ocr_api_key)
        except:
            pass
    
    if gemini_api_key:
        try:
            vision = create_vision_service(gemini_api_key)
        except:
            pass
    
    return DetectionService(ocr_service=ocr, vision_service=vision)
