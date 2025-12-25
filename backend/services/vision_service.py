"""
Vision Service
Integrates with Gemini Vision API for semantic understanding of manufacturing drawings.
Used to identify which text elements are dimensions vs. labels, notes, part numbers, etc.

ENHANCED: Prompt updated to capture ALL dimension modifiers for AS9102/ISO 13485 compliance
while keeping the rest of the code exactly the same.
"""
import base64
import json
import re
import httpx
from typing import Optional

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
    Gemini Vision API integration for semantic analysis.
    Identifies dimensions on manufacturing drawings.
    """
    
    GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or GEMINI_API_KEY
        if not self.api_key:
            raise ValueError("Gemini API key not configured")
    
    async def identify_dimensions(self, image_bytes: bytes) -> list[str]:
        """
        Use Gemini Vision to identify which text values are dimensions.
        
        Args:
            image_bytes: PNG image data
            
        Returns:
            List of dimension values (strings) that Gemini identified
        """
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        
        prompt = self._build_dimension_identification_prompt()
        
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
                "temperature": 0.1,  # Low temperature for consistency
                "maxOutputTokens": 4096,
                "responseMimeType": "application/json"
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
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
        
        return self._parse_dimension_response(result)
    
    def _build_dimension_identification_prompt(self) -> str:
        """
        Build the prompt for dimension identification.
        
        ENHANCED for AS9102 First Article Inspection and ISO 13485 Medical Device compliance.
        Captures ALL dimension modifiers that are critical for inspection documentation.
        """
        return """You are an expert manufacturing engineer with 20+ years of experience reading technical drawings for AS9102 First Article Inspection (aerospace) and ISO 13485 (medical device) documentation.

Your task is to extract ALL dimensions from this drawing with their COMPLETE values INCLUDING all modifiers.

## CRITICAL: Always include these modifiers as part of the dimension value

### QUANTITY/FEATURE COUNT (critical for inspection - indicates how many features to measure):
- "(2x)", "(3x)", "(4x)", "(6x)", "(8x)" - e.g., "Ø3.4 (2x)" NOT "Ø3.4"
- "2 PL", "3 PL", "4 PLACES", "6 HOLES" - e.g., "R2 4 PL" NOT "R2"
- "TYP", "TYPICAL" - e.g., "R5 TYP" NOT "R5"
- "EQ SP", "EQUALLY SPACED" - e.g., "30° EQ SP" NOT "30°"

### SPACING/PATTERN NOTATIONS:
- "C/C", "C-C", "CTR-CTR" (Center-to-Center) - e.g., "35 C/C" NOT "35"
- "B.C.", "BC", "PCD" (Bolt Circle Diameter) - e.g., "Ø44 B.C." NOT "Ø44"
- "SQ" (Square pattern) - e.g., "10 SQ" NOT "10"

### REFERENCE/DATUM MARKERS (critical for GD&T):
- "REF", "REFERENCE" - e.g., "0.95 REF" NOT "0.95"
- "NOM", "NOMINAL" - e.g., "25 NOM" NOT "25"
- "BSC", "BASIC" - e.g., "45° BSC" NOT "45°"
- "TRUE" - e.g., "R10 TRUE" NOT "R10"

### LIMIT DIMENSIONS:
- "MAX", "MAXIMUM" - e.g., "15 MAX" NOT "15"
- "MIN", "MINIMUM" - e.g., "3 MIN" NOT "3"

### DEPTH/COUNTERBORE/COUNTERSINK:
- "DEEP", "DP", "↧" - e.g., "Ø5 ↧10" NOT "Ø5"
- "CBORE", "C'BORE", "⌴" - e.g., "Ø10 CBORE Ø15" 
- "CSINK", "C'SINK", "⌵" - e.g., "Ø3 CSINK 90°"
- "THRU", "THROUGH" - e.g., "Ø6 THRU" NOT "Ø6"

### THREAD SPECIFICATIONS:
- Full thread callouts - e.g., "M8×1.25 (4x)" NOT "M8"
- "TAP", "TAPPED" - e.g., "M6 TAP ↧15"
- Class/fit - e.g., "1/4-20 UNC-2B"

