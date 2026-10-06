import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import ExcelJS from 'exceljs';

export type SheetValue = string | number | boolean | Date | null;

export interface Sheet {
  headers: string[];
  rows: SheetValue[][];
}

export type SpreadsheetFormat = 'csv' | 'xlsx';

export const MAX_IMPORT_ROWS = 50_000;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export const CONTENT_TYPES: Record<SpreadsheetFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function detectFormat(filename: string): SpreadsheetFormat {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'csv';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'xls') {
    throw new BadRequestException(
      'Legacy .xls files are not supported. Re-save the file as .xlsx or .csv.',
    );
  }
  throw new BadRequestException('Upload a .csv or .xlsx file');
}

/** Reads the first worksheet (or the CSV) into a header row plus data rows. */
export async function readSpreadsheet(
  buffer: Buffer,
  format: SpreadsheetFormat,
): Promise<Sheet> {
  const matrix =
    format === 'csv' ? readCsv(buffer) : await readXlsx(buffer);

  const nonEmpty = matrix.filter((row) => row.some((v) => !isBlank(v)));
  const [headerRow, ...rows] = nonEmpty;
  if (!headerRow) throw new BadRequestException('The file is empty');

  const headers = headerRow.map((h) => (h === null ? '' : String(h).trim()));
  if (headers.every((h) => h === '')) {
    throw new BadRequestException('The first row must contain column headers');
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new BadRequestException(
      `Files are limited to ${MAX_IMPORT_ROWS.toLocaleString()} rows (this one has ${rows.length.toLocaleString()})`,
    );
  }
  return { headers, rows };
}

function readCsv(buffer: Buffer): SheetValue[][] {
  try {
    return parse(buffer, {
      bom: true,
      delimiter: [',', ';', '\t'],
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      trim: true,
    }) as string[][];
  } catch (err) {
    throw new BadRequestException(
      `Could not parse CSV: ${(err as Error).message}`,
    );
  }
}

async function readXlsx(buffer: Buffer): Promise<SheetValue[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException('Could not read the Excel file');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('The workbook has no sheets');

  const matrix: SheetValue[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: SheetValue[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      values.push(normalizeExcelValue(row.getCell(c).value));
    }
    matrix.push(values);
  });
  return matrix;
}

function normalizeExcelValue(value: ExcelJS.CellValue): SheetValue {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value instanceof Date
  ) {
    return value;
  }
  if ('richText' in value) return value.richText.map((r) => r.text).join('');
  if ('hyperlink' in value) return String(value.text ?? value.hyperlink);
  if ('result' in value) {
    return normalizeExcelValue(value.result as ExcelJS.CellValue);
  }
  if ('error' in value) return null;
  return String(value as unknown);
}

export function isBlank(value: SheetValue | undefined): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '')
  );
}

export async function writeSpreadsheet(
  format: SpreadsheetFormat,
  sheetName: string,
  headers: string[],
  rows: SheetValue[][],
): Promise<Buffer> {
  if (format === 'csv') {
    const csv = stringify([headers, ...rows], {
      cast: {
        boolean: (v) => (v ? 'true' : 'false'),
        date: (v) => v.toISOString(),
      },
    });
    // BOM so Excel opens UTF-8 CSVs with the right encoding.
    return Buffer.from(`﻿${csv}`, 'utf8');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PartnerHero Records';
  workbook.created = new Date();
  // Excel limits sheet names to 31 chars and forbids some characters.
  const sheet = workbook.addWorksheet(
    sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1',
    { views: [{ state: 'frozen', ySplit: 1 }] },
  );
  sheet.addRow(headers).font = { bold: true };
  for (const row of rows) sheet.addRow(row);

  sheet.columns.forEach((column, i) => {
    let width = headers[i]?.length ?? 10;
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      if (cell.value instanceof Date) {
        cell.numFmt = 'yyyy-mm-dd';
        width = Math.max(width, 10);
      } else {
        width = Math.max(width, String(cell.value ?? '').length);
      }
    });
    column.width = Math.min(Math.max(width + 2, 8), 60);
  });
  if (headers.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length },
    };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
