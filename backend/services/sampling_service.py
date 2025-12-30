"""
Sampling Service - ANSI/ASQ Z1.4
Calculates inspection sample sizes and Accept/Reject criteria based on lot size, 
inspection levels, and AQL (Acceptable Quality Limit).

Implementation Status:
- Table 1 (Sample Size Code Letters): COMPLETE
- Table 2-A (Single Sampling Plans for Normal Inspection): COMPLETE
- Inspection Levels (I, II, III, S-1 to S-4): COMPLETE
- Switching Logic (Arrow Up/Down): COMPLETE
"""

class SamplingService:
    """
    Implements sampling logic for ANSI/ASQ Z1.4 (Attributes).
    """

    # ---------------------------------------------------------
    # 1. CONSTANTS & REFERENCE TABLES
    # ---------------------------------------------------------

    # Ordered list of code letters (used for index shifting/arrows)
    CODE_LETTERS = [
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R'
    ]

    # Map of Code Letter -> Base Sample Size (Table 2-A)
    # Note: Arrow logic may force a shift to a different letter/size.
    SAMPLE_SIZE_MAP = {
        'A': 2, 'B': 3, 'C': 5, 'D': 8, 'E': 13, 
        'F': 20, 'G': 32, 'H': 50, 'J': 80, 'K': 125, 
        'L': 200, 'M': 315, 'N': 500, 'P': 800, 'Q': 1250, 'R': 2000
    }

    # ANSI/ASQ Z1.4 Table 1 - Lot Size Ranges to Level II Code Letter
    # (Lot Size Max, Level II Letter)
    LOT_SIZE_TABLE_II = [
        (8, 'A'), (15, 'B'), (25, 'C'), (50, 'D'), (90, 'E'),
        (150, 'F'), (280, 'G'), (500, 'H'), (1200, 'J'), (3200, 'K'),
        (10000, 'L'), (35000, 'M'), (150000, 'N'), (500000, 'P'),
        (float('inf'), 'Q') # Level II maxes at Q; R is used for shifting or Level III large lots
    ]

    # Inspection Level Offsets relative to Level II
    # Positive = shift right (larger sample), Negative = shift left (smaller sample)
    LEVEL_OFFSETS = {
        'S-1': -6, 'S-2': -5, 'S-3': -4, 'S-4': -3,
        'I': -1, 'II': 0, 'III': 1
    }

    # Standard AQL Values supported by Z1.4 (Table 2-A columns)
    VALID_AQLS = [
        0.010, 0.015, 0.025, 0.040, 0.065, 0.10, 0.15, 0.25, 0.40, 
        0.65, 1.0, 1.5, 2.5, 4.0, 6.5, 10.0, 15.0, 25.0, 40.0, 65.0, 
        100.0, 150.0, 250.0, 400.0, 650.0, 1000.0
    ]

    # The standard diagonal series of (Ac, Re) pairs used in Table 2-A
    # Index 0 corresponds to the tightest AQL for a given letter.
    AC_RE_SERIES = [
        (0, 1), (1, 2), (2, 3), (3, 4), (5, 6), (7, 8), 
        (10, 11), (14, 15), (21, 22), (30, 31), (44, 45)
    ]

    # This dictionary will hold the fully constructed lookup table:
    # { 'Letter': { AQL_Value: (Ac, Re) } }
    TABLE_2A = {}

    def __init__(self):
        """Initialize the service by building the master lookup table."""
        self._build_table_2a()

    # ---------------------------------------------------------
    # 2. INITIALIZATION LOGIC
    # ---------------------------------------------------------

    def _build_table_2a(self):
        """
        Constructs the Master Table 2-A.
        Instead of hardcoding 1000+ cells, we map the known starting positions
        of the (0,1) Ac/Re pair for each code letter.
        """
        # Dictionary mapping Code Letter -> Index in VALID_AQLS where (0,1) starts.
        # Derived directly from ANSI/ASQ Z1.4 Table 2-A.
        starts = {
            'A': 14, # 6.5
            'B': 13, # 4.0
            'C': 12, # 2.5
            'D': 11, # 1.5
            'E': 10, # 1.0
            'F': 9,  # 0.65
            'G': 8,  # 0.40
            'H': 7,  # 0.25
            'J': 6,  # 0.15
            'K': 5,  # 0.10
            'L': 4,  # 0.065
            'M': 3,  # 0.040
            'N': 2,  # 0.025
            'P': 1,  # 0.015
            'Q': 0,  # 0.010
            'R': -1  # Special case: R starts (1,2) at 0.010, effectively shifting start left
        }

        for letter in self.CODE_LETTERS:
            self.TABLE_2A[letter] = {}
            
            # Determine where the Ac/Re series begins for this letter
            start_aql_idx = starts.get(letter, 0)
            
            # Handle the 'series_idx' offset
            # Most start at (0,1), but 'R' is shifted and starts at (1,2) for the lowest AQL
            series_start_idx = 0
            if letter == 'R':
                start_aql_idx = 0 
                series_start_idx = 1 # Skip (0,1), start at (1,2)

            # Populate the valid AQLs for this letter
            # We iterate through the available (Ac, Re) pairs
            for i in range(len(self.AC_RE_SERIES) - series_start_idx):
                aql_idx = start_aql_idx + i
                series_idx = series_start_idx + i
                
                # Boundary checks
                if 0 <= aql_idx < len(self.VALID_AQLS) and series_idx < len(self.AC_RE_SERIES):
                    aql_val = self.VALID_AQLS[aql_idx]
                    ac_re_pair = self.AC_RE_SERIES[series_idx]
                    self.TABLE_2A[letter][aql_val] = ac_re_pair

    # ---------------------------------------------------------
    # 3. HELPER METHODS
    # ---------------------------------------------------------

    def _get_nearest_standard_aql(self, aql: float) -> float:
        """Snaps user input (e.g., 0.6) to the nearest standard AQL (0.65)."""
        return min(self.VALID_AQLS, key=lambda x: abs(x - aql))

    def _get_code_letter_index(self, letter: str) -> int:
        """Helper to find list index of a letter."""
        try:
            return self.CODE_LETTERS.index(letter)
        except ValueError:
            return 0 # Default to A if error

    # ---------------------------------------------------------
    # 4. PUBLIC API
    # ---------------------------------------------------------

    def calculate_sample_size(self, lot_size: int, level: str = "II", aql: float = 2.5) -> int:
        """
        Returns just the required sample size integer.
        Convenience wrapper around get_sampling_plan.
        """
        plan = self.get_sampling_plan(lot_size, level, aql)
        return plan['sample_size']

    def get_sampling_plan(self, lot_size: int, level: str = "II", input_aql: float = 2.5) -> dict:
        """
        Main Logic: Calculates the full sampling plan.
        
        Args:
            lot_size (int): Total quantity of parts.
            level (str): Inspection Level (S-1...S-4, I, II, III).
            input_aql (float): Target AQL.
            
        Returns:
            dict: Full plan details including Ac, Re, and final Sample Size.
        """
        # Edge case: No parts
        if lot_size <= 0:
            return self._empty_plan(lot_size, level, input_aql)

        # 1. Normalize AQL
        aql = self._get_nearest_standard_aql(input_aql)

        # 2. Determine Baseline Code Letter (Level II)
        # Scan the LOT_SIZE_TABLE to find the bracket
        base_letter = 'A'
        for max_size, letter in self.LOT_SIZE_TABLE_II:
            if lot_size <= max_size:
                base_letter = letter
                break
        
        # 3. Apply Inspection Level Shift
        # Convert Letter -> Index -> Apply Offset -> Convert back to Letter
        base_index = self._get_code_letter_index(base_letter)
        offset = self.LEVEL_OFFSETS.get(level, 0)
        
        # Clamp index to valid range [0, 15] (A to R)
        current_index = max(0, min(base_index + offset, len(self.CODE_LETTERS) - 1))
        
        # 4. Resolve "Arrow" Logic (Switching Rules)
        # We must find a Code Letter that actually supports the requested AQL.
        # If the table cell is empty, it means "Follow the arrow".
        
        final_letter = None
        ac, re = (0, 0)
        note = ""
        
        # Safety limit for loop
        iterations = 0
        max_iterations = len(self.CODE_LETTERS)

        while iterations < max_iterations:
            current_letter = self.CODE_LETTERS[current_index]
            letter_plans = self.TABLE_2A.get(current_letter, {})
            
            # Get valid AQL range for this letter
            valid_aqls_for_letter = sorted(letter_plans.keys())
            
            if not valid_aqls_for_letter:
                # Should not happen given standard tables
                break
                
            min_aql = valid_aqls_for_letter[0]
            max_aql = valid_aqls_for_letter[-1]
            
            # CASE A: AQL is valid for this letter
            if aql in letter_plans:
                final_letter = current_letter
                ac, re = letter_plans[aql]
                break
            
            # CASE B: Down Arrow (AQL is tighter/smaller than available)
            # Standard Rule: Use the next sampling plan below arrow (Larger sample size)
            elif aql < min_aql:
                if current_index >= len(self.CODE_LETTERS) - 1:
                    # We are at 'R' (max). Use the tightest plan R has.
                    final_letter = 'R'
                    ac, re = letter_plans[min_aql]
                    note = "AQL too low for standard table; using tightest available."
                    break
                
                # Move to next letter
                current_index += 1
                note = "Arrow Down (Increased Sample Size)"
                
            # CASE C: Up Arrow (AQL is looser/larger than available)
            # Standard Rule: Use the next sampling plan above arrow (Smaller sample size)
            elif aql > max_aql:
                if current_index <= 0:
                    # We are at 'A' (min). Use the loosest plan A has.
                    final_letter = 'A'
                    ac, re = letter_plans[max_aql]
                    note = "Arrow Up (Decreased Sample Size)"
                    break
                    
                # Move to previous letter
                current_index -= 1
                note = "Arrow Up (Decreased Sample Size)"
            
            iterations += 1

        # Fallback if loop completes without match (should not occur)
        if final_letter is None:
            final_letter = self.CODE_LETTERS[current_index]
            ac, re = (0, 1)

        # 5. Lookup Final Sample Size
        sample_size = self.SAMPLE_SIZE_MAP.get(final_letter, 0)
        
        # 6. Apply 100% Inspection Cap
        # Z1.4 Rule: If sample_size >= lot_size, inspect everything.
        inspection_type = "Sampling"
        
        if sample_size >= lot_size:
            sample_size = lot_size
            inspection_type = "100% Inspection"
            # Note: For 100% inspection, Ac/Re technically don't apply 
            # (zero defects usually allowed), but we leave the calculated values 
            # for reference strictness.
            note += " (Sample size covers entire lot)"

        return {
            "lot_size": lot_size,
            "level": level,
            "aql": aql,
            "code_letter": final_letter,
            "sample_size": sample_size,
            "ac": ac,
            "re": re,
            "inspection_type": inspection_type,
            "note": note.strip()
        }

    def _empty_plan(self, lot_size, level, aql):
        """Return a safe empty object for invalid inputs."""
        return {
            "lot_size": lot_size,
            "level": level,
            "aql": aql,
            "code_letter": "N/A",
            "sample_size": 0,
            "ac": 0,
            "re": 0,
            "inspection_type": "N/A",
            "note": "Invalid Lot Size"
        }

# Singleton instance
sampling_service = SamplingService()
