"""
Pattern Library for Manufacturing Dimension Detection
Comprehensive patterns for aerospace, medical, defense, and general manufacturing drawings.
"""
import re
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class PatternMatch:
    """Result of a pattern match"""
    text: str
    pattern_type: str
    category: str
    confidence: float
    normalized: str


class ManufacturingPatterns:
    """
    Comprehensive pattern matching for manufacturing drawings.
    """
    
    # =========================================================================
    # THREAD CALLOUT PATTERNS
    # =========================================================================
    
    THREAD_PATTERNS = {
        # UTS - Unified Thread Standard (US)
        'uts_basic': re.compile(
            r'(?P<size>(?:\#\d+|\d+/\d+|\d+(?:\.\d+)?))'
            r'\s*[-–]\s*'
            r'(?P<tpi>\d+)'
            r'(?:\s*(?P<class>UN[CEFJ]?(?:-[123][AB]?)?))?'
            r'(?:\s*(?P<hand>LH|RH))?',
            re.IGNORECASE
        ),
        
        # UTS with prefix
        'uts_with_prefix': re.compile(
            r'(?P<qty>\d+[xX]?\s*)?'
            r'(?:For\s+|Tap\s+|Thread\s+)?'
            r'(?P<size>(?:\#\d+|\d+/\d+|\d+(?:\.\d+)?))'
            r'\s*[-–]\s*'
            r'(?P<tpi>\d+)'
            r'(?:\s*(?P<class>UN[CEFJ]?(?:-[123][AB]?)?))?',
            re.IGNORECASE
        ),
        
        # Metric ISO threads
        'metric_iso': re.compile(
            r'M\s*(?P<diameter>\d+(?:\.\d+)?)'
            r'(?:\s*[xX]\s*(?P<pitch>\d+(?:\.\d+)?))?'
            r'(?:\s*[-–]\s*(?P<tolerance>\d+[gGhH]\d*[gGhH]?))?'
            r'(?:\s*(?P<hand>LH|RH))?',
            re.IGNORECASE
        ),
        
        # NPT - National Pipe Taper (US)
        'npt': re.compile(
            r'(?P<size>\d+/\d+|\d+(?:\.\d+)?)'
            r'\s*[-–]?\s*'
            r'(?P<tpi>\d+)?\s*'
            r'(?P<type>NPT|NPTF|NPSC|NPSM|NPSL|NPS)',
            re.IGNORECASE
        ),
        
        # BSP - British Standard Pipe
        'bsp': re.compile(
            r'(?P<size>\d+/\d+|\d+(?:\.\d+)?)'
            r'\s*[-–]?\s*'
            r'(?P<type>BSPT|BSPP|BSP|G|R|Rp|Rc)',
            re.IGNORECASE
        ),
        
        # SAE thread callouts
        'sae_thread': re.compile(
            r'(?P<size>\d+/\d+|\d+(?:\.\d+)?)'
            r'["\']?\s*[-–]\s*'
            r'(?P<tpi>\d+)\s+'
            r'UN/?UNF?\s*'
            r'\(?\s*SAE\s*\)?',
            re.IGNORECASE
        ),
    }
    
    # =========================================================================
    # TOLERANCE PATTERNS
    # =========================================================================
    
    TOLERANCE_PATTERNS = {
        # Bilateral symmetric: ±0.005
        'bilateral_symmetric': re.compile(
            r'(?P<nominal>-?\d+(?:\.\d+)?)\s*'
            r'(?P<symbol>[±])\s*'
            r'(?P<tolerance>\d+(?:\.\d+)?)',
            re.IGNORECASE
        ),
        
        # Bilateral asymmetric: +0.005/-0.010
        'bilateral_asymmetric': re.compile(
            r'(?P<nominal>-?\d+(?:\.\d+)?)\s*'
            r'(?P<plus>[+]\s*\.?\d+(?:\.\d+)?)\s*'
            r'[/]?\s*'
            r'(?P<minus>[-–]\s*\.?\d+(?:\.\d+)?)',
            re.IGNORECASE
        ),
        
        # Reference dimension: (25.4) or 25.4 REF
        'reference': re.compile(
            r'(?:\(\s*(?P<value1>-?\d+(?:\.\d+)?)\s*\)|'
            r'(?P<value2>-?\d+(?:\.\d+)?)\s+REF(?:ERENCE)?)',
            re.IGNORECASE
        ),
        
        # Basic dimension: [25.4] or 25.4 BSC
        'basic': re.compile(
            r'(?:\[\s*(?P<value1>-?\d+(?:\.\d+)?)\s*\]|'
            r'(?P<value2>-?\d+(?:\.\d+)?)\s+(?:BSC|BASIC))',
            re.IGNORECASE
        ),
        
        # Maximum/Minimum: 25.4 MAX or 25.4 MIN
        'max_min': re.compile(
            r'(?P<value>-?\d+(?:\.\d+)?)\s*'
            r'(?P<type>MAX(?:IMUM)?|MIN(?:IMUM)?)',
            re.IGNORECASE
        ),
    }
    
    # =========================================================================
    # GD&T PATTERNS
    # =========================================================================
    
    GDT_PATTERNS = {
        # Diameter symbol
        'diameter': re.compile(
            r'[Øø]\s*(?P<value>\d+(?:\.\d+)?)',
            re.IGNORECASE
        ),
        
        # Radius
        'radius': re.compile(
            r'R\s*(?P<value>\d+(?:\.\d+)?)',
            re.IGNORECASE
        ),
        
        # Counterbore - fixed regex
        'counterbore': re.compile(
            r'(?:CBORE|C-BORE|COUNTERBORE)\s*'
            r'[Øø]?\s*(?P<diameter>\d+(?:\.\d+)?)',
            re.IGNORECASE
        ),
        
        # Countersink - fixed regex
        'countersink': re.compile(
            r'(?:CSINK|C-SINK|COUNTERSINK)\s*'
            r'[Øø]?\s*(?P<diameter>\d+(?:\.\d+)?)',
            re.IGNORECASE
        ),
        
        # Depth
        'depth': re.compile(
            r'(?:DEEP|DP|DEPTH)\s*'
            r'(?P<value>\d+(?:\.\d+)?)',
            re.IGNORECASE
        ),
        
        # Through
        'through': re.compile(
            r'(?P<value>[Øø]?\s*\d+(?:\.\d+)?)\s*'
            r'(?P<through>THRU|THROUGH)',
            re.IGNORECASE
        ),
    }
    
    # =========================================================================
    # DIMENSION PATTERNS
    # =========================================================================
    
    DIMENSION_PATTERNS = {
        # Mixed fraction: 3 1/4"
        'mixed_fraction': re.compile(
            r'(?P<whole>\d+)\s+'
            r'(?P<num>\d+)\s*/\s*(?P<denom>\d+)\s*'
            r'["\']?',
            re.IGNORECASE
        ),
        
        # Simple fraction: 1/4"
        'simple_fraction': re.compile(
            r'(?P<num>\d+)\s*/\s*(?P<denom>\d+)\s*'
            r'["\']?',
            re.IGNORECASE
        ),
        
        # Decimal inches: 0.250in, .250"
        'decimal_inch': re.compile(
            r'(?P<value>-?\d*\.?\d+)\s*'
            r'(?P<unit>in(?:ch(?:es)?)?|["\'])',
            re.IGNORECASE
        ),
        
        # Metric: 25mm
        'metric_mm': re.compile(
            r'(?P<value>-?\d+(?:[.,]\d+)?)\s*'
            r'(?P<unit>mm)',
            re.IGNORECASE
        ),
        
        # Angle degrees: 45°
        'angle_degrees': re.compile(
            r'(?P<value>-?\d+(?:\.\d+)?)\s*'
            r'(?P<unit>[°]|deg(?:rees?)?)',
            re.IGNORECASE
        ),
    }
    
    # =========================================================================
    # COMPOUND DIMENSION PATTERNS
    # =========================================================================
    
    COMPOUND_PATTERNS = {
        # Key dimensions: 0.188" Wd. x 7/8" Lg.
        'key_dimension': re.compile(
            r'(?P<width>\d+(?:\.\d+)?)["\']?\s*'
            r'(?:Wd\.?|Width)\s*'
            r'[xX]\s*'
            r'(?P<length>\d+(?:\s+\d+)?(?:/\d+)?(?:\.\d+)?)["\']?\s*'
            r'(?:Lg\.?|Length|Long)',
            re.IGNORECASE
        ),
        
        # Usable length range
        'usable_range': re.compile(
            r'(?:Usable\s+)?Length\s+Range\s*'
            r'(?P<type>Min\.?|Max\.?|Minimum|Maximum)?\s*'
            r'[:.]?\s*'
            r'(?P<value>\d+(?:\s+\d+/\d+|\.\d+)?)["\']?',
            re.IGNORECASE
        ),
        
        # Travel length
        'travel_length': re.compile(
            r'(?P<value>\d+(?:\.\d+)?)\s*(?:in|mm)?\s*'
            r'[-–]?\s*Travel(?:\s+Length)?',
            re.IGNORECASE
        ),
    }
    
    # =========================================================================
    # MODIFIER PATTERNS
    # =========================================================================
    
    MODIFIER_PATTERNS = {
        # Quantity multipliers
        'quantity': re.compile(
            r'(?P<qty>\d+)\s*[xX]\s*|'
            r'\(\s*(?P<qty2>\d+)\s*[xX]?\s*\)|'
            r'(?P<qty3>\d+)\s*(?:PL(?:ACES?)?|HOLES?)',
            re.IGNORECASE
        ),
        
        # Typical
        'typical': re.compile(
            r'TYP(?:ICAL)?\.?',
            re.IGNORECASE
        ),
        
        # Reference
        'reference': re.compile(
            r'REF(?:ERENCE)?\.?',
            re.IGNORECASE
        ),
    }
    
    # =========================================================================
    # HELPER METHODS
    # =========================================================================
    
    @classmethod
    def identify_pattern(cls, text: str) -> List[PatternMatch]:
        """Identify all patterns in a text string."""
        matches = []
        text = text.strip()
        
        # Check thread patterns
        for name, pattern in cls.THREAD_PATTERNS.items():
            match = pattern.search(text)
            if match:
                matches.append(PatternMatch(
                    text=match.group(0),
                    pattern_type=name,
                    category='thread',
                    confidence=0.9,
                    normalized=match.group(0)
                ))
        
        # Check tolerance patterns
        for name, pattern in cls.TOLERANCE_PATTERNS.items():
            match = pattern.search(text)
            if match:
                matches.append(PatternMatch(
                    text=match.group(0),
                    pattern_type=name,
                    category='tolerance',
                    confidence=0.85,
                    normalized=match.group(0)
                ))
        
        # Check GD&T patterns
        for name, pattern in cls.GDT_PATTERNS.items():
            match = pattern.search(text)
            if match:
                matches.append(PatternMatch(
                    text=match.group(0),
                    pattern_type=name,
                    category='gdt',
                    confidence=0.9,
                    normalized=match.group(0)
                ))
        
        # Check dimension patterns
        for name, pattern in cls.DIMENSION_PATTERNS.items():
            match = pattern.search(text)
            if match:
                matches.append(PatternMatch(
                    text=match.group(0),
                    pattern_type=name,
                    category='dimension',
                    confidence=0.8,
                    normalized=match.group(0)
                ))
        
        # Check compound patterns
        for name, pattern in cls.COMPOUND_PATTERNS.items():
            match = pattern.search(text)
            if match:
                matches.append(PatternMatch(
                    text=match.group(0),
                    pattern_type=name,
                    category='compound',
                    confidence=0.95,
                    normalized=match.group(0)
                ))
        
        matches.sort(key=lambda m: m.confidence, reverse=True)
        return matches
    
    @classmethod
    def is_dimension_text(cls, text: str) -> bool:
        """Quick check if text contains any dimension-like pattern."""
        text = text.strip()
        
        if not any(c.isdigit() for c in text):
            return False
        
        for pattern in cls.DIMENSION_PATTERNS.values():
            if pattern.search(text):
                return True
        
        if re.search(r'[ØøR]\s*\d', text, re.IGNORECASE):
            return True
        
        if re.search(r'\d+\s*/\s*\d+', text):
            return True
        
        return False
    
    @classmethod
    def is_thread_callout(cls, text: str) -> bool:
        """Check if text is a thread callout."""
        for pattern in cls.THREAD_PATTERNS.values():
            if pattern.search(text):
                return True
        return False
    
    @classmethod
    def is_tolerance(cls, text: str) -> bool:
        """Check if text is a tolerance value."""
        text = text.strip()
        return bool(re.match(r'^[+\-±]\s*\.?\d+(?:\.\d+)?$', text))
    
    @classmethod
    def extract_numeric_value(cls, text: str) -> Optional[float]:
        """Extract numeric value from dimension text."""
        text = text.strip()
        
        match = re.search(r'-?\d+\.?\d*', text)
        if match:
            try:
                return float(match.group())
            except ValueError:
                pass
        
        match = re.search(r'(\d+)\s*/\s*(\d+)', text)
        if match:
            try:
                return float(match.group(1)) / float(match.group(2))
            except (ValueError, ZeroDivisionError):
                pass
        
        match = re.search(r'(\d+)\s+(\d+)\s*/\s*(\d+)', text)
        if match:
            try:
                whole = float(match.group(1))
                frac = float(match.group(2)) / float(match.group(3))
                return whole + frac
            except (ValueError, ZeroDivisionError):
                pass
        
        return None


# Export for easy import
PATTERNS = ManufacturingPatterns()
