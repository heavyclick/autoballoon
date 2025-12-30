"""
Detection Service - AS9102 Compliant Dimension Detection
Orchestrates OCR + Gemini Vision fusion for accurate dimension detection.

Key improvements:
1. Smart Parsing: Converts text strings to Engineering Math (Nominal, Tolerances)
2. GD&T Decomposition: Breaks down Feature Control Frames
3. Unit Awareness: Auto-detects Imperial vs Metric pages
4. Location Matching: Fuses Gemini semantic locations with accurate OCR text
   - Fixes "Fraction Splitting" (e.g., "5 1/8" vs "1")
   - Fixes "Balloon Swapping" (e.g., 0.188 snapping to "1")
5. Custom Grid: Supports dynamic grid recalibration
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
from models.schemas import Dimension, BoundingBox, ErrorCode, ParsedValues


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
    matched: bool = False  # Track if this dimension has been used


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
    
    # Defaults
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
                # Calculate zone using standard grid default
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
        
        # === NEW: Detect Units ===
        page_units = self._detect_page_units(raw_ocr)
        debug['detected_units'] = page_units
        
        # 2. Group OCR intelligently (FIXED: Aggressive Fraction Merging)
        grouped_ocr = self._group_ocr(raw_ocr)
        debug['grouped_ocr_count'] = len(grouped_ocr)
        debug['grouped_ocr'] = [d.text for d in grouped_ocr]
        
        # 3. Get Gemini dimensions with locations
        gemini_dims = await self._run_gemini(image_bytes)
        debug['gemini_dimensions'] = [
            {'value': d.value, 'x': d.x_percent, 'y': d.y_percent}
            for d in gemini_dims
        ]
        
        # 4. Match using LOCATION-FIRST strategy (FIXED: Exclusive Consumption)
        matched = self._match_by_location(grouped_ocr, raw_ocr, gemini_dims)
        debug['matched_count'] = len(matched)
        
        # 5. Sort reading order
        sorted_dims = self._sort_reading_order(matched)
        
        # === NEW: Smart Parse Values (Math + GD&T) ===
        for dim in sorted_dims:
            dim.parsed = self._parse_dimension_value(dim.value, page_units)
        
        return sorted_dims, debug
    
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
                    value=str(d['value']), # Ensure string
                    x_percent=d.get('x', 50),
                    y_percent=d.get('y', 50),
                    confidence=d.get('confidence', 0.8),
                    matched=False
                )
                for d in results
            ]
        except Exception as e:
            print(f"Gemini error: {e}")
            return []

    # ==========================
    # SMART PARSING & GD&T
    # ==========================
    
    def _detect_page_units(self, raw_ocr: List[OCRDetection]) -> str:
        """Scan page text for unit indicators (IN, MM)."""
        if not raw_ocr:
            return "in"
            
        sample_text = " ".join([d.text.upper() for d in raw_ocr[:50] + raw_ocr[-50:]])
        
        if "MILLIMETER" in sample_text or " MM " in sample_text or "(MM)" in sample_text:
            return "mm"
        if "INCH" in sample_text or " IN " in sample_text:
            return "in"
        return "in" 

    def _parse_dimension_value(self, value_str: str, page_units: str) -> Optional[ParsedValues]:
        """Parses dimensions AND GD&T frames."""
        try:
            clean_val = value_str.strip()
            
            # 1. GD&T Check (Pipes or Box Start)
            if '|' in clean_val or clean_val.startswith('['):
                return self._parse_gdt_frame(clean_val, page_units)
                
            # GD&T Symbol Check
            gdt_symbols = ['⌖', '⟂', '∥', '⏥', '⌓', '⏢', '↗', '◎', '∠']
            if any(clean_val.startswith(s) for s in gdt_symbols):
                return self._parse_gdt_frame(clean_val, page_units)

            # 2. Standard Dimension Parsing
            # Remove modifiers for math check
            clean_val_std = clean_val.upper().replace('Ø', '').replace('R', '')
            clean_val_std = re.sub(r'\b[2468]X\b', '', clean_val_std)
            clean_val_std = clean_val_std.replace('TYP', '').replace('REF', '')
            clean_val_std = clean_val_std.replace('"', '').replace('IN', '').replace('MM', '')
            clean_val_std = clean_val_std.strip()

            first_num_match = re.search(r'(\d+\.\d+)', clean_val_std)
            precision = 3
            if first_num_match:
                decimal_part = first_num_match.group(1).split('.')[1]
                precision = len(decimal_part)

            # TYPE A: Bilateral (0.250 ± 0.005)
            bilateral_match = re.search(r'([\d.]+)\s*(?:±|\+\/-)\s*([\d.]+)', clean_val_std)
            if bilateral_match:
                nominal = float(bilateral_match.group(1))
                tol = float(bilateral_match.group(2))
                return ParsedValues(
                    nominal=nominal,
                    upper_tol=tol,
                    lower_tol=-tol,
                    max_limit=nominal + tol,
                    min_limit=nominal - tol,
                    precision=precision,
                    units=page_units,
                    tolerance_type="bilateral"
                )

            # TYPE B: Explicit Upper/Lower (0.250 +0.005 -0.001)
            explicit_match = re.search(r'([\d.]+)\s*\+([\d.]+)\s*(?:/)?\s*[-−]([\d.]+)', clean_val_std)
            if explicit_match:
                nominal = float(explicit_match.group(1))
                upper = float(explicit_match.group(2))
                lower = float(explicit_match.group(3))
                return ParsedValues(
                    nominal=nominal,
                    upper_tol=upper,
                    lower_tol=-lower,
                    max_limit=nominal + upper,
                    min_limit=nominal - lower,
                    precision=precision,
                    units=page_units,
                    tolerance_type="limit"
                )

            # TYPE C: Single Limit (MAX/MIN)
            if 'MAX' in clean_val.upper():
                val_match = re.search(r'([\d.]+)', clean_val_std)
                if val_match:
                    val = float(val_match.group(1))
                    return ParsedValues(
                        nominal=val,
                        upper_tol=0.0,
                        lower_tol=0.0,
                        max_limit=val,
                        min_limit=0.0,
                        precision=precision,
                        units=page_units,
                        tolerance_type="max"
                    )
            
            # TYPE D: Basic / Nominal
            basic_match = re.search(r'^([\d.]+)$', clean_val_std)
            if basic_match:
                val = float(basic_match.group(1))
                return ParsedValues(
                    nominal=val,
                    upper_tol=0.0,
                    lower_tol=0.0,
                    max_limit=val,
                    min_limit=val,
                    precision=precision,
                    units=page_units,
                    tolerance_type="basic"
                )

            return None

        except Exception:
            # If parsing fails, allow standard dimension to pass through without parsing
            return None

    def _parse_gdt_frame(self, value_str: str, page_units: str) -> Optional[ParsedValues]:
        """Decomposes a Feature Control Frame."""
        try:
            parts = value_str.replace('[', '').replace(']', '').split('|')
            if len(parts) < 2:
                parts = value_str.split()
            if not parts:
                return None

            # 1. Symbol
            raw_symbol = parts[0].strip().upper()
            symbol_map = {
                '⌖': 'Position', 'POS': 'Position', 'POSITION': 'Position',
                '⟂': 'Perpendicularity', 'PERP': 'Perpendicularity',
                '∥': 'Parallelism', 'PAR': 'Parallelism',
                '⏥': 'Flatness', 'FLAT': 'Flatness',
                '⌓': 'Profile of Surface', 'PROF': 'Profile of Surface',
                '◎': 'Concentricity', '↗': 'Runout', '⏢': 'Cylindricity'
            }
            gdt_symbol = symbol_map.get(raw_symbol, raw_symbol)

            # 2. Tolerance & Modifiers
            tol_part = parts[1].strip().upper()
            tol_val_match = re.search(r'(\d+\.\d+)', tol_part)
            gdt_tolerance = float(tol_val_match.group(1)) if tol_val_match else 0.0
            
            modifiers = []
            if 'M' in tol_part or 'Ⓜ' in tol_part or '(M)' in tol_part:
                modifiers.append("MMC")
            if 'L' in tol_part or 'Ⓛ' in tol_part or '(L)' in tol_part:
                modifiers.append("LMC")
            
            # 3. Datums
            datums = []
            for p in parts[2:]:
                datum = re.sub(r'[^A-Z]', '', p.strip().upper())
                if datum:
                    datums.append(datum)
            
            return ParsedValues(
                nominal=0.0,
                upper_tol=gdt_tolerance,
                lower_tol=0.0,
                max_limit=gdt_tolerance,
                min_limit=0.0,
                precision=3,
                units=page_units,
                tolerance_type="gdt",
                is_gdt=True,
                gdt_symbol=gdt_symbol,
                gdt_tolerance=gdt_tolerance,
                gdt_modifiers=", ".join(modifiers) if modifiers else None,
                gdt_datums=", ".join(datums) if datums else None
            )
        except Exception:
            return ParsedValues(
                nominal=0.0, max_limit=0.0, min_limit=0.0,
                units=page_units, tolerance_type="gdt_error", is_gdt=True
            )
    
    # ==========================
    # CUSTOM GRID SUPPORT
    # ==========================

    def recalculate_zones(self, dimensions: List[Dimension], grid_config: Optional[Dict] = None) -> List[Dimension]:
        """
        Recalculates zones for all dimensions based on a custom grid configuration.
        Used when user calibrates the grid in the UI.
        
        grid_config format: {
            'columns': ['A', 'B', 'C'],
            'rows': ['1', '2', '3'],
            'box': {'xmin': 50, 'ymin': 50, 'xmax': 950, 'ymax': 950}  # Optional frame crop
        }
        """
        cols = grid_config.get('columns') if grid_config else self.STANDARD_GRID_COLUMNS
        rows = grid_config.get('rows') if grid_config else self.STANDARD_GRID_ROWS
        
        # Determine active area (frame) to calculate relative to
        box = grid_config.get('box') if grid_config else None
        
        for dim in dimensions:
            dim.zone = self._calculate_zone(
                dim.bounding_box.center_x,
                dim.bounding_box.center_y,
                cols,
                rows,
                box
            )
        return dimensions

    def _calculate_zone(
        self, 
        center_x: float, 
        center_y: float, 
        cols: List[str] = None, 
        rows: List[str] = None,
        box: Optional[Dict[str, float]] = None
    ) -> str:
        """Calculate grid zone with support for custom grids and frames."""
        cols = cols or self.STANDARD_GRID_COLUMNS
        rows = rows or self.STANDARD_GRID_ROWS
        
        # If a custom frame box is provided (calibration), normalize coords to that box
        if box:
            width = box['xmax'] - box['xmin']
            height = box['ymax'] - box['ymin']
            if width > 0 and height > 0:
                # Offset and scale (0-1000) relative to the box
                rel_x = (center_x - box['xmin']) / width * 1000
                rel_y = (center_y - box['ymin']) / height * 1000
                
                # Clamp to 0-1000
                center_x = max(0, min(1000, rel_x))
                center_y = max(0, min(1000, rel_y))
        
        col_idx = min(int(center_x / (1000 / len(cols))), len(cols) - 1)
        row_idx = min(int(center_y / (1000 / len(rows))), len(rows) - 1)
        
        return f"{cols[col_idx]}{rows[row_idx]}"

    # ==========================
    # CORE GROUPING & MATCHING (FIXED)
    # ==========================

    def _group_ocr(self, detections: List[OCRDetection]) -> List[OCRDetection]:
        """
        Group OCR tokens intelligently:
        - Group modifiers (4X) with adjacent dimensions
        - Group vertically stacked text (For 3.0in / Flange OD)
        - Group tolerances with base dimension
        - Aggressively merge split fractions (e.g. "5" + "1/8" -> "5 1/8")
        """
        if not detections:
            return []
        
        # Sort by Y then X
        sorted_dets = sorted(
            detections,
            key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"])
        )
        
        groups = []
        used = set()
        
        for i, det in enumerate(sorted_dets):
            if i in used:
                continue
            
            group = [det]
            used.add(i)
            
            # Try to expand this group
            self._expand_group(group, sorted_dets, used)
            groups.append(group)
        
        return [self._merge_group(g) for g in groups]
    
    def _expand_group(
        self,
        group: List[OCRDetection],
        all_dets: List[OCRDetection],
        used: set
    ):
        """Expand group by finding related tokens."""
        H_THRESH = 50   # Horizontal threshold
        V_THRESH = 25   # Vertical threshold (same line)
        V_STACK = 35    # Vertical stacking threshold
        
        changed = True
        while changed:
            changed = False
            
            for i, det in enumerate(all_dets):
                if i in used:
                    continue
                
                for g_det in list(group):
                    # Check for standard grouping logic
                    should_group = self._should_group(g_det, det, H_THRESH, V_THRESH, V_STACK)
                    
                    # Check for fraction splitting logic (e.g. "5" and "1/8")
                    if not should_group:
                        should_group = self._should_group_fraction(g_det, det)

                    if should_group:
                        group.append(det)
                        used.add(i)
                        changed = True
                        break
    
    def _should_group_fraction(self, det1: OCRDetection, det2: OCRDetection) -> bool:
        """Specific logic to catch split fractions like '5' and '1/8'."""
        b1 = det1.bounding_box
        b2 = det2.bounding_box
        
        # Must be very close horizontally
        h_dist = b2["xmin"] - b1["xmax"]
        if not (-5 < h_dist < 40): return False
        
        # Must overlap vertically
        v_overlap = min(b1["ymax"], b2["ymax"]) - max(b1["ymin"], b2["ymin"])
        if v_overlap <= 0: return False
        
        t1 = det1.text.strip()
        t2 = det2.text.strip()
        
        # Case: Number followed by Fraction ("5" + "1/8")
        if t1.replace('.','',1).isdigit() and ('/' in t2 or t2 in ['1/2','1/4','3/4','1/8']):
            return True
            
        # Case: Fraction followed by Unit ("1/2" + "in")
        if '/' in t1 and t2.lower() in ['in', 'mm', '"', "'"]:
            return True
            
        return False

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
        if x_diff <= 40 and 0 < (c2_y - c1_y) <= v_stack:
            return self._should_merge_vertical(t1, t2)
        
        return False
    
    def _should_merge_horizontal(self, prev: str, curr: str, gap: float) -> bool:
        """Should horizontally adjacent tokens merge?"""
        
        # Modifier + dimension: "4X" + "0.2in"
        if self._is_modifier(prev) and self._looks_like_dimension(curr):
            return True
        
        # Dimension + modifier: "0.2in" + "4X"
        if self._looks_like_dimension(prev) and self._is_modifier(curr):
            return True
        
        # Mixed fraction: "3" + "1/4"
        if prev.isdigit() and re.match(r'^\d+/\d+["\']?$', curr):
            return True
        
        # Fraction + unit: "1/4" + '"'
        if re.match(r'^\d+/\d+$', prev) and curr in ['"', "'", "in", "mm"]:
            return True
        
        # Tolerance: dimension + "+0.005" or "-0.003"
        if PATTERNS.is_tolerance(curr):
            return True
        
        # Compound connectors: anything + "x", "Wd.", "Lg.", "Key"
        if re.match(r'^(?:x|X|×|Wd\.?|Lg\.?|Key|OD|ID)$', curr, re.IGNORECASE):
            return True
        
        # After connector: "x" + dimension
        if prev.lower() in ['x', '×', 'wd.', 'wd', 'lg.', 'lg']:
            return True
        
        # Thread parts: dimension + "UN/UNF", "NPT", "(SAE)"
        if re.match(r'^(?:UN[CF]?|UNF|NPT|SAE|\(SAE\)|Thread|THD)$', curr, re.IGNORECASE):
            return True
        
        # Continuation chars
        if curr in ['-', '/', '(', ')', ':']:
            return True
        if prev in ['-', '/', ':', 'For', 'for']:
            return True
        
        # "For" prefix: "For" + "3.0in"
        if prev.lower() == 'for':
            return True
        
        # Unit after number
        if re.match(r'^[\d.]+$', prev) and curr.lower() in ['in', 'mm', '"', "'"]:
            return True
        
        # Small gap, neither is complete
        if gap <= 15:
            if not (self._is_complete_dim(prev) and self._is_complete_dim(curr)):
                return True
        
        # Two complete dimensions - DON'T merge
        if self._is_complete_dim(prev) and self._is_complete_dim(curr):
            return False
        
        return gap <= 20
    
    def _should_merge_vertical(self, upper: str, lower: str) -> bool:
        """Should vertically stacked tokens merge?"""
        
        # Tolerance below dimension
        if PATTERNS.is_tolerance(lower):
            return True
        
        # Descriptive label below dimension (For 3.0in / Flange OD)
        if re.match(r'^(?:Flange|Tube|OD|ID|Pipe|Thread)$', lower, re.IGNORECASE):
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
        gemini_dims: List[GeminiDimension]
    ) -> List[Dimension]:
        """
        Match Gemini dimensions to OCR using LOCATION and EXCLUSIVE CONSUMPTION.
        
        Fixes "Balloon Swapping":
        - Sorts Gemini dimensions by length (Longest first) -> "5 1/8" matches before "1"
        - Tracks 'used_ocr_ids' so "1" cannot steal the OCR box for "5 1/8"
        """
        matched = []
        used_ocr_ids = set() # Critical: Once an OCR box is used, it is GONE.
        
        # Pass 1: High Confidence Exact Matches (Text + Location)
        # Sort Gemini dims by length (descending) to match complex strings like "5 1/8" first
        gemini_dims_sorted = sorted(gemini_dims, key=lambda x: len(x.value), reverse=True)
        
        for gem in gemini_dims_sorted:
            if hasattr(gem, 'matched') and gem.matched: continue
            
            target_x = gem.x_percent * 10
            target_y = gem.y_percent * 10
            
            best_match = None
            best_score = -1
            
            for ocr in grouped_ocr:
                if id(ocr) in used_ocr_ids: continue
                
                # Text Score
                text_score = self._text_similarity(gem.value, ocr.text)
                if text_score < 0.8: continue # Must be strong match for Pass 1
                
                # Location Score
                box = ocr.bounding_box
                cx = (box["xmin"] + box["xmax"]) / 2
                cy = (box["ymin"] + box["ymax"]) / 2
                dist = ((cx - target_x)**2 + (cy - target_y)**2)**0.5
                
                if dist > 200: continue # Must be reasonably close
                
                # Combined Score
                score = text_score * 2 - (dist / 1000) # Weight text heavily
                
                if score > best_score:
                    best_score = score
                    best_match = ocr
            
            if best_match:
                used_ocr_ids.add(id(best_match))
                gem.matched = True # Mark gemini dim as handled
                matched.append(self._create_dimension(gem, best_match))

        # Pass 2: Loose Match (Location Priority) - With Guards!
        # For items like "0.188" that might have bad OCR
        for gem in gemini_dims_sorted:
            if hasattr(gem, 'matched') and gem.matched: continue
            
            target_x = gem.x_percent * 10
            target_y = gem.y_percent * 10
            
            best_match = None
            best_dist = float('inf')
            
            for ocr in grouped_ocr:
                if id(ocr) in used_ocr_ids: continue
                
                # GUARD RAIL: Must have SOME text similarity
                # Prevents "0.188" snapping to "1" just because it's close
                text_score = self._text_similarity(gem.value, ocr.text)
                if text_score < 0.3: continue 
                
                box = ocr.bounding_box
                cx = (box["xmin"] + box["xmax"]) / 2
                cy = (box["ymin"] + box["ymax"]) / 2
                dist = ((cx - target_x)**2 + (cy - target_y)**2)**0.5
                
                if dist < 250 and dist < best_dist:
                    best_dist = dist
                    best_match = ocr
            
            if best_match:
                used_ocr_ids.add(id(best_match))
                matched.append(self._create_dimension(gem, best_match))
            else:
                # Fallback: If no OCR match found, create a "floating" balloon at Gemini's location
                # This is better than placing it on wrong text
                matched.append(Dimension(
                    id=0,
                    value=gem.value,
                    zone=None,
                    bounding_box=BoundingBox(
                        xmin=target_x-20, xmax=target_x+20,
                        ymin=target_y-10, ymax=target_y+10,
                        center_x=target_x, center_y=target_y
                    ),
                    confidence=0.5,
                    page=1
                ))

        return matched

    def _create_dimension(self, gem, ocr) -> Dimension:
        """Helper to create Dimension object."""
        return Dimension(
            id=0,
            value=gem.value,
            zone=None,
            bounding_box=BoundingBox(**ocr.bounding_box),
            confidence=0.9,
            page=1
        )

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
        # Keep only alphanumeric and dots for comparison
        return re.sub(r'[^\w.]', '', n)
    
    def _try_combine_nearby(
        self,
        gem: GeminiDimension,
        raw_ocr: List[OCRDetection],
        target_x: float,
        target_y: float,
        used: set
    ) -> Optional[OCRDetection]:
        """Try to combine raw OCR tokens near the target location."""
        
        # Find tokens near target location
        nearby = []
        for ocr in raw_ocr:
            if id(ocr) in used:
                continue
            
            box = ocr.bounding_box
            cx = (box["xmin"] + box["xmax"]) / 2
            cy = (box["ymin"] + box["ymax"]) / 2
            
            dist = ((cx - target_x) ** 2 + (cy - target_y) ** 2) ** 0.5
            if dist < 150:  # Within range
                nearby.append((ocr, dist))
        
        if not nearby:
            return None
        
        # Sort by distance
        nearby.sort(key=lambda x: x[1])
        
        # Take closest few and check if they form the target
        candidates = [n[0] for n in nearby[:6]]
        
        # Try to match
        target_norm = self._normalize(gem.value)
        
        for size in range(len(candidates), 0, -1):
            for combo in self._combinations(candidates, size):
                combo_sorted = sorted(combo, key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"]))
                combo_text = " ".join(d.text for d in combo_sorted)
                combo_norm = self._normalize(combo_text)
                
                similarity = SequenceMatcher(None, target_norm, combo_norm).ratio()
                if similarity > 0.7:
                    # Create merged detection
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
