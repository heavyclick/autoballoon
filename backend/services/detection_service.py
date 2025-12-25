"""
Detection Service
Orchestrates OCR + Gemini Vision fusion for accurate dimension detection.

Strategy:
1. OCR provides ALL text with precise bounding boxes
2. Gemini identifies which text values are dimensions (semantic filtering)
3. This service matches Gemini's dimension list against OCR results
4. Output: Only dimensions, with precise bounding boxes from OCR
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
        
        Args:
            image_bytes: PNG image data
            image_width: Image width in pixels
            image_height: Image height in pixels
            
        Returns:
            List of Dimension objects sorted in reading order
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
            # Log error but continue with Gemini-only fallback
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
            # Log error but continue
            print(f"Gemini error: {e}")
            return []
    
    def _match_dimensions(
        self, 
        ocr_detections: list[OCRDetection],
        gemini_dimensions: list[str]
    ) -> list[Dimension]:
        """
        Match Gemini's dimension list against OCR detections.
        
        For each dimension Gemini identified, find the best matching
        OCR detection to get precise bounding box.
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
                
                # Combine confidences: Gemini says it's a dimension, OCR provides location
                # Use OCR confidence adjusted by match quality
                combined_confidence = ocr_detection.confidence * match_confidence
                
                matched.append(Dimension(
                    id=0,  # Will be assigned later
                    value=dim_value,  # Use Gemini's value (may include symbols)
                    zone=None,  # Will be assigned by grid service
                    bounding_box=BoundingBox(**ocr_detection.bounding_box),
                    confidence=combined_confidence
                ))
            else:
                # Gemini found a dimension but OCR didn't detect it
                # This could happen with very small text or unusual fonts
                # Skip it rather than guess position
                print(f"No OCR match for dimension: {dim_value}")
        
        return matched
    
    def _find_best_ocr_match(
        self,
        dimension_value: str,
        ocr_detections: list[OCRDetection],
        used_indices: set
    ) -> Optional[tuple[OCRDetection, float]]:
        """
        Find the OCR detection that best matches the dimension value.
        
        Returns tuple of (OCRDetection, match_confidence) or None.
        """
        # Normalize the dimension value for matching
        normalized_dim = self._normalize_for_matching(dimension_value)
        
        best_match = None
        best_score = 0.0
        
        for ocr in ocr_detections:
            if id(ocr) in used_indices:
                continue
            
            normalized_ocr = self._normalize_for_matching(ocr.text)
            
            # Try exact match first
            if normalized_dim == normalized_ocr:
                return (ocr, 1.0)
            
            # Try containment (OCR text contains dimension or vice versa)
            if normalized_dim in normalized_ocr or normalized_ocr in normalized_dim:
                score = min(len(normalized_dim), len(normalized_ocr)) / max(len(normalized_dim), len(normalized_ocr))
                if score > best_score:
                    best_score = score
                    best_match = ocr
                continue
            
            # Fuzzy match for OCR errors
            score = self._fuzzy_match_score(normalized_dim, normalized_ocr)
            if score > best_score and score > 0.7:  # Minimum threshold
                best_score = score
                best_match = ocr
        
        if best_match:
            return (best_match, best_score)
        return None
    
    def _normalize_for_matching(self, text: str) -> str:
        """
        Normalize text for matching.
        Remove common variations that shouldn't affect matching.
        """
        # Convert to lowercase
        normalized = text.lower()
        
        # Normalize common symbol variations
        replacements = {
            "ø": "o",  # Diameter symbol
            "⌀": "o",
            "°": "",   # Degree symbol
            "±": "+-",
            " ": "",   # Remove spaces
            ",": ".",  # Decimal separator
        }
        
        for old, new in replacements.items():
            normalized = normalized.replace(old, new)
        
        # Keep only alphanumeric and basic punctuation
        normalized = re.sub(r'[^\w.\-+/]', '', normalized)
        
        return normalized
    
    def _fuzzy_match_score(self, s1: str, s2: str) -> float:
        """Calculate fuzzy match score between two strings"""
        return SequenceMatcher(None, s1, s2).ratio()
    
    def _sort_reading_order(self, dimensions: list[Dimension]) -> list[Dimension]:
        """
        Sort dimensions in reading order (top-to-bottom, left-to-right).
        
        Divides image into horizontal bands, then sorts within each band.
        """
        if not dimensions:
            return []
        
        # Define band height (10% of normalized coordinate system)
        band_height = 100  # 10% of 1000
        
        # Group dimensions into bands based on Y position
        def get_band(dim: Dimension) -> int:
            center_y = dim.bounding_box.center_y
            return center_y // band_height
        
        # Sort by band (Y), then by X position within band
        return sorted(
            dimensions,
            key=lambda d: (get_band(d), d.bounding_box.center_x)
        )


def create_detection_service(
    ocr_api_key: Optional[str] = None,
    gemini_api_key: Optional[str] = None
) -> DetectionService:
    """
    Factory function to create detection service with configured API services.
    """
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
