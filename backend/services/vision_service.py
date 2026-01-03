"""
Vision Service - AS9102-Compliant Dimension Extraction
Integrates with Gemini Vision API for semantic understanding of manufacturing drawings.

Based on AS9102 Form 3 requirements:
- Every design characteristic needs unique balloon
- Dimensions with tolerances, notes, thread callouts all get ballooned
- Same dimension in different locations = separate balloons
- Modifiers (4X, TYP) stay with their dimension
- Text notes with measurable requirements get ballooned
"""
import base64
import json
import re
import httpx
from typing import Optional, List, Dict, Any

from config import GEMINI_API_KEY, NORMALIZED_COORD_SYSTEM
from models import ErrorCode


class VisionServiceError(Exception):
    """Custom exception for vision service errors"""
    def __init__(self, code: ErrorCode, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


class VisionService:
    """
    Gemini Vision API integration for AS9102-compliant dimension extraction.
    """
    
    GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or GEMINI_API_KEY
        if not self.api_key:
            raise ValueError("Gemini API key not configured")
    
    async def identify_dimensions(self, image_bytes: bytes) -> List[str]:
        """Legacy method - returns just dimension values."""
        result = await self.identify_dimensions_with_locations(image_bytes)
        return [d['value'] for d in result]
    
    async def identify_dimensions_with_locations(
        self, 
        image_bytes: bytes
    ) -> List[Dict[str, Any]]:
        """
        Extract dimensions with locations for AS9102 Form 3.
        Returns list of {value, x, y} where x,y are percentages (0-100).
        """
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        
        prompt = self._build_as9102_prompt()
        
        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": image_b64
                        }
                    }
                ]
            }],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 8192,
                "responseMimeType": "application/json"
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.GEMINI_API_URL}?key={self.api_key}",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                response.raise_for_status()
                result = response.json()
        except httpx.TimeoutException:
            raise VisionServiceError(
                ErrorCode.VISION_API_ERROR,
                "Gemini Vision API request timed out"
            )
        except httpx.HTTPStatusError as e:
            raise VisionServiceError(
                ErrorCode.VISION_API_ERROR,
                f"Gemini Vision API error: {e.response.status_code}"
            )
        except Exception as e:
            raise VisionServiceError(
                ErrorCode.VISION_API_ERROR,
                f"Failed to call Gemini Vision API: {str(e)}"
            )
        
        return self._parse_response(result)
    
    def _build_as9102_prompt(self) -> str:
        """Build AS9102-compliant extraction prompt."""
        return """You are extracting dimensions from an engineering drawing for AS9102 First Article Inspection (FAI) Form 3.

## CONTEXT: AS9102 Form 3 Requirements
Each dimension you extract will become a row on Form 3 "Characteristic Accountability". Every design characteristic that can be MEASURED or VERIFIED needs its own balloon number. The inspector will use these to verify the manufactured part.

## YOUR TASK
Extract ALL design characteristics from this drawing. For each one, provide:
1. The COMPLETE value exactly as shown (including modifiers, context, tolerances)
2. X position (0-100, 0=left, 100=right)
3. Y position (0-100, 0=top, 100=bottom)

## CRITICAL: MULTI-LINE DIMENSIONS - DO NOT SPLIT!

When text is VERTICALLY STACKED (one line directly below another), they describe ONE feature and MUST be ONE entry!

WRONG:
{"value": "21 teeth", "x": 30, "y": 45}
{"value": "0.080in pitch", "x": 30, "y": 48}

CORRECT:
{"value": "21 teeth 0.080in pitch", "x": 30, "y": 46}

WRONG:
{"value": "0.160in", "x": 50, "y": 60}
{"value": "For 1/8\" max belt width", "x": 50, "y": 63}

CORRECT:
{"value": "0.160in For 1/8\" max belt width", "x": 50, "y": 61}

WRONG:
{"value": "0.250", "x": 40, "y": 30}
{"value": "3:8 NPT", "x": 40, "y": 33}

CORRECT:
{"value": "0.250 3:8 NPT", "x": 40, "y": 31}

## MULTI-LINE TEXT DETECTION RULE

Before creating separate entries, ask:
1. Are these texts vertically stacked? (one directly below the other)
2. Are they X-aligned? (same horizontal position within 20 pixels)
3. Do they describe the SAME feature? (e.g., "pitch" describes "teeth", "NPT" describes a dimension)

If YES to all 3 → MERGE into ONE entry with Y at the vertical center!

## POSITION ACCURACY REQUIREMENTS

Your X,Y coordinates MUST be PRECISE:
- X should be the CENTER of the dimension text horizontally
- Y should be the CENTER of the dimension text vertically (for multi-line, use middle line)
- If text spans from x=200 to x=350 on a 1000px wide image, report x = 27.5 (on 0-100 scale)
- If text is at y=400 on a 1000px tall image, report y = 40

DO NOT guess positions. Scan carefully and calculate the center point.

## WHAT TO EXTRACT (Design Characteristics)

### 1. DIMENSIONS WITH MODIFIERS - Keep Together!
When a dimension has a quantity modifier, they are ONE characteristic:
- "4X 0.2in" → ONE entry (not separate "4X" and "0.2in")
- "2X For 6-32" → ONE entry
- "6X 6-32" → ONE entry
- "3/8 NPT 4X" → ONE entry
- "(2x) Ø5" → ONE entry

### 2. COMPOUND DIMENSIONS - Never Split!
Multi-part dimensions describing one feature:
- "0.188" Wd. x 7/8" Lg. Key" → ONE entry
- "0.50in Travel Length" → ONE entry
- "For 3.0in Flange OD" → ONE entry (the label describes what's measured)
- "For Tube OD: 2 1/2"" → ONE entry

### 3. TOLERANCED DIMENSIONS - Keep Tolerances!
- "0.2500in -0.0015 -0.0030" → ONE entry with all tolerances
- "25.0 ±0.1" → ONE entry
- "1.500 +0.005/-0.002" → ONE entry

### 4. THREAD CALLOUTS
- "3/4"-16 UN/UNF (SAE)" → ONE entry
- "7/8"-14 UN/UNF (SAE)" → ONE entry
- "M8x1.25" → ONE entry
- "1/2 NPT" → ONE entry

### 5. TEXT NOTES WITH MEASURABLE REQUIREMENTS
Look at text blocks (often at bottom of drawing) for specifications:
- "Micrometer Graduation Marks: 0.001in" → Extract as ONE entry
- "Straight Line Travel Accuracy: 0.0005in per in" → Extract as ONE entry
- "For Screw Size: No. 10" → Extract as ONE entry

### 6. DUPLICATE VALUES IN DIFFERENT LOCATIONS
CRITICAL: If the same dimension value appears in MULTIPLE places on the drawing, each instance needs its own balloon for inspection.

Example: If "1.312in" appears twice (left side and right side):
✓ CORRECT - Return BOTH with different positions:
  {"value": "1.312in", "x": 25, "y": 35},
  {"value": "1.312in", "x": 75, "y": 35}

✗ WRONG - Only returning one:
  {"value": "1.312in", "x": 25, "y": 35}

Count carefully! Scan the ENTIRE drawing for repeated values.

### 7. SIMPLE DIMENSIONS
- Linear: 1.75in, 32mm, 4.750in
- Fractions: 1/4", 3/8"
- Mixed fractions: 3 1/4", 4 7/8"
- Diameters: Ø5, ⌀3.2
- Radii: R2.5
- Angles: 45°, 40deg

### 8. GEOMETRIC TOLERANCES (GD&T)
Extract Feature Control Frames as a single string representation. Do not split the symbol from the tolerance.
- "[Pos|Ø.010(M)|A|B]" → Extract as ONE entry
- "⌖ Ø.010Ⓜ A B" → Extract as ONE entry
- "⟂ 0.05 A" → Extract as ONE entry

## WHAT TO IGNORE (Not Design Characteristics)
- Part numbers (6296K81, 5469K125)
- Company names (McMaster-Carr)
- Drawing titles (Hydraulic Pump, Positioning Table)
- Copyright text
- Zone/grid letters at borders (A, B, C, 1, 2, 3)
- "CAD", "PART NUMBER" labels
- URLs (http://www.mcmaster.com)

## RESPONSE FORMAT
Return JSON with "dimensions" array. Each entry needs value, x, y:

{
  "dimensions": [
    {"value": "4X 0.2in", "x": 12, "y": 22},
    {"value": "For 3.0in Flange OD", "x": 35, "y": 25},
    {"value": "0.188\" Wd. x 7/8\" Lg. Key", "x": 45, "y": 58},
    {"value": "1.312in", "x": 25, "y": 35},
    {"value": "[Pos|Ø.010(M)|A|B]", "x": 60, "y": 40},
    {"value": "21 teeth 0.080in pitch", "x": 30, "y": 46},
    {"value": "Micrometer Graduation Marks: 0.001in", "x": 15, "y": 92}
  ]
}

## CHECKLIST BEFORE RESPONDING
☐ Did I MERGE vertically stacked text into ONE entry? (CRITICAL!)
☐ Did I keep modifiers WITH their dimensions? (4X, 2X, TYP)
☐ Did I keep compound dimensions together? (Wd. x Lg., Travel Length)
☐ Did I extract dimensions from text notes at bottom?
☐ Did I include EVERY instance of repeated dimension values?
☐ Did I include thread callouts with full specification?
☐ Did I extract GD&T frames as single strings?
☐ Are x,y positions accurate for WHERE each dimension appears?

Return ONLY the JSON object, no other text."""

    def _parse_response(self, response: dict) -> List[Dict[str, Any]]:
        """Parse Gemini's response."""
        try:
            candidates = response.get("candidates", [])
            if not candidates:
                return []
            
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                return []
            
            text = parts[0].get("text", "").strip()
            
            # Handle markdown code blocks
            if text.startswith("```"):
                lines = text.split("\n")
                end_idx = -1
                for i, line in enumerate(lines[1:], 1):
                    if line.strip() == "```":
                        end_idx = i
                        break
                if end_idx > 0:
                    text = "\n".join(lines[1:end_idx])
                else:
                    text = "\n".join(lines[1:])
            
            data = json.loads(text)
            dimensions = data.get("dimensions", [])
            
            # Validate and clean
            clean = []
            for dim in dimensions:
                if isinstance(dim, dict) and dim.get('value'):
                    value = str(dim['value']).strip()
                    if value and len(value) > 0:
                        clean.append({
                            'value': value,
                            'x': float(dim.get('x', 50)),
                            'y': float(dim.get('y', 50)),
                            'confidence': 0.85
                        })
                elif isinstance(dim, str) and dim.strip():
                    clean.append({
                        'value': dim.strip(),
                        'x': 50,
                        'y': 50,
                        'confidence': 0.7
                    })
            
            return clean
            
        except json.JSONDecodeError as e:
            print(f"Gemini JSON error: {e}")
            return self._fallback_extract(response)
        except Exception as e:
            print(f"Gemini parse error: {e}")
            return []
    
    def _fallback_extract(self, response: dict) -> List[Dict[str, Any]]:
        """Fallback extraction if JSON fails."""
        try:
            candidates = response.get("candidates", [])
            if not candidates:
                return []
            
            text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            
            dimensions = []
            patterns = [
                r'\d+\s+\d+/\d+["\']',
                r'\d+/\d+["\']',
                r'\d+\.\d+(?:in|mm)',
                r'[ØøR]\d+\.?\d*',
                r'M\d+(?:x\d+\.?\d*)?',
                r'\d+/\d+\s*NPT',
            ]
            
            for pattern in patterns:
                for match in re.findall(pattern, text, re.IGNORECASE):
                    dimensions.append({
                        'value': match,
                        'x': 50,
                        'y': 50,
                        'confidence': 0.5
                    })
            
            return dimensions
        except:
            return []
    
    async def detect_grid(self, image_bytes: bytes) -> Optional[dict]:
        """Detect grid reference system."""
        # Simplified - return standard grid
        return {
            "columns": ['H', 'G', 'F', 'E', 'D', 'C', 'B', 'A'],
            "rows": ['4', '3', '2', '1'],
            "boundaries": {
                "column_edges": [0, 125, 250, 375, 500, 625, 750, 875, 1000],
                "row_edges": [0, 250, 500, 750, 1000]
            }
        }


def create_vision_service(api_key: Optional[str] = None) -> VisionService:
    """Create vision service instance."""
    return VisionService(api_key=api_key)