### SURFACE/FINISH:
- "BOTH SIDES", "2 SURFACES" - e.g., "0.8 BOTH SIDES"
- "FAR SIDE", "NEAR SIDE"

## EXAMPLES - CORRECT vs WRONG:

✓ CORRECT: "35 C/C"           ✗ WRONG: "35"
✓ CORRECT: "Ø3.4 (2x)"        ✗ WRONG: "Ø3.4"  
✓ CORRECT: "Ø7.5 (2x)"        ✗ WRONG: "Ø7.5"
✓ CORRECT: "0.95 REF"         ✗ WRONG: "0.95"
✓ CORRECT: "89.5°"            ✗ WRONG: "89.5"
✓ CORRECT: "R5 TYP"           ✗ WRONG: "R5"
✓ CORRECT: "M8×1.25 (4x)"     ✗ WRONG: "M8×1.25" or "M8"
✓ CORRECT: "Ø44 B.C."         ✗ WRONG: "Ø44"
✓ CORRECT: "15.3 +0.1/-0"     ✗ WRONG: "15.3"
✓ CORRECT: "25 MAX"           ✗ WRONG: "25"
✓ CORRECT: "Ø6 THRU"          ✗ WRONG: "Ø6"
✓ CORRECT: "2×.5 (2x)"        ✗ WRONG: "2×.5"
✓ CORRECT: "10 ±0.5 (4x)"     ✗ WRONG: "10 ±0.5"

## WHAT TO EXTRACT:
- Linear dimensions with ALL modifiers
- Diameters (Ø, ⌀) with quantity and depth callouts
- Radii (R) with TYP or quantity markers
- Angles (°) with BSC or quantity markers
- Tolerances (±, +/-)
- Thread callouts with quantity
- Chamfers (C, ×45°)
- All reference and limit dimensions

## WHAT TO IGNORE (not dimensions):
- Part numbers (e.g., "PN-12345", "F15848")
- Revision letters (e.g., "REV A", "REV B")
- Drawing numbers
- Scale indicators (e.g., "SCALE 2:1", "2:1 (1:1)")
- Company names and logos (e.g., "LEDiL")
- Title block text (PRODUCT, MATERIAL, SIZE, SHEET, TYPE, COLOUR/COATING)
- Section labels (e.g., "SECTION A-A", "VIEW B-B", "Section A-A")
- Zone/grid references (letters A-H and numbers 1-4 at drawing borders)
- Notes section text that are instructions, not measurements
- "FIRST ANGLE PROJECTION" text
- Component/BOM table entries
- Material specifications (e.g., "PBT", "WHITE")

## RULES:
1. Extract the EXACT text as it appears INCLUDING all modifiers
2. Include symbols (Ø, R, ±, °, ×) that are part of the dimension
3. Include tolerance values attached to dimensions
4. Include quantity multipliers (2x, 4x) that appear near the dimension
5. Include spacing notations (C/C, B.C.) that appear with the dimension
6. If a modifier is visually associated with a dimension, include it
7. Do NOT split a dimension from its modifiers
8. Do NOT infer or calculate values
9. If you cannot clearly read a dimension, skip it

## QUALITY CHECK (verify before returning):
- Did I include "(2x)" or "(4x)" where they appear?
- Did I include "C/C" where it appears?
- Did I include "TYP" where it appears?
- Did I include "REF" where it appears?
- Did I include "MAX"/"MIN" where they appear?
- Did I include tolerance values where they appear?
- Did I include "THRU" or depth callouts where they appear?

Return a JSON object with this exact structure:
{
    "dimensions": ["35 C/C", "Ø3.4 (2x)", "Ø7.5 (2x)", "89.5°", "0.95 REF", "R5 TYP", "Ø44 B.C."]
}

If no dimensions are found, return:
{
    "dimensions": []
}

