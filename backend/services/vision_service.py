"""
Vision Service - AS9102-Compliant Dimension Extraction
Integrates with Gemini Vision API for semantic understanding of manufacturing drawings.

UPDATED: Better handling of multi-line callouts (e.g., "21 Teeth" + "0.080in Pitch" = ONE dimension)
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
        """Build AS9102-compliant extraction prompt with improved multi-line handling."""
        return """You are extracting dimensions from an engineering drawing for AS9102 First Article Inspection (FAI) Form 3.

## CONTEXT: AS9102 Form 3 Requirements
Each dimension you extract will become a row on Form 3 "Characteristic Accountability". Every design characteristic that can be MEASURED or VERIFIED needs its own balloon number.

## YOUR TASK
Extract ALL design characteristics from this drawing. For each one, provide:
1. The COMPLETE value exactly as shown (including ALL related text)
2. X position (0-100, 0=left, 100=right)
3. Y position (0-100, 0=top, 100=bottom)

## CRITICAL: MULTI-LINE CALLOUTS ARE ONE DIMENSION

Engineering drawings often have dimension callouts that span MULTIPLE LINES. These describe ONE feature and must be kept together as a SINGLE dimension.

### EXAMPLES OF MULTI-LINE CALLOUTS (extract as ONE entry):

**Gear/Thread specifications:**
```
21 Teeth
0.080in Pitch
```
→ Extract as: "21 Teeth 0.080in Pitch" (ONE dimension)

**Belt/Width specifications:**
```
0.160in
For 1/8" Max. Belt Width
```
→ Extract as: "0.160in For 1/8\" Max. Belt Width" (ONE dimension)

**Shaft specifications:**
```
For 0.250in
Shaft Diameter
```
→ Extract as: "For 0.250in Shaft Diameter" (ONE dimension)

**Flange specifications:**
```
For 3.0in
Flange OD
```
→ Extract as: "For 3.0in Flange OD" (ONE dimension)

**Key dimensions:**
```
0.188" Wd.
x 7/8" Lg. Key
```
→ Extract as: "0.188\" Wd. x 7/8\" Lg. Key" (ONE dimension)

### HOW TO IDENTIFY MULTI-LINE CALLOUTS:
1. Text lines that are VERTICALLY STACKED (one below the other)
2. Connected by a SINGLE leader line pointing to one feature
3. The lower text provides CONTEXT for the upper text (e.g., "Pitch", "Diameter", "OD", "Width")
4. Together they describe ONE measurable characteristic

### COMMON DESCRIPTIVE SUFFIXES (keep with dimension above):
- "Pitch", "Teeth", "Thread"
- "Diameter", "OD", "ID"  
- "Width", "Belt Width", "Key"
- "Shaft", "Flange", "Tube"
- "Travel", "Length", "Lg."

## WHAT TO EXTRACT

### 1. DIMENSIONS WITH MODIFIERS - Keep Together!
- "4X 0.2in" → ONE entry
- "2X For 6-32" → ONE entry
- "6X 6-32" → ONE entry

### 2. TOLERANCED DIMENSIONS
- "0.2500in -0.0015 -0.0030" → ONE entry
- "25.0 ±0.1" → ONE entry

### 3. THREAD CALLOUTS
- "3/4\"-16 UN/UNF (SAE)" → ONE entry
- "M8x1.25" → ONE entry
- "4-40 Set Screw" → ONE entry

### 4. SIMPLE DIMENSIONS
- Linear: 1.75in, 32mm, 0.710in
- Fractions: 1/4", 3/8"
- Diameters: Ø5, 0.438in
- Angles: 45°

## WHAT TO IGNORE (Not Design Characteristics)
- Part numbers (6296K81, 1375K23)
- Company names (McMaster-Carr)
- Drawing titles
- Copyright text
- Zone/grid letters at borders
- "CAD", "PART NUMBER" labels
- URLs

## RESPONSE FORMAT
Return JSON with "dimensions" array:

{
  "dimensions": [
    {"value": "0.710in", "x": 35, "y": 28},
    {"value": "0.535in Pitch Diameter", "x": 38, "y": 35},
    {"value": "0.438in", "x": 72, "y": 28},
    {"value": "0.208in", "x": 85, "y": 32},
    {"value": "4-40 Set Screw", "x": 62, "y": 38},
    {"value": "21 Teeth 0.080in Pitch", "x": 82, "y": 42},
    {"value": "0.160in For 1/8\" Max. Belt Width", "x": 80, "y": 55},
    {"value": "For 0.250in Shaft Diameter", "x": 45, "y": 55}
  ]
}

## CHECKLIST BEFORE RESPONDING
☐ Did I combine multi-line callouts into single entries?
☐ Did I keep modifiers WITH their dimensions? (4X, 2X, TYP)
☐ Did I include thread callouts with full specification?
☐ Did I ignore title block text (part numbers, company names)?
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
