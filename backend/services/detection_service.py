"""
Detection Service
Orchestrates dimension detection using Gemini Vision with direct bounding boxes.

MAJOR ARCHITECTURE CHANGE:
- OLD: Gemini returns values -> Match against OCR for locations (UNRELIABLE)
- NEW: Gemini returns values WITH locations directly (ACCURATE)

FIX: Convert float coordinates to integers for BoundingBox model
FIX: Don't fail all dimensions if one has a bad bounding box
"""
import re
from typing import Optional

from services.ocr_service import OCRService, OCRDetection, create_ocr_service
from services.vision_service import VisionService, create_vision_service
from models import Dimension, BoundingBox, ErrorCode
from config import HIGH_CONFIDENCE_THRESHOLD, MEDIUM_CONFIDENCE_THRESHOLD, NORMALIZED_COORD_SYSTEM


class DetectionServiceError(Exception):
    """Custom exception for detection service errors"""
    def __init__(self, code: ErrorCode, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class DetectionService:
    """
    Uses Gemini Vision to detect dimensions WITH their locations directly.
    Falls back to OCR matching only if Gemini doesn't provide locations.
    """
    
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
        Detect dimensions using Gemini Vision with direct bounding boxes.
        
        Args:
            image_bytes: PNG image data
            image_width: Image width in pixels
            image_height: Image height in pixels
            
        Returns:
            List of Dimension objects sorted in reading order
        """
        if not self.vision_service:
            return []
        
        dimensions = []
        used_gemini_locations = False
        
        try:
            # Get dimensions WITH locations directly from Gemini
            dimensions_with_locations = await self.vision_service.identify_dimensions_with_locations(image_bytes)
            
            if dimensions_with_locations:
                # Convert Gemini's normalized coords (0-1) to our system (0-1000)
                dimensions = self._convert_gemini_dimensions(dimensions_with_locations)
                
                if dimensions:
                    used_gemini_locations = True
                    print(f"✓ Gemini detected {len(dimensions)} dimensions with locations")
                else:
                    print("⚠ Gemini returned dimensions but all failed to parse, falling back to OCR")
            
        except Exception as e:
            print(f"⚠ Gemini with locations failed: {e}")
        
        # Fallback to OCR matching if Gemini locations didn't work
        if not used_gemini_locations:
            print("→ Using OCR fallback matching...")
            dimensions = await self._fallback_ocr_matching(image_bytes, image_width, image_height)
        
        # Sort in reading order and assign IDs
        sorted_dimensions = self._sort_reading_order(dimensions)
        
        for idx, dim in enumerate(sorted_dimensions, start=1):
            dim.id = idx
        
        print(f"✓ Final result: {len(sorted_dimensions)} dimensions")
        return sorted_dimensions
    
    def _convert_gemini_dimensions(self, gemini_results: list[dict]) -> list[Dimension]:
        """
        Convert Gemini's dimension results to our Dimension model.
        
        Gemini returns bbox as 0-1 normalized coordinates.
        We convert to our 0-1000 normalized system as INTEGERS.
        
        IMPORTANT: Process each dimension independently so one bad bbox
        doesn't cause us to lose all dimensions.
        """
        dimensions = []
        
        for item in gemini_results:
            value = item.get("value", "")
            bbox = item.get("bbox", {})
            
            if not value:
                continue
            
            try:
                # Convert from 0-1 to 0-1000 scale AND cast to int
                # The int() cast is critical - BoundingBox expects integers!
                xmin = int(bbox.get("xmin", 0) * NORMALIZED_COORD_SYSTEM)
                ymin = int(bbox.get("ymin", 0) * NORMALIZED_COORD_SYSTEM)
                xmax = int(bbox.get("xmax", 0) * NORMALIZED_COORD_SYSTEM)
                ymax = int(bbox.get("ymax", 0) * NORMALIZED_COORD_SYSTEM)
                
                # Clamp to valid range
                xmin = max(0, min(NORMALIZED_COORD_SYSTEM, xmin))
                ymin = max(0, min(NORMALIZED_COORD_SYSTEM, ymin))
                xmax = max(0, min(NORMALIZED_COORD_SYSTEM, xmax))
                ymax = max(0, min(NORMALIZED_COORD_SYSTEM, ymax))
                
                # Ensure max > min (at least 1 unit difference)
                if xmax <= xmin:
                    xmax = min(xmin + 50, NORMALIZED_COORD_SYSTEM)
                if ymax <= ymin:
                    ymax = min(ymin + 30, NORMALIZED_COORD_SYSTEM)
                
                dimensions.append(Dimension(
                    id=0,  # Will be assigned later
                    value=value,
                    zone=None,  # Will be assigned by grid service
                    bounding_box=BoundingBox(
                        xmin=xmin,
                        ymin=ymin,
                        xmax=xmax,
                        ymax=ymax
                    ),
                    confidence=0.9  # High confidence since Gemini provided location directly
                ))
                print(f"  ✓ Parsed: {value} at ({xmin}, {ymin}) - ({xmax}, {ymax})")
                
            except Exception as e:
                # Log but continue - don't let one bad dimension break everything
                print(f"  ✗ Failed to parse dimension '{value}': {e}")
                continue
        
        return dimensions
    
    async def _fallback_ocr_matching(
        self,
        image_bytes: bytes,
        image_width: int,
        image_height: int
    ) -> list[Dimension]:
        """
        Fallback method: Use OCR + Gemini matching (old approach).
        Only used if Gemini doesn't return locations.
        """
        # Run OCR
        ocr_detections = []
        if self.ocr_service:
            try:
                detections = await self.ocr_service.detect_text(
                    image_bytes, image_width, image_height
                )
                ocr_detections = self.ocr_service.group_adjacent_text(detections)
                print(f"  OCR found {len(ocr_detections)} text regions")
            except Exception as e:
                print(f"  OCR error: {e}")
        
        # Get dimension values from Gemini (without locations)
        dimension_values = []
        if self.vision_service:
            try:
                dimension_values = await self.vision_service.identify_dimensions(image_bytes)
                print(f"  Gemini identified {len(dimension_values)} dimension values")
            except Exception as e:
                print(f"  Gemini error: {e}")
        
        # Match them
        return self._match_dimensions(ocr_detections, dimension_values)
    
    def _match_dimensions(
        self, 
        ocr_detections: list[OCRDetection],
        gemini_dimensions: list[str]
    ) -> list[Dimension]:
        """
        Match Gemini's dimension values against OCR detections.
        Uses improved matching with primary number extraction.
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
                ocr_detection, match_confidence = best_match
                used_ocr_indices.add(id(ocr_detection))
                
                combined_confidence = ocr_detection.confidence * match_confidence
                
                matched.append(Dimension(
                    id=0,
                    value=dim_value,
                    zone=None,
                    bounding_box=BoundingBox(**ocr_detection.bounding_box),
                    confidence=combined_confidence
                ))
                print(f"  ✓ Matched: {dim_value}")
            else:
                print(f"  ✗ No OCR match for dimension: {dim_value}")
        
        return matched
    
    def _extract_primary_number(self, text: str) -> Optional[str]:
        """Extract the primary numeric value from a dimension string."""
        cleaned = text.replace('Ø', '').replace('⌀', '').replace('R', '').replace('M', '')
        cleaned = cleaned.replace('°', '').replace('±', ' ').replace('×', ' ').replace('x', ' ')
        
        numbers = re.findall(r'\d+\.?\d*', cleaned)
        
        if numbers:
            return numbers[0]
        return None
    
    def _find_best_ocr_match(
        self,
        dimension_value: str,
        ocr_detections: list[OCRDetection],
        used_indices: set
    ) -> Optional[tuple[OCRDetection, float]]:
        """Find the best OCR match for a dimension value."""
        dim_primary_number = self._extract_primary_number(dimension_value)
        normalized_dim = self._normalize_for_matching(dimension_value)
        
        best_match = None
        best_score = 0.0
        
        # Pass 1: Exact primary number match
        if dim_primary_number:
            for ocr in ocr_detections:
                if id(ocr) in used_indices:
                    continue
                
                ocr_primary_number = self._extract_primary_number(ocr.text)
                
                if ocr_primary_number and ocr_primary_number == dim_primary_number:
                    return (ocr, 0.95)
        
        # Pass 2: Exact normalized match
        for ocr in ocr_detections:
            if id(ocr) in used_indices:
                continue
            
            normalized_ocr = self._normalize_for_matching(ocr.text)
            
            if normalized_dim == normalized_ocr:
                return (ocr, 1.0)
        
        # Pass 3: Containment with primary number validation
        for ocr in ocr_detections:
            if id(ocr) in used_indices:
                continue
            
            normalized_ocr = self._normalize_for_matching(ocr.text)
            ocr_primary_number = self._extract_primary_number(ocr.text)
            
            if normalized_dim in normalized_ocr or normalized_ocr in normalized_dim:
                if dim_primary_number and ocr_primary_number:
                    if dim_primary_number == ocr_primary_number:
                        score = min(len(normalized_dim), len(normalized_ocr)) / max(len(normalized_dim), len(normalized_ocr))
                        if score > best_score:
                            best_score = score
                            best_match = ocr
        
        if best_match:
            return (best_match, best_score)
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
    
    def _sort_reading_order(self, dimensions: list[Dimension]) -> list[Dimension]:
        """Sort dimensions in reading order (top-to-bottom, left-to-right)."""
        if not dimensions:
            return []
        
        band_height = 100  # 10% of 1000
        
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