Return ONLY the JSON object, no other text."""
    
    def _parse_dimension_response(self, response: dict) -> list[str]:
        """Parse Gemini's response and extract dimension values"""
        try:
            # Navigate Gemini response structure
            candidates = response.get("candidates", [])
            if not candidates:
                return []
            
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                return []
            
            text = parts[0].get("text", "")
            
            # Parse JSON from response
            # Handle potential markdown code blocks
            text = text.strip()
            if text.startswith("```"):
                # Remove markdown code block
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])
            
            data = json.loads(text)
            dimensions = data.get("dimensions", [])
            
            # Validate and clean
            clean_dimensions = []
            for dim in dimensions:
                if isinstance(dim, str) and dim.strip():
                    clean_dimensions.append(dim.strip())
            
            return clean_dimensions
            
        except json.JSONDecodeError as e:
            raise VisionServiceError(
                ErrorCode.PARSE_ERROR,
                f"Gemini returned invalid JSON: {str(e)}"
            )
        except (KeyError, IndexError, TypeError) as e:
            raise VisionServiceError(
                ErrorCode.PARSE_ERROR,
                f"Failed to parse Gemini response structure: {str(e)}"
            )
    
    async def detect_grid(self, image_bytes: bytes) -> Optional[dict]:
        """
        Use Gemini Vision to detect the grid reference system on the drawing.
        
        Returns:
            Grid info dict or None if no grid detected:
            {
                "columns": ["A", "B", "C", "D", "E", "F", "G", "H"],
                "rows": ["1", "2", "3", "4"],
                "boundaries": {
                    "column_edges": [0, 125, 250, ...],  # Normalized x positions
                    "row_edges": [0, 250, 500, ...]      # Normalized y positions
                }
            }
        """
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        
        prompt = self._build_grid_detection_prompt()
        
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
                "maxOutputTokens": 2048,
                "responseMimeType": "application/json"
            }
        }
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.GEMINI_API_URL}?key={self.api_key}",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                )
                response.raise_for_status()
                result = response.json()
        except Exception:
            # Grid detection is optional - return None on any error
            return None
        
        return self._parse_grid_response(result)
    
    def _build_grid_detection_prompt(self) -> str:
        """Build the prompt for grid detection"""
        return """Analyze this engineering drawing and identify the grid reference system if present.

Look for:
1. Column letters (typically A-H or A-J) along the top or bottom edge
2. Row numbers (typically 1-4 or 1-6) along the left or right edge
3. Grid lines dividing the drawing into zones

If a grid system is present, estimate the boundaries of each zone.

Return a JSON object:
{
    "has_grid": true,
    "columns": ["A", "B", "C", "D", "E", "F", "G", "H"],
    "rows": ["1", "2", "3", "4"],
    "column_count": 8,
    "row_count": 4
}

If no grid is found:
{
    "has_grid": false
}

Return ONLY the JSON object."""
    
    def _parse_grid_response(self, response: dict) -> Optional[dict]:
        """Parse Gemini's grid detection response"""
        try:
            candidates = response.get("candidates", [])
            if not candidates:
                return None
            
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                return None
            
            text = parts[0].get("text", "").strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])
            
            data = json.loads(text)
            
            if not data.get("has_grid", False):
                return None
            
            columns = data.get("columns", [])
            rows = data.get("rows", [])
            
            if not columns or not rows:
                return None
            
            # Calculate evenly-distributed boundaries
            col_count = len(columns)
            row_count = len(rows)
            
            column_edges = [
                int(i * NORMALIZED_COORD_SYSTEM / col_count) 
                for i in range(col_count + 1)
            ]
            row_edges = [
                int(i * NORMALIZED_COORD_SYSTEM / row_count) 
                for i in range(row_count + 1)
            ]
            
            return {
                "columns": columns,
                "rows": rows,
                "boundaries": {
                    "column_edges": column_edges,
                    "row_edges": row_edges
                }
            }
            
        except (json.JSONDecodeError, KeyError, IndexError, TypeError):
            return None


# Factory function
def create_vision_service(api_key: Optional[str] = None) -> VisionService:
    """Create vision service instance"""
    return VisionService(api_key=api_key)
