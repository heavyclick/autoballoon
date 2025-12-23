"""
Grid Service
Handles grid zone detection and assignment for AS9102 compliance.

Manufacturing drawings typically have a grid reference system (e.g., A-H columns, 1-4 rows)
that allows inspectors to quickly locate dimensions using zone references like "C4".

NOTE: Drawing grids are typically read RIGHT-TO-LEFT for columns (H,G,F,E,D,C,B,A)
and TOP-TO-BOTTOM for rows (4,3,2,1 or 1,2,3,4 depending on drawing).
"""
from typing import Optional
from dataclasses import dataclass

from config import NORMALIZED_COORD_SYSTEM


@dataclass
class ZoneBoundaries:
    """Stores calculated zone boundaries"""
    columns: list[str]
    rows: list[str]
    column_edges: list[int]  # X positions (normalized 0-1000)
    row_edges: list[int]     # Y positions (normalized 0-1000)


class GridService:
    """
    Detects grid reference system and assigns zones to dimensions.
    """
    
    def __init__(self, vision_service=None):
        self.vision_service = vision_service
        self._zone_boundaries: Optional[ZoneBoundaries] = None
    
    async def detect_grid(self, image_bytes: bytes):
        """
        Detect the grid reference system on the drawing.
        Returns GridInfo dict.
        """
        from models import GridInfo
        
        grid_info = GridInfo(detected=False)
        
        if not self.vision_service:
            # Default to standard 8x4 grid (H-A, 4-1)
            # Columns go H,G,F,E,D,C,B,A (right to left on drawing, but left to right in image)
            # Rows go 4,3,2,1 (top to bottom)
            columns = ["H", "G", "F", "E", "D", "C", "B", "A"]
            rows = ["4", "3", "2", "1"]
            
            self._zone_boundaries = ZoneBoundaries(
                columns=columns,
                rows=rows,
                column_edges=self._calculate_edges(len(columns)),
                row_edges=self._calculate_edges(len(rows))
            )
            
            return GridInfo(
                detected=True,
                columns=columns,
                rows=rows,
                boundaries={
                    "column_edges": self._zone_boundaries.column_edges,
                    "row_edges": self._zone_boundaries.row_edges
                }
            )
        
        try:
            grid_data = await self.vision_service.detect_grid(image_bytes)
            
            if grid_data:
                columns = grid_data.get("columns", [])
                rows = grid_data.get("rows", [])
                boundaries = grid_data.get("boundaries", {})
                
                if columns and rows:
                    self._zone_boundaries = ZoneBoundaries(
                        columns=columns,
                        rows=rows,
                        column_edges=boundaries.get("column_edges", self._calculate_edges(len(columns))),
                        row_edges=boundaries.get("row_edges", self._calculate_edges(len(rows)))
                    )
                    
                    grid_info = GridInfo(
                        detected=True,
                        columns=columns,
                        rows=rows,
                        boundaries=boundaries
                    )
        except Exception as e:
            print(f"Grid detection error (using default): {e}")
            # Fall back to default grid
            columns = ["H", "G", "F", "E", "D", "C", "B", "A"]
            rows = ["4", "3", "2", "1"]
            
            self._zone_boundaries = ZoneBoundaries(
                columns=columns,
                rows=rows,
                column_edges=self._calculate_edges(len(columns)),
                row_edges=self._calculate_edges(len(rows))
            )
            
            grid_info = GridInfo(
                detected=True,
                columns=columns,
                rows=rows,
                boundaries={
                    "column_edges": self._zone_boundaries.column_edges,
                    "row_edges": self._zone_boundaries.row_edges
                }
            )
        
        return grid_info
    
    def _calculate_edges(self, count: int) -> list[int]:
        """Calculate evenly distributed edges for a given count"""
        return [
            int(i * NORMALIZED_COORD_SYSTEM / count)
            for i in range(count + 1)
        ]
    
    def set_grid_manually(self, columns: list[str], rows: list[str]) -> None:
        """Manually set grid configuration."""
        self._zone_boundaries = ZoneBoundaries(
            columns=columns,
            rows=rows,
            column_edges=self._calculate_edges(len(columns)),
            row_edges=self._calculate_edges(len(rows))
        )
    
    def assign_zone(self, bounding_box) -> Optional[str]:
        """
        Determine which zone a dimension falls into based on its bounding box.
        
        Args:
            bounding_box: The dimension's bounding box (normalized 0-1000)
            
        Returns:
            Zone string (e.g., "F4") or None if no grid configured
        """
        if not self._zone_boundaries:
            return None
        
        # Use center point of bounding box
        center_x = (bounding_box.xmin + bounding_box.xmax) // 2
        center_y = (bounding_box.ymin + bounding_box.ymax) // 2
        
        # Find column (x position)
        column_idx = self._find_zone_index(
            center_x, 
            self._zone_boundaries.column_edges
        )
        
        # Find row (y position)
        row_idx = self._find_zone_index(
            center_y,
            self._zone_boundaries.row_edges
        )
        
        if column_idx is None or row_idx is None:
            return None
        
        column = self._zone_boundaries.columns[column_idx]
        row = self._zone_boundaries.rows[row_idx]
        
        return f"{column}{row}"
    
    def _find_zone_index(self, position: int, edges: list[int]) -> Optional[int]:
        """Find which zone a position falls into based on edge boundaries."""
        for i in range(len(edges) - 1):
            if edges[i] <= position < edges[i + 1]:
                return i
        
        # Handle edge case: position exactly at last edge
        if position == edges[-1] and len(edges) > 1:
            return len(edges) - 2
        
        return None
    
    def assign_zones_to_dimensions(self, dimensions: list) -> list:
        """Assign zone references to a list of dimensions."""
        for dim in dimensions:
            dim.zone = self.assign_zone(dim.bounding_box)
        return dimensions
    
    def recalculate_zone(self, new_bounding_box) -> Optional[str]:
        """Recalculate zone for a moved balloon."""
        return self.assign_zone(new_bounding_box)


def create_grid_service(vision_service=None):
    """Factory function to create grid service"""
    return GridService(vision_service=vision_service)
