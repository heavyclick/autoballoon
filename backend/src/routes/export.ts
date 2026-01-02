/**
 * Excel Export API Route
 * Generates AS9102 Form 3 Excel Report
 */

import { Router } from 'express';
import ExcelJS from 'exceljs';

const router = Router();

router.post('/excel', async (req, res) => {
  try {
    const { characteristics, metadata, watermark = false } = req.body;

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('AS9102 Form 3');

    // Add header rows
    worksheet.columns = [
      { header: 'Char #', key: 'id', width: 10 },
      { header: 'Page', key: 'page', width: 8 },
      { header: 'Zone', key: 'zone', width: 10 },
      { header: 'Specification', key: 'spec', width: 30 },
      { header: 'Nominal', key: 'nominal', width: 12 },
      { header: '+Tol', key: 'plus_tol', width: 10 },
      { header: '-Tol', key: 'minus_tol', width: 10 },
      { header: 'Lower Limit', key: 'lower_limit', width: 14 },
      { header: 'Upper Limit', key: 'upper_limit', width: 14 },
      { header: 'Units', key: 'units', width: 8 },
      { header: 'Method', key: 'method', width: 12 },
      { header: 'Results', key: 'results', width: 12 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE63946' },
    };
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // Add data rows
    characteristics.forEach((char: any, index: number) => {
      const row = worksheet.addRow({
        id: char.id,
        page: char.page,
        zone: char.zone || '—',
        spec: char.parsed?.full_specification || char.value,
        nominal: char.parsed?.nominal || '',
        plus_tol: char.parsed?.plus_tolerance || '',
        minus_tol: char.parsed?.minus_tolerance || '',
        lower_limit: char.parsed?.lower_limit?.toFixed(4) || '',
        upper_limit: char.parsed?.upper_limit?.toFixed(4) || '',
        units: char.parsed?.units || 'in',
        method: char.parsed?.inspection_method || '',
        results: '',
      });

      // Watermark logic: Replace every 3rd row with "UPGRADE TO VIEW"
      if (watermark && (index + 1) % 3 === 0) {
        row.getCell('spec').value = 'UPGRADE TO VIEW';
        row.getCell('spec').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFCCCCCC' },
        };
      }
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Return as downloadable file
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${metadata?.filename || 'inspection'}_AS9102.xlsx"`
    );

    return res.send(Buffer.from(buffer));
  } catch (error: any) {
    console.error('Excel export error:', error);
    return res.status(500).json({
      error: 'Failed to generate Excel file',
      message: error.message,
    });
  }
});

export default router;
