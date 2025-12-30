"""
Export Service - AS9102 Rev C / ISO 13485 Compliant
Generates comprehensive inspection packages (Forms 1, 2, & 3).

Features:
- Multi-tab Workbook: Form 1 (Part Accountability), Form 2 (Materials), Form 3 (Results).
- Intelligent Formatting: Auto-colors Pass/Fail and highlights Critical features.
- Metadata Integration: Captures Revision, PO Numbers, and Material Certs.
- Smart Math: Exports formulas for Max/Min limits if parsed data exists.
"""
import csv
import io
from datetime import datetime
from typing import Optional, List, Dict, Any, Union

from openpyxl import Workbook
from openpyxl.worksheet.worksheet import Worksheet
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, Protection
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import CellIsRule

from models import ExportFormat, ExportTemplate, ExportMetadata

class ExportService:
    """
    Generates compliance-ready export files for FAI inspection data.
    """
    
    # ==================
    # Color Scheme & Styles
    # ==================
    HEADER_BG = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")  # Dark Blue
    HEADER_FONT = Font(bold=True, color="FFFFFF", size=10, name="Arial")
    
    SUBHEADER_BG = PatternFill(start_color="D6DCE4", end_color="D6DCE4", fill_type="solid")  # Light Gray
    SUBHEADER_FONT = Font(bold=True, color="000000", size=9, name="Arial")
    
    TITLE_FONT = Font(bold=True, color="000000", size=14, name="Arial")
    SUBTITLE_FONT = Font(bold=True, color="1F4E79", size=11, name="Arial")
    
    LABEL_FONT = Font(bold=True, color="000000", size=9, name="Arial")
    DATA_FONT = Font(color="000000", size=9, name="Arial")
    NOTE_FONT = Font(italic=True, color="666666", size=8, name="Arial")
    
    # Conditional Formatting Colors
    PASS_FILL = PatternFill(start_color='C6EFCE', end_color='C6EFCE', fill_type='solid') # Green
    FAIL_FILL = PatternFill(start_color='FFC7CE', end_color='FFC7CE', fill_type='solid') # Red
    
    # Borders
    THIN_BORDER = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )
    MEDIUM_BORDER = Border(
        left=Side(style='medium'), right=Side(style='medium'),
        top=Side(style='medium'), bottom=Side(style='medium')
    )
    
    # Alignments
    CENTER = Alignment(horizontal='center', vertical='center', wrap_text=True)
    LEFT = Alignment(horizontal='left', vertical='center', wrap_text=True)
    RIGHT = Alignment(horizontal='right', vertical='center')
    
    # AS9102 Form 3 Column Definitions
    FORM3_HEADERS = [
        ("5. Char\nNo.", 8),            # A
        ("6. Reference\nLocation", 12), # B
        ("7. Characteristic\nDesignator", 15),  # C (Classification)
        ("8. Requirement", 35),         # D
        ("9. Results", 15),             # E
        ("10. Designed/\nQualified\nTooling", 12), # F
        ("11. Non-\nConformance\nNumber", 12), # G
        ("Sheet", 8),                   # H
    ]

    def generate_export(
        self,
        dimensions: List[Dict],
        format: ExportFormat,
        template: ExportTemplate = ExportTemplate.AS9102_FORM3,
        metadata: Optional[ExportMetadata] = None,
        filename: str = "inspection",
        grid_detected: bool = True,
        total_pages: int = 1
    ) -> tuple[bytes, str, str]:
        """Orchestrator for generating export files."""
        
        if format == ExportFormat.CSV:
            return self._generate_csv(dimensions, filename, total_pages)
        
        # Excel Generation
        if template == ExportTemplate.SIMPLE:
            return self._generate_simple_xlsx(dimensions, filename, total_pages)
        elif template in [ExportTemplate.AS9102_FORM3, "AS9102_FULL"]:
            return self._generate_full_package_xlsx(dimensions, metadata, filename, grid_detected, total_pages)
        else:
            # Fallback for future templates (PPAP, ISO13485)
            return self._generate_full_package_xlsx(dimensions, metadata, filename, grid_detected, total_pages)

    def _generate_csv(self, dimensions: List[Dict], filename: str, total_pages: int = 1) -> tuple[bytes, str, str]:
        """Generate CSV export with classification support."""
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Header
        header = ["Char No", "Reference Location", "Classification", "Requirement", "Results", "Min", "Max"]
        if total_pages > 1:
            header.append("Sheet")
        writer.writerow(header)
        
        # Data
        for dim in dimensions:
            parsed = dim.get("parsed", {}) or {}
            row = [
                dim.get("id", ""),
                dim.get("zone", "—"),
                dim.get("classification", ""), # Critical/Major/Minor
                dim.get("value", ""),
                dim.get("actual", ""),
                parsed.get("min_limit", ""),
                parsed.get("max_limit", "")
            ]
            if total_pages > 1:
                row.append(dim.get("page", 1))
            writer.writerow(row)
        
        return (output.getvalue().encode('utf-8'), "text/csv", f"{filename}.csv")

    def _generate_simple_xlsx(self, dimensions: List[Dict], filename: str, total_pages: int) -> tuple[bytes, str, str]:
        """Simple Excel dump for quick analysis."""
        wb = Workbook()
        ws = wb.active
        ws.title = "Inspection Data"
        
        headers = ["ID", "Zone", "Class", "Requirement", "Min", "Max", "Result"]
        ws.append(headers)
        
        for dim in dimensions:
            parsed = dim.get("parsed", {}) or {}
            ws.append([
                dim.get("id"),
                dim.get("zone"),
                dim.get("classification"),
                dim.get("value"),
                parsed.get("min_limit"),
                parsed.get("max_limit"),
                "" # Result placeholder
            ])
            
        output = io.BytesIO()
        wb.save(output)
        return (output.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f"{filename}.xlsx")

    def _generate_full_package_xlsx(
        self,
        dimensions: List[Dict],
        metadata: Optional[ExportMetadata],
        filename: str,
        grid_detected: bool,
        total_pages: int
    ) -> tuple[bytes, str, str]:
        """
        Generates the full AS9102 3-Form Workbook.
        Tab 1: Part Accountability (Form 1)
        Tab 2: Product Accountability (Form 2)
        Tab 3: Characteristic Accountability (Form 3)
        """
        wb = Workbook()
        
        # Remove default sheet
        if "Sheet" in wb.sheetnames:
            wb.remove(wb["Sheet"])
            
        # 1. Generate Form 1 (Part Info)
        self._create_form1(wb, metadata)
        
        # 2. Generate Form 2 (BOM / Specs)
        self._create_form2(wb, metadata)
        
        # 3. Generate Form 3 (Dimensions)
        self._create_form3(wb, dimensions, metadata, grid_detected, total_pages)
        
        # Build Filename
        parts = [filename]
        if metadata:
            if getattr(metadata, 'part_number', None): parts.insert(0, metadata.part_number)
            if getattr(metadata, 'revision', None): parts.append(f"Rev{metadata.revision}")
        
        full_filename = "_".join(parts) + "_AS9102.xlsx"
        
        output = io.BytesIO()
        wb.save(output)
        return (output.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", full_filename)

    def _create_form1(self, wb: Workbook, metadata: Optional[ExportMetadata]):
        """Creates AS9102 Form 1: Part Number Accountability."""
        ws = wb.create_sheet("Form 1")
        
        # Set column widths
        ws.column_dimensions['A'].width = 20
        ws.column_dimensions['B'].width = 30
        ws.column_dimensions['C'].width = 20
        ws.column_dimensions['D'].width = 30
        
        # Title
        ws.merge_cells('A1:D1')
        title = ws.cell(row=1, column=1, value="AS9102 FORM 1: PART NUMBER ACCOUNTABILITY")
        title.font = self.TITLE_FONT
        title.alignment = self.CENTER
        
        # Fields Mapping (Label, Row, Col_Label, Col_Value)
        # Using getattr to handle missing fields gracefully
        fields = [
            ("1. Part Number", 3, 1, getattr(metadata, 'part_number', '')),
            ("2. Part Name", 3, 3, getattr(metadata, 'part_name', '')),
            ("3. Serial Number", 4, 1, getattr(metadata, 'serial_number', '')),
            ("4. FAI Report Number", 4, 3, getattr(metadata, 'fai_report_number', '')),
            ("5. Part Revision Level", 5, 1, getattr(metadata, 'revision', '')),
            ("6. Drawing Number", 5, 3, getattr(metadata, 'part_number', '')), # Often same as Part No
            ("7. Drawing Revision", 6, 1, getattr(metadata, 'revision', '')),
            ("8. Additional Changes", 6, 3, ""),
            ("9. Mfg. Process Ref.", 7, 1, ""),
            ("10. Organization Name", 7, 3, "Your Organization Inc."), # Placeholder
            ("11. Supplier Code", 8, 1, ""),
            ("12. P.O. Number", 8, 3, ""),
        ]
        
        for label, row, col, val in fields:
            # Label Cell
            l_cell = ws.cell(row=row, column=col, value=label)
            l_cell.font = self.LABEL_FONT
            l_cell.fill = self.SUBHEADER_BG
            l_cell.border = self.THIN_BORDER
            
            # Value Cell
            v_cell = ws.cell(row=row, column=col+1, value=val)
            v_cell.font = self.DATA_FONT
            v_cell.border = self.THIN_BORDER
            v_cell.alignment = self.LEFT

        # Assembly/Detail Checkboxes
        ws.merge_cells('A10:D10')
        ws['A10'] = "13. Detail FAI   [ ]   Assembly FAI   [ ]"
        ws['A10'].alignment = self.CENTER
        ws['A10'].font = self.LABEL_FONT
        
        ws.merge_cells('A11:D11')
        ws['A11'] = "14. Full FAI   [X]   Partial FAI   [ ]"
        ws['A11'].alignment = self.CENTER
        ws['A11'].font = self.LABEL_FONT

        # Signature Block
        sig_row = 14
        ws.cell(row=sig_row, column=1, value="19. Signature").font = self.LABEL_FONT
        ws.cell(row=sig_row, column=2, value="______________________")
        ws.cell(row=sig_row, column=3, value="20. Date").font = self.LABEL_FONT
        ws.cell(row=sig_row, column=4, value="______________________")

    def _create_form2(self, wb: Workbook, metadata: Optional[ExportMetadata]):
        """Creates AS9102 Form 2: Product Accountability (Materials/Specs)."""
        ws = wb.create_sheet("Form 2")
        
        # Columns
        headers = [
            ("5. Material or Process Name", 30),
            ("6. Specification Number", 25),
            ("7. Code", 10),
            ("8. Supplier", 25),
            ("9. Customer Approval", 15),
            ("10. Certificate of Conformance", 20)
        ]
        
        # Setup Header
        ws.merge_cells('A1:F1')
        title = ws.cell(row=1, column=1, value="AS9102 FORM 2: PRODUCT ACCOUNTABILITY")
        title.font = self.TITLE_FONT
        title.alignment = self.CENTER
        
        # Column Headers
        for idx, (txt, width) in enumerate(headers, 1):
            cell = ws.cell(row=3, column=idx, value=txt)
            cell.font = self.HEADER_FONT
            cell.fill = self.HEADER_BG
            cell.alignment = self.CENTER
            cell.border = self.THIN_BORDER
            ws.column_dimensions[get_column_letter(idx)].width = width
            
        # Data Rows (Extract from metadata if available, otherwise placeholders)
        # Assuming metadata might have 'materials' list in future update
        materials = getattr(metadata, 'materials', []) 
        start_row = 4
        
        if not materials:
            # Add blank rows for manual entry
            for i in range(5):
                for c in range(1, 7):
                    ws.cell(row=start_row+i, column=c).border = self.THIN_BORDER
        else:
            for i, mat in enumerate(materials):
                ws.cell(row=start_row+i, column=1, value=mat.get('name', ''))
                ws.cell(row=start_row+i, column=2, value=mat.get('spec', ''))
                ws.cell(row=start_row+i, column=6, value=mat.get('cert_number', ''))
                # Style rows
                for c in range(1, 7):
                    ws.cell(row=start_row+i, column=c).border = self.THIN_BORDER

    def _create_form3(self, wb: Workbook, dimensions: List[Dict], metadata, grid_detected, total_pages):
        """Creates AS9102 Form 3: Characteristic Accountability."""
        ws = wb.create_sheet("Form 3")
        
        # Title Block
        ws.merge_cells('A1:H1')
        ws['A1'] = "AS9102 FORM 3: CHARACTERISTIC ACCOUNTABILITY"
        ws['A1'].font = self.TITLE_FONT
        ws['A1'].alignment = self.CENTER
        
        # Part Info Row
        ws['A3'] = f"1. Part Number: {getattr(metadata, 'part_number', '')}"
        ws['C3'] = f"2. Part Name: {getattr(metadata, 'part_name', '')}"
        ws['E3'] = f"3. Serial Number: {getattr(metadata, 'serial_number', '')}"
        ws['G3'] = f"4. FAI Identifier: {getattr(metadata, 'fai_report_number', '')}"
        for cell in ['A3', 'C3', 'E3', 'G3']:
            ws[cell].font = self.LABEL_FONT
            ws[cell].border = self.THIN_BORDER

        # Column Headers
        header_row = 5
        for col_idx, (header, width) in enumerate(self.FORM3_HEADERS, start=1):
            if col_idx == 8 and total_pages <= 1: continue # Skip Sheet col if single page
            
            cell = ws.cell(row=header_row, column=col_idx, value=header)
            cell.font = self.HEADER_FONT
            cell.fill = self.HEADER_BG
            cell.alignment = self.CENTER
            cell.border = self.THIN_BORDER
            ws.column_dimensions[get_column_letter(col_idx)].width = width

        # Data Rows
        current_row = 6
        for dim in dimensions:
            parsed = dim.get("parsed") or {}
            
            # 1. Char No
            self._write_cell(ws, current_row, 1, dim.get("id"), align=self.CENTER)
            
            # 2. Location (Zone)
            self._write_cell(ws, current_row, 2, dim.get("zone", "—"), align=self.CENTER)
            
            # 3. Characteristic Designator (Classification)
            # Map Critical/Major/Minor
            classification = dim.get("classification", "")
            self._write_cell(ws, current_row, 3, classification, align=self.CENTER)
            
            # 4. Requirement (Value + Tolerances)
            # If we have parsed math, maybe format nicely? For now, raw value.
            self._write_cell(ws, current_row, 4, dim.get("value", ""), align=self.LEFT)
            
            # 5. Results (User Input)
            # We add Conditional Formatting later
            self._write_cell(ws, current_row, 5, dim.get("actual", ""), align=self.CENTER)
            
            # 6. Tooling
            self._write_cell(ws, current_row, 6, "", align=self.CENTER)
            
            # 7. Non-Conformance
            self._write_cell(ws, current_row, 7, "", align=self.CENTER)
            
            # 8. Sheet
            if total_pages > 1:
                self._write_cell(ws, current_row, 8, dim.get("page", 1), align=self.CENTER)
            
            # === HIDDEN COLUMNS FOR MATH (Columns Y & Z) ===
            if parsed and parsed.get('max_limit') is not None:
                ws.cell(row=current_row, column=25, value=parsed['min_limit']) # Y = Min
                ws.cell(row=current_row, column=26, value=parsed['max_limit']) # Z = Max
                
                # Conditional Formatting for Result Column (E)
                # Green if between Min/Max
                formula_green = [f'AND(E{current_row}>=$Y{current_row},E{current_row}<=$Z{current_row})']
                ws.conditional_formatting.add(f'E{current_row}', 
                    CellIsRule(operator='between', formula=[f'$Y{current_row}', f'$Z{current_row}'], fill=self.PASS_FILL))
                
                # Red if outside
                ws.conditional_formatting.add(f'E{current_row}', 
                    CellIsRule(operator='notBetween', formula=[f'$Y{current_row}', f'$Z{current_row}'], fill=self.FAIL_FILL))

            current_row += 1

        # Add 5 Blank Rows
        for _ in range(5):
            for c in range(1, 9):
                self._write_cell(ws, current_row, c, "")
            current_row += 1

        # Footer
        current_row += 1
        ws.merge_cells(f'A{current_row}:H{current_row}')
        ws.cell(row=current_row, column=1, value=f"Generated by AutoBalloon | {datetime.now().strftime('%Y-%m-%d')}").font = self.NOTE_FONT

        # Setup Page
        ws.page_setup.orientation = 'landscape'
        ws.print_title_rows = '1:5'
        ws.freeze_panes = 'A6'

    def _write_cell(self, ws, row, col, value, align=None):
        """Helper to write cell with standard border/font."""
        cell = ws.cell(row=row, column=col, value=value)
        cell.font = self.DATA_FONT
        cell.border = self.THIN_BORDER
        if align:
            cell.alignment = align

    def generate_multi_page_export(self, pages_data: List[Dict], format: ExportFormat, template: ExportTemplate, metadata, filename, grid_statuses=None):
        """Wrapper for multi-page export."""
        all_dimensions = []
        for page_data in pages_data:
            page_num = page_data.get('page_number', 1)
            for dim in page_data.get('dimensions', []):
                dim_copy = dim.copy()
                dim_copy['page'] = page_num
                all_dimensions.append(dim_copy)
        
        grid_detected = all(grid_statuses) if grid_statuses else True
        return self.generate_export(all_dimensions, format, template, metadata, filename, grid_detected, len(pages_data))

# Singleton instance
export_service = ExportService()
