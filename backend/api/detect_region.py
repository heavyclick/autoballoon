"""
Region Detection Endpoint - Smart Center-Weighted Pipeline
POST /api/detect-region

Features:
1. Center-Weighted Priority: Focuses on text in the middle of the crop (where user clicked).
2. Intelligent Grouping: Handles "For", "Teeth", "Pitch", "Diameter" patterns.
3. Gemini Vision: Semantic understanding with center-focus prompt.
"""
import base64
import asyncio
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import re

# Import existing services
from services.ocr_service import OCRService, OCRDetection, create_ocr_service
from services.vision_service import VisionService, create_vision_service
from services.pattern_library import PATTERNS
from config import GOOGLE_CLOUD_API_KEY, GEMINI_API_KEY


class RegionDetectRequest(BaseModel):
    image: str
    width: int
    height: int


class RegionDetectResponse(BaseModel):
    success: bool
    detected_text: Optional[str] = None
    confidence: Optional[float] = None
    dimensions: Optional[List[dict]] = None
    error: Optional[str] = None
    debug: Optional[dict] = None


class RegionDetectionService:
    
    def __init__(self, ocr_service: Optional[OCRService] = None, vision_service: Optional[VisionService] = None):
        self.ocr_service = ocr_service
        self.vision_service = vision_service
    
    async def detect(self, image_bytes: bytes, width: int, height: int, include_debug: bool = False) -> RegionDetectResponse:
        """
        Detect dimension with Center-Weighting strategy.
        """
        debug_info = {
            "ocr_raw": [],
            "ocr_grouped": [],
            "sorted_candidates": [], 
            "gemini_result": None,
            "selection_reason": None
        }
        
        try:
            # 1. Run OCR
            raw_ocr = await self._run_ocr(image_bytes, width, height)
            if not raw_ocr:
                return RegionDetectResponse(success=False, error="No text detected", debug=debug_info)
            
            # 2. Group OCR tokens (includes regex fixes for "For", "Teeth", "Diameter")
            grouped_ocr = self._group_ocr(raw_ocr)
            
            # === NEW: Center-Weighting Strategy ===
            # Sort groups by distance to the center (500, 500)
            # This ensures we pick the text the user actually clicked on.
            grouped_ocr.sort(key=self._calculate_distance_to_center)
            
            debug_info["ocr_grouped"] = [d.text for d in grouped_ocr]
            debug_info["sorted_candidates"] = [
                f"{d.text} (dist: {int(self._calculate_distance_to_center(d))})" 
                for d in grouped_ocr
            ]
            
            # 3. Run Gemini (Background)
            gemini_task = asyncio.create_task(self._run_gemini(image_bytes))
            gemini_result = await gemini_task
            debug_info["gemini_result"] = gemini_result
            
            # 4. Select Best Result (Prioritizing Center Candidates)
            result = self._select_best_result(grouped_ocr, gemini_result, debug_info)
            
            if result:
                return RegionDetectResponse(
                    success=True,
                    detected_text=result["value"],
                    confidence=result.get("confidence", 0.8),
                    dimensions=[{"value": result["value"]}],
                    debug=debug_info if include_debug else None
                )
            else:
                # Fallback: Just take the most central text group if it has digits
                fallback = self._get_fallback(grouped_ocr)
                if fallback:
                    return RegionDetectResponse(
                        success=True,
                        detected_text=fallback,
                        confidence=0.5,
                        dimensions=[{"value": fallback}],
                        debug=debug_info
                    )
                
                return RegionDetectResponse(success=False, error="No dimension found", debug=debug_info)
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            return RegionDetectResponse(success=False, error=str(e), debug=debug_info)

    def _calculate_distance_to_center(self, detection: OCRDetection) -> float:
        """Calculate distance from detection center to image center (500, 500)."""
        box = detection.bounding_box
        cx = (box["xmin"] + box["xmax"]) / 2
        cy = (box["ymin"] + box["ymax"]) / 2
        return ((cx - 500) ** 2 + (cy - 500) ** 2) ** 0.5

    async def _run_ocr(self, image_bytes: bytes, width: int, height: int) -> List[OCRDetection]:
        if not self.ocr_service: return []
        try: return await self.ocr_service.detect_text(image_bytes, width, height)
        except: return []
    
    async def _run_gemini(self, image_bytes: bytes) -> Optional[str]:
        if not self.vision_service: return None
        try: return await self._call_gemini_for_region(image_bytes)
        except: return None
    
    async def _call_gemini_for_region(self, image_bytes: bytes) -> Optional[str]:
        import httpx, json
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        
        # Updated Prompt: explicitly asks to focus on CENTER
        prompt = """You are analyzing a cropped image from a blueprint.
        The user clicked on a specific dimension in the CENTER of this image.
        
        Task: Extract the dimension located at the CENTER/MIDDLE of the image.
        Ignore other dimensions that might be visible at the edges.

        Rules:
        1. Output ONE value: "0.250", "4X 0.50", "21 Teeth", "For 1/8" Width", "0.500 Pitch Diameter"
        2. Keep modifiers (4X, TYP, For) and units (in, mm, ") attached.
        3. Keep descriptions like "Pitch Diameter", "Major Dia", "Thread" attached.
        4. If multiple numbers exist, pick the one in the visual center.

        Return JSON: {"dimension": "VALUE", "confidence": 0.9}"""

        payload = {
            "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": "image/png", "data": image_b64}}]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 256, "responseMimeType": "application/json"}
        }
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_API_KEY}",
                json=payload
            )
            result = response.json()
            
        try:
            text = result["candidates"][0]["content"]["parts"][0]["text"]
            if "```" in text: text = text.split("```")[1].replace("json", "")
            data = json.loads(text)
            return data.get("dimension")
        except: return None

    # ===== UPDATED GROUPING LOGIC (With Fixes for Pitch Diameter) =====
    
    def _group_ocr(self, detections: List[OCRDetection]) -> List[OCRDetection]:
        if not detections: return []
        
        # Sort by Y then X
        sorted_dets = sorted(detections, key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"]))
        
        groups = []
        used = set()
        
        for i, det in enumerate(sorted_dets):
            if i in used: continue
            
            group = [det]
            used.add(i)
            self._expand_group(group, sorted_dets, used)
            groups.append(group)
        
        return [self._merge_group(g) for g in groups]
    
    def _expand_group(self, group: List[OCRDetection], all_dets: List[OCRDetection], used: set):
        # More lenient thresholds for cropped regions
        H_THRESH = 100 
        V_THRESH = 40
        V_STACK = 60
        
        changed = True
        while changed:
            changed = False
            for i, det in enumerate(all_dets):
                if i in used: continue
                
                for g_det in list(group):
                    if self._should_group(g_det, det, H_THRESH, V_THRESH, V_STACK):
                        group.append(det)
                        used.add(i)
                        changed = True
                        break
    
    def _should_group(self, det1, det2, h_thresh, v_thresh, v_stack) -> bool:
        b1, b2 = det1.bounding_box, det2.bounding_box
        
        # Check proximity
        x_gap = b2["xmin"] - b1["xmax"]
        y_diff = abs(((b1["ymin"]+b1["ymax"])/2) - ((b2["ymin"]+b2["ymax"])/2))
        x_overlap = min(b1["xmax"], b2["xmax"]) - max(b1["xmin"], b2["xmin"])
        
        t1, t2 = det1.text.strip(), det2.text.strip()
        
        # Horizontal
        if y_diff <= v_thresh and -10 <= x_gap <= h_thresh:
            return self._should_merge_horizontal(t1, t2, x_gap)
            
        # Vertical (Text below)
        # Ensure decent horizontal alignment (overlap or small x_diff)
        c1_x = (b1["xmin"] + b1["xmax"]) / 2
        c2_x = (b2["xmin"] + b2["xmax"]) / 2
        
        if abs(c1_x - c2_x) <= 60 and 0 < (b2["ymin"] - b1["ymax"]) <= v_stack:
            return self._should_merge_vertical(t1, t2)
            
        return False

    def _should_merge_horizontal(self, prev: str, curr: str, gap: float) -> bool:
        # Modifier patterns (4X, etc)
        if self._is_modifier(prev) or self._is_modifier(curr): return True
        
        # Fix: "0.160in" + "For"
        if self._looks_like_dimension(prev) and curr.lower().startswith('for'): return True
        
        # Fix: "21" + "Teeth" or "Places"
        if prev.isdigit() and re.match(r'^(?:Teeth|Tooth|Pitch|Places|Plcs|Holes|Slots)$', curr, re.IGNORECASE): return True
        
        # Fix: "Pitch" + "Diameter" (Added Diameter, Major, Minor)
        if re.match(r'^(?:x|X|×|Wd\.?|Lg\.?|Key|OD|ID|Pitch|Teeth|Diameter|Dia\.?|Major|Minor)$', curr, re.IGNORECASE):
            return True
        if prev.lower() in ['x', 'wd', 'lg', 'pitch', 'teeth', 'diameter', 'dia', 'major', 'minor']:
            return True

        # Fraction parts
        if prev.isdigit() and re.match(r'^\d+/\d+["\']?$', curr): return True
        
        # Units
        if re.match(r'^[\d.]+$', prev) and curr.lower() in ['in', 'mm', '"', "'", "deg"]: return True
        
        # Tolerance
        if PATTERNS.is_tolerance(curr): return True
        
        # Continuation chars
        if curr in ['-', '/', '(', ')', ':']: return True
        if prev in ['-', '/', ':', 'For', 'for']: return True
        
        # Small gap simple merge
        if gap <= 25: return True
        
        return False

    def _should_merge_vertical(self, upper: str, lower: str) -> bool:
        # Tolerance below
        if PATTERNS.is_tolerance(lower): return True
        
        # Fix: Descriptive labels below (Added Diameter, Major, Minor)
        if re.match(r'^(?:Flange|Tube|OD|ID|Pipe|Thread|Pitch|Teeth|For|Max|Min|Typ|Diameter|Dia\.?|Major|Minor)$', lower, re.IGNORECASE): return True
        
        return False

    def _is_modifier(self, text: str) -> bool:
        return bool(re.match(r'^(?:\d+[xX]|[xX]\d+|\(\d+[xX]\)|TYP\.?|REF\.?|For)$', text.strip(), re.IGNORECASE))

    def _looks_like_dimension(self, text: str) -> bool:
        return bool(re.match(r'^\d+\.?\d*["\']?$', text.strip()))

    def _merge_group(self, group: List[OCRDetection]) -> OCRDetection:
        # Sort by reading order
        group.sort(key=lambda d: (d.bounding_box["ymin"], d.bounding_box["xmin"]))
        
        text_parts = []
        for i, det in enumerate(group):
            t = det.text.strip()
            if i > 0:
                # Add space logic
                text_parts.append(" ")
            text_parts.append(t)
            
        merged_text = "".join(text_parts).replace("  ", " ")
        
        # Create merged bbox (min x, max x, etc)
        x_min = min(d.bounding_box["xmin"] for d in group)
        x_max = max(d.bounding_box["xmax"] for d in group)
        y_min = min(d.bounding_box["ymin"] for d in group)
        y_max = max(d.bounding_box["ymax"] for d in group)
        
        return OCRDetection(
            text=merged_text,
            bounding_box={"xmin": x_min, "xmax": x_max, "ymin": y_min, "ymax": y_max},
            confidence=sum(d.confidence for d in group)/len(group)
        )

    def _select_best_result(self, grouped_ocr: List[OCRDetection], gemini_result: Optional[str], debug_info: dict) -> Optional[dict]:
        """
        Selection Logic:
        1. grouped_ocr is ALREADY sorted by distance to center.
        2. If Gemini returned a value, check if it matches the Top 1 or Top 2 central OCR candidates.
        3. If Gemini failed, take the Top 1 central OCR candidate (if it looks like a dimension).
        """
        
        # 1. Clean Gemini result
        if gemini_result:
            gemini_clean = self._normalize(gemini_result)
            # Try to match Gemini against central OCR groups
            for i, ocr in enumerate(grouped_ocr[:3]): # Check top 3 central items
                ocr_clean = self._normalize(ocr.text)
                if gemini_clean in ocr_clean or ocr_clean in gemini_clean:
                    debug_info["selection_reason"] = f"gemini_matches_central_ocr_rank_{i}"
                    return {"value": ocr.text, "confidence": 0.95}
            
            # If Gemini found something valid but it doesn't match OCR perfectly, trust Gemini
            # (It usually implies OCR missed a character but Vision saw it)
            if PATTERNS.is_dimension_text(gemini_result):
                debug_info["selection_reason"] = "gemini_standalone_valid"
                return {"value": gemini_result, "confidence": 0.9}

        # 2. Fallback to Central OCR
        # We prefer the one closest to center (index 0) that has digits
        for i, ocr in enumerate(grouped_ocr):
            text = ocr.text.strip()
            # If it's very close to center (dist < 150) and has digits, take it
            dist = self._calculate_distance_to_center(ocr)
            
            if any(c.isdigit() for c in text):
                if dist < 250: # Must be reasonably central
                    debug_info["selection_reason"] = f"central_ocr_rank_{i}"
                    return {"value": text, "confidence": 0.8}
        
        return None

    def _get_fallback(self, grouped_ocr: List[OCRDetection]) -> Optional[str]:
        # Return the absolute closest text to center that has a number
        for ocr in grouped_ocr:
            if any(c.isdigit() for c in ocr.text):
                return ocr.text
        return None

    def _normalize(self, text: str) -> str:
        return re.sub(r'[^\w]', '', text.lower())


# Singleton and Router
_region_service: Optional[RegionDetectionService] = None

def get_region_detection_service() -> RegionDetectionService:
    global _region_service
    if _region_service is None:
        ocr = None
        vision = None
        try: ocr = create_ocr_service(GOOGLE_CLOUD_API_KEY)
        except: pass
        try: vision = create_vision_service(GEMINI_API_KEY)
        except: pass
        _region_service = RegionDetectionService(ocr, vision)
    return _region_service

async def detect_region(request: RegionDetectRequest) -> RegionDetectResponse:
    try:
        image_bytes = base64.b64decode(request.image)
        service = get_region_detection_service()
        return await service.detect(image_bytes, request.width, request.height, True)
    except Exception as e:
        return RegionDetectResponse(success=False, error=str(e))
