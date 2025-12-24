"""
Grid Service
Handles grid zone detection and assignment for AS9102 compliance.

Drawing grids are typically:
- Columns: H, G, F, E, D, C, B, A (LEFT to RIGHT on the image)
- Rows: 4, 3, 2, 1 (TOP to BOTTOM on the image)

So position (0,0) = top-left = H4
And position (1000,1000) = bottom-right = A1
"""
from typing import Optional
from dataclasses import dataclass


@dataclass 
class ZoneBoundaries:
    columns: list[str]
    rows: list[str]
    column_edges: list[int]
    row_edges: list[int]


class GridService:
    def __init__(self, vision_service=None):
        self.vision_service = vision_service
        self._zone_boundaries: Optional[ZoneBoundaries] = None
        # Set default grid immediately
        self._set_default_grid()
    
    def _set_default_grid(self):
        """Set up default 8x4 grid (H-A columns, 4-1 rows)"""
        # Columns from LEFT to RIGHT on image: H, G, F, E, D, C, B, A
        columns = ["H", "G", "F", "E", "D", "C", "B", "A"]
        # Rows from TOP to BOTTOM on image: 4, 3, 2, 1
        rows = ["4", "3", "2", "1"]
        
        self._zone_boundaries = ZoneBoundaries(
            columns=columns,
            rows=rows,
            column_edges=[0, 125, 250, 375, 500, 625, 750, 875, 1000],
            row_edges=[0, 250, 500, 750, 1000]
        )
    
    async def detect_grid(self, image_bytes: bytes = None):
        """Return grid info"""
        from models import GridInfo
        
        if not self._zone_boundaries:
            self._set_default_grid()
        
        return GridInfo(
            detected=True,
            columns=self._zone_boundaries.columns,
            rows=self._zone_boundaries.rows,
            boundaries={
                "column_edges": self._zone_boundaries.column_edges,
                "row_edges": self._zone_boundaries.row_edges
            }
        )
    
    def assign_zone(self, bounding_box) -> Optional[str]:
        """
        Determine zone from bounding box position.
        
        The coordinate system is normalized 0-1000:
        - x=0 is LEFT edge (column H)
        - x=1000 is RIGHT edge (column A)
        - y=0 is TOP edge (row 4)
        - y=1000 is BOTTOM edge (row 1)
        """
        if not self._zone_boundaries:
            self._set_default_grid()
        
        # Get center point
        center_x = (bounding_box.xmin + bounding_box.xmax) // 2
        center_y = (bounding_box.ymin + bounding_box.ymax) // 2
        
        # Find column index (x position)
        col_idx = 0
        for i, edge in enumerate(self._zone_boundaries.column_edges[1:], 0):
            if center_x < edge:
                col_idx = i
                break
            col_idx = i
        
        # Find row index (y position)  
        row_idx = 0
        for i, edge in enumerate(self._zone_boundaries.row_edges[1:], 0):
            if center_y < edge:
                row_idx = i
                break
            row_idx = i
        
        # Clamp indices
        col_idx = min(col_idx, len(self._zone_boundaries.columns) - 1)
        row_idx = min(row_idx, len(self._zone_boundaries.rows) - 1)
        
        column = self._zone_boundaries.columns[col_idx]
        row = self._zone_boundaries.rows[row_idx]
        
        return f"{column}{row}"
    
    def assign_zones_to_dimensions(self, dimensions: list) -> list:
        """Assign zone references to all dimensions"""
        for dim in dimensions:
            dim.zone = self.assign_zone(dim.bounding_box)
        return dimensions


def create_grid_service(vision_service=None):
    return GridService(vision_service=vision_service)
