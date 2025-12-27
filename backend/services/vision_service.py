"""
Vision Service - Enhanced with Location Hints
Integrates with Gemini Vision API for semantic understanding of manufacturing drawings.

KEY FEATURE: Returns dimensions WITH approximate bounding box locations
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
    Gemini Vision API integration for semantic analysis.
    Identifies dimensions on manufacturing drawings with location hints.
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
        Use Gemini Vision to identify dimensions WITH their approximate locations.
        Returns list of {value, x, y, confidence} where x,y are percentages (0-100).
        """
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        
        prompt = self._build_dimension_prompt_with_locations()
        
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
        
        return self._parse_dimension_response_with_locations(result)
    
    def _build_dimension_prompt_with_locations(self) -> str:
        """Build prompt that asks for dimensions WITH locations."""
        return """You are an expert manufacturing engineer extracting dimensions from technical drawings.

## YOUR TASK
Extract ALL dimensions from this drawing. For each dimension, provide:
1. The exact value as it appears
2. The approximate X position (0-100, where 0=left edge, 100=right edge)
3. The approximate Y position (0-100, where 0=top edge, 100=bottom edge)

## CRITICAL RULES

### RULE 1: NEVER SPLIT COMPOUND DIMENSIONS
Return these as ONE entry:
- "0.188" Wd. x 7/8" Lg. Key" → ONE entry
- "0.2500in -0.0015 -0.0030" → ONE entry (dimension + tolerances)
- "Usable Length Range Max.: 1 3/4"" → ONE entry

### RULE 2: KEEP MIXED FRACTIONS TOGETHER
- "3 1/4"" → ONE entry (not "3" and "1/4"")
- "4 7/8"" → ONE entry

### RULE 3: INCLUDE TOLERANCE STACKS
When tolerances appear below or next to a dimension:
- "0.2500in -0.0015 -0.0030" → ONE entry with ALL tolerances

### RULE 4: SAME VALUE, DIFFERENT LOCATIONS = SEPARATE ENTRIES
If "16mm" appears twice in different places, return it twice with different x,y positions.

### RULE 5: INCLUDE ALL TYPES
- Linear: 0.75in, 32mm, 3 1/4"
- Threads: 6-32, M8x1.25, 3/4"-16 UN/UNF (SAE), 7/8"-14 UN/UNF (SAE)
- Diameters: Ø5, ⌀3.2
- Radii: R2.5
- Angles: 45°
- Toleranced: 25.0 ±0.1, 0.500 +0.005/-0.002
- Compound: 0.188" Wd. x 7/8" Lg. Key
- With modifiers: 2X For 6-32, 6X 6-32, Ø3.4 (2x)

### WHAT TO IGNORE
- Part numbers (6296K81, 91388A212)
- Company names (McMaster-Carr)
- Drawing titles, revision marks
- Scale indicators
- Zone letters at borders (A, B, C, 1, 2, 3)

## RESPONSE FORMAT
Return a JSON object with a "dimensions" array:
{
    "dimensions": [
        {"value": "3/4\\"-16 UN/UNF (SAE)", "x": 75, "y": 15},
        {"value": "4 7/8\\"", "x": 45, "y": 30},
        {"value": "3 1/4\\"", "x": 45, "y": 35},
        {"value": "0.188\\" Wd. x 7/8\\" Lg. Key", "x": 55, "y": 55},
        {"value": "0.2500in -0.0015 -0.0030", "x": 50, "y": 50},
        {"value": "16mm", "x": 30, "y": 80},
        {"value": "16mm", "x": 70, "y": 80}
    ]
}

IMPORTANT: 
- x and y are percentages (0-100) representing position on the image
- Be as accurate as possible with locations
- Include ALL dimensions, even if values repeat (with different locations)
- Return ONLY the JSON object, no other text"""
    
    def _parse_dimension_response_with_locations(
        self, 
        response: dict
    ) -> List[Dict[str, Any]]:
        """Parse Gemini's response with locations."""
        try:
            candidates = response.get("candidates", [])
            if not candidates:
                return []
            
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                return []
            
            text = parts[0].get("text", "")
            
            # Handle markdown code blocks
            text = text.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])
            
            data = json.loads(text)
            dimensions = data.get("dimensions", [])
            
            # Validate and clean
            clean_dimensions = []
            for dim in dimensions:
                if isinstance(dim, dict) and dim.get('value'):
                    clean_dimensions.append({
                        'value': dim['value'].strip(),
                        'x': float(dim.get('x', 50)),
                        'y': float(dim.get('y', 50)),
                        'confidence': 0.85
                    })
                elif isinstance(dim, str) and dim.strip():
                    # Fallback for old format
                    clean_dimensions.append({
                        'value': dim.strip(),
                        'x': 50,
                        'y': 50,
                        'confidence': 0.7
                    })
            
            return clean_dimensions
            
        except json.JSONDecodeError as e:
            print(f"Gemini JSON error: {e}")
            # Try to extract dimensions from malformed response
            return self._extract_fallback(response)
        except (KeyError, IndexError, TypeError) as e:
            print(f"Gemini parse error: {e}")
            return []
    
    def _extract_fallback(self, response: dict) -> List[Dict[str, Any]]:
        """Fallback extraction if JSON parsing fails."""
        try:
            candidates = response.get("candidates", [])
            if not candidates:
                return []
            
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if not parts:
                return []
            
            text = parts[0].get("text", "")
            
            # Try to find dimension-like patterns in text
            dimensions = []
            
            # Common patterns
            patterns = [
                r'\d+\s+\d+/\d+["\']',  # Mixed fractions
                r'\d+/\d+["\']',         # Fractions
                r'\d+\.\d+(?:in|mm|")',  # Decimals
                r'[ØøR]\d+\.?\d*',       # Diameter/radius
                r'M\d+(?:x\d+\.?\d*)?',  # Metric threads
                r'\d+/\d+-\d+\s*UN[CF]?', # UTS threads
            ]
            
            for pattern in patterns:
                matches = re.findall(pattern, text, re.IGNORECASE)
                for match in matches:
                    dimensions.append({
                        'value': match,
                        'x': 50,
                        'y': 50,
                        'confidence': 0.5
                    })
            
            return dimensions
            
        except Exception:
            return []
    
    async def detect_grid(self, image_bytes: bytes) -> Optional[dict]:
        """Detect grid reference system on the drawing."""
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        
        prompt = """Analyze this engineering drawing and identify the grid reference system if present.

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
            return None
        
        return self._parse_grid_response(result)
    
    def _parse_grid_response(self, response: dict) -> Optional[dict]:
        """Parse Gemini's grid detection response."""
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


def create_vision_service(api_key: Optional[str] = None) -> VisionService:
    """Create vision service instance."""
    return VisionService(api_key=api_key)
