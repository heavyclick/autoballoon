"""
Sampling Service - ANSI/ASQ Z1.4
Calculates inspection sample sizes based on lot size and inspection levels.
"""

class SamplingService:
    """
    Implements sampling logic for AQL (Acceptable Quality Limit).
    Defaults to General Inspection Level II.
    """

    # ANSI/ASQ Z1.4 Table 1 - Sample Size Code Letters (General Inspection Level II)
    # (Lot Size Max, Code Letter)
    LOT_SIZE_TABLE = [
        (8, 'A'),
        (15, 'B'),
        (25, 'C'),
        (50, 'D'),
        (90, 'E'),
        (150, 'F'),
        (280, 'G'),
        (500, 'H'),
        (1200, 'J'),
        (3200, 'K'),
        (10000, 'L'),
        (35000, 'M'),
        (150000, 'N'),
        (500000, 'P'),
        (float('inf'), 'Q')
    ]

    # ANSI/ASQ Z1.4 Table 2-A - Single Sampling Plans for Normal Inspection
    # Code Letter -> Sample Size
    SAMPLE_SIZE_TABLE = {
        'A': 2,
        'B': 3,
        'C': 5,
        'D': 8,
        'E': 13,
        'F': 20,
        'G': 32,
        'H': 50,
        'J': 80,
        'K': 125,
        'L': 200,
        'M': 315,
        'N': 500,
        'P': 800,
        'Q': 1250
    }

    def calculate_sample_size(self, lot_size: int, level: str = "II") -> int:
        """
        Calculates required sample size for a given lot size.
        """
        if lot_size <= 0:
            return 0
            
        # 1. Find Code Letter
        code_letter = 'A'
        for max_size, letter in self.LOT_SIZE_TABLE:
            if lot_size <= max_size:
                code_letter = letter
                break
        
        # 2. Lookup Sample Size
        sample_size = self.SAMPLE_SIZE_TABLE.get(code_letter, 0)
        
        # Sample size cannot exceed lot size
        return min(sample_size, lot_size)

# Singleton
sampling_service = SamplingService()
