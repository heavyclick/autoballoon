"""
Detection Service
Orchestrates OCR + Gemini Vision fusion for accurate dimension detection.

Strategy:
1. OCR provides ALL text with precise bounding boxes
2. Gemini identifies which text values are dimensions (semantic filtering)
3. This service matches Gemini's dimension list against OCR results
4. Output: Only dimensions, with precise bounding boxes from OCR

FIXED: Now handles compound dimensions like "Ø3.4 (2x)" where OCR detects
"Ø3.4" and "(2x)" as separate boxes. Merges nearby modifier boxes.
"""
import re
from typing import Optional
from difflib import SequenceMatcher

from services.ocr_service import OCRService, OCRDetection, create_ocr_service
from services.vision_service import VisionService, create_vision_service
from models import Dimension, BoundingBox, ErrorCode
from config import HIGH_CONFIDENCE_THRESHOLD, MEDIUM_CONFIDENCE_THRESHOLD


class DetectionServiceError(Exception):
    """Custom exception for detection service errors"""
    def __init__(self, code: ErrorCode, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class DetectionService:
    """
    Fuses OCR and Gemini Vision results for accurate dimension detection.
    """
    
    # Patterns that indicate modifier-only text (not the main dimension value)
    MODIFIER_PATTERN = re.compile(
        r'^[\(\[]?\d+[xX][\)\]]?$|'  # (2x), 2x, [4x], etc.
        r'^[xX]\d+$|'                 # x2, x4
        r'^TYP(?:ICAL)?$|'            # TYP, TYPICAL
        r'^REF(?:ERENCE)?$|'          # REF, REFERENCE
        r'^C/?C$|'                     # C/C, CC
        r'^C-C$|'                      # C-C
        r'^B\.?C\.?$|'                # B.C., BC
        r'^PCD$|'                      # PCD
        r'^MAX(?:IMUM)?$|'            # MAX, MAXIMUM
        r'^MIN(?:IMUM)?$|'            # MIN, MINIMUM
        r'^NOM(?:INAL)?$|'            # NOM, NOMINAL
        r'^BSC$|'                      # BSC
        r'^BASIC$|'                    # BASIC
        r'^THRU$|'                     # THRU
        r'^DEEP$|'                     # DEEP
        r'^DP$|'                       # DP
        r'^\d+\s*PL(?:ACES?)?\.?$|'   # 2 PL, 4 PLACES
        r'^EQ\.?\s*SP\.?$',            # EQ SP, EQ.SP.
        re.IGNORECASE
    )
    
    def __init__(
        self, 
        ocr_service: Optional[OCRService] = None,
        vision_service: Optional[VisionService] = None
    ):
        self.ocr_service = ocr_service
        self.vision_service = vision_service
    
    async def detect_dimensions(
        self,
        image_bytes: bytes,
        image_width: int,
        image_height: int
    ) -> list[Dimension]:
        """
        Detect dimensions using hybrid OCR + Gemini approach.
        """
        # Step 1: Run OCR to get all text with precise bounding boxes
        ocr_detections = await self._run_ocr(image_bytes, image_width, image_height)
        
        # Step 2: Run Gemini to identify which values are dimensions
        dimension_values = await self._run_gemini(image_bytes)
        
        # Step 3: Match Gemini's dimensions against OCR results
        matched_dimensions = self._match_dimensions(ocr_detections, dimension_values)
        
        # Step 4: Sort in reading order and assign IDs
        sorted_dimensions = self._sort_reading_order(matched_dimensions)
        
        # Step 5: Assign sequential IDs
        final_dimensions = []
        for idx, dim in enumerate(sorted_dimensions, start=1):
            dim.id = idx
            final_dimensions.append(dim)
        
        return final_dimensions
    
    async def _run_ocr(
        self, 
        image_bytes: bytes, 
        image_width: int, 
        image_height: int
    ) -> list[OCRDetection]:
        """Run OCR and group adjacent text"""
        if not self.ocr_service:
            return []
        
        try:
            detections = await self.ocr_service.detect_text(
                image_bytes, image_width, image_height
            )
            # Group adjacent text (e.g., "12" "." "50" → "12.50")
            grouped = self.ocr_service.group_adjacent_text(detections)
            return grouped
        except Exception as e:
            print(f"OCR error (continuing with Gemini): {e}")
            return []
    
    async def _run_gemini(self, image_bytes: bytes) -> list[str]:
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
        """
        Check if OCR text is a modifier only (not the main dimension value).
        
        Examples: "(2x)", "TYP", "REF", "C/C", "MAX", "THRU"
        """
        cleaned = text.strip()
        return bool(self.MODIFIER_PATTERN.match(cleaned))
    
    def _extract_base_value(self, dimension: str) -> str:
        """
        Extract the base numeric value from a compound dimension.
        
        Examples:
            "Ø3.4 (2x)" -> "Ø3.4"
            "35 C/C" -> "35"
            "0.95 REF" -> "0.95"
            "R5 TYP" -> "R5"
        """
        # Remove common modifiers from the end
        base = dimension
        
        # Remove quantity markers: (2x), (4x), etc.
        base = re.sub(r'\s*[\(\[]\d+[xX][\)\]]\s*$', '', base)
        
        # Remove common suffix modifiers
        base = re.sub(r'\s+(TYP|TYPICAL|REF|REFERENCE|C/C|C-C|B\.?C\.?|PCD|MAX|MIN|NOM|BSC|BASIC|THRU|DEEP|EQ\s*SP)\.?\s*$', '', base, flags=re.IGNORECASE)
        
        # Remove place indicators: 2 PL, 4 PLACES
        base = re.sub(r'\s+\d+\s*PL(ACES?)?\.?\s*$', '', base, flags=re.IGNORECASE)
        
        return base.strip()
    
    def _merge_bounding_boxes(self, boxes: list[dict]) -> dict:
        """Merge multiple bounding boxes into one that encompasses all."""
        if not boxes:
            return boxes[0] if boxes else {}
        
        xmin = min(b['xmin'] for b in boxes)
        ymin = min(b['ymin'] for b in boxes)
        xmax = max(b['xmax'] for b in boxes)
        ymax = max(b['ymax'] for b in boxes)
        
        return {
            'xmin': xmin,
            'ymin': ymin,
            'xmax': xmax,
            'ymax': ymax
        }
    
    def _find_nearby_modifiers(
        self, 
        base_ocr: OCRDetection, 
        ocr_detections: list[OCRDetection],
        used_indices: set
    ) -> list[OCRDetection]:
        """
        Find modifier OCR boxes near the base dimension box.
        
        Modifiers like "(2x)" are often directly below or beside the main value.
        """
        nearby = []
        base_box = base_ocr.bounding_box
        
        # Calculate proximity thresholds based on box size
        # Modifiers are typically within 1-2x the height of the base text
        height = base_box['ymax'] - base_box['ymin']
        width = base_box['xmax'] - base_box['xmin']
        
        y_threshold = max(height * 2.5, 80)  # Vertical proximity
        x_threshold = max(width * 2, 100)    # Horizontal proximity
        
        base_center_x = (base_box['xmin'] + base_box['xmax']) / 2
        base_center_y = (base_box['ymin'] + base_box['ymax']) / 2
        
        for ocr in ocr_detections:
            if id(ocr) in used_indices:
                continue
            if ocr is base_ocr:
                continue
            
            # Only consider modifier-only text
            if not self._is_modifier_only(ocr.text):
                continue
            
            ocr_box = ocr.bounding_box
            ocr_center_x = (ocr_box['xmin'] + ocr_box['xmax']) / 2
            ocr_center_y = (ocr_box['ymin'] + ocr_box['ymax']) / 2
            
            # Check if within proximity thresholds
            x_dist = abs(ocr_center_x - base_center_x)
            y_dist = abs(ocr_center_y - base_center_y)
            
            if x_dist < x_threshold and y_dist < y_threshold:
                nearby.append(ocr)
        
        return nearby
    
    def _match_dimensions(
        self, 
        ocr_detections: list[OCRDetection],
        gemini_dimensions: list[str]
    ) -> list[Dimension]:
        """
        Match Gemini's dimension list against OCR detections.
        Now handles compound dimensions by merging modifier boxes.
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
                
                # Mark any merged modifier boxes as used too
                if merged_box:
                    for ocr in ocr_detections:
                        if self._is_modifier_only(ocr.text):
                            # Check if this modifier's box is part of the merged box
                            ocr_box = ocr.bounding_box
                            if (ocr_box['xmin'] >= merged_box['xmin'] and 
                                ocr_box['xmax'] <= merged_box['xmax'] and
                                ocr_box['ymin'] >= merged_box['ymin'] and 
                                ocr_box['ymax'] <= merged_box['ymax']):
                                used_ocr_indices.add(id(ocr))
                
                combined_confidence = ocr_detection.confidence * match_confidence
                
                # Use merged box if available, otherwise use OCR box
                final_box = merged_box if merged_box else ocr_detection.bounding_box
                
                matched.append(Dimension(
                    id=0,
                    value=dim_value,  # Use Gemini's full value with modifiers
                    zone=None,
                    bounding_box=BoundingBox(**final_box),
                    confidence=combined_confidence
                ))
            else:
                print(f"No OCR match for dimension: {dim_value}")
        
        return matched
    
    def _find_best_ocr_match(
        self,
        dimension_value: str,
        ocr_detections: list[OCRDetection],
        used_indices: set
    ) -> Optional[tuple[OCRDetection, float, Optional[dict]]]:
        """
        Find the OCR detection that best matches the dimension value.
        
        Returns tuple of (OCRDetection, match_confidence, merged_bounding_box) or None.
        The merged_bounding_box is set when modifiers are merged with the base.
        """
        normalized_dim = self._normalize_for_matching(dimension_value)
        base_value = self._extract_base_value(dimension_value)
        normalized_base = self._normalize_for_matching(base_value)
        
        best_match = None
        best_score = 0.0
        best_merged_box = None
        
        for ocr in ocr_detections:
            if id(ocr) in used_indices:
                continue
            
            # Skip modifier-only OCR boxes as primary matches
            if self._is_modifier_only(ocr.text):
                continue
            
            normalized_ocr = self._normalize_for_matching(ocr.text)
            
            # === PASS 1: Exact match on full dimension ===
            if normalized_dim == normalized_ocr:
                return (ocr, 1.0, None)
            
            # === PASS 2: Exact match on base value ===
            # e.g., Gemini="Ø3.4 (2x)", OCR="Ø3.4"
            if normalized_base == normalized_ocr:
                # Found base match - look for nearby modifiers to merge
                nearby_modifiers = self._find_nearby_modifiers(ocr, ocr_detections, used_indices)
                
                if nearby_modifiers:
                    # Merge bounding boxes
                    all_boxes = [ocr.bounding_box] + [m.bounding_box for m in nearby_modifiers]
                    merged_box = self._merge_bounding_boxes(all_boxes)
                    return (ocr, 0.95, merged_box)
                else:
                    # No modifiers found, but base matches - still a good match
                    return (ocr, 0.9, None)
            
            # === PASS 3: OCR text contained in dimension (base match) ===
            # e.g., Gemini="35 C/C", OCR="35"
            if normalized_ocr in normalized_dim:
                # Make sure it's a substantial match (not just "5" in "35")
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
            
            # === PASS 4: Fuzzy match (last resort) ===
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
            "ø": "o",
            "⌀": "o",
            "°": "",
            "±": "+-",
            " ": "",
            ",": ".",
        }
        
        for old, new in replacements.items():
            normalized = normalized.replace(old, new)
        
        normalized = re.sub(r'[^\w.\-+/]', '', normalized)
        
        return normalized
    
    def _fuzzy_match_score(self, s1: str, s2: str) -> float:
        """Calculate fuzzy match score between two strings"""
        return SequenceMatcher(None, s1, s2).ratio()
    
    def _sort_reading_order(self, dimensions: list[Dimension]) -> list[Dimension]:
        """Sort dimensions in reading order (top-to-bottom, left-to-right)."""
        if not dimensions:
            return []
        
        band_height = 100
        
        def get_band(dim: Dimension) -> int:
            center_y = dim.bounding_box.center_y
            return center_y // band_height
        
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
