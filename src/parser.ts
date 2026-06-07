import readXlsxFile, { readSheetNames } from "read-excel-file";
import type { CellValue, Row } from "read-excel-file";

const RENDER_ROW_LIMIT = 10000;

export interface WorksheetTable {
  name: string;
  rows: string[][];
  renderedRows: string[][];
  rowCount: number;
  columnCount: number;
  skippedRows: number;
  warnings: string[];
}

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: WorksheetTable[];
  warnings: string[];
}

export async function parseWorkbook(data: ArrayBuffer): Promise<ParsedWorkbook> {
  if (!hasZipSignature(data)) {
    throw new Error("File is not a valid .xlsx workbook.");
  }

  const sheetNames = await readSheetNames(data);
  const warnings: string[] = [];
  if (sheetNames.length === 0) warnings.push("Workbook has no sheets.");

  const sheets = await Promise.all(
    sheetNames.map(async (name) => worksheetToTable(name, await readXlsxFile(data, { sheet: name, trim: false }))),
  );

  return { sheetNames, sheets, warnings };
}

function worksheetToTable(name: string, rawRows: Row[]): WorksheetTable {
  const rows = rawRows.map((row) => row.map((cell) => formatCell(cell)));
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const renderedRows = rows.slice(0, RENDER_ROW_LIMIT);
  const skippedRows = Math.max(0, rows.length - renderedRows.length);
  const warnings: string[] = [];

  if (rows.length === 0) warnings.push("Sheet is empty.");
  if (skippedRows > 0) {
    warnings.push(`${skippedRows} rows are not rendered to keep the view responsive.`);
  }

  return {
    name,
    rows,
    renderedRows,
    rowCount: rows.length,
    columnCount,
    skippedRows,
    warnings,
  };
}

function formatCell(cell: CellValue | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  if (isDate(cell)) return cell.toISOString().slice(0, 10);
  return String(cell);
}

function isDate(value: unknown): value is Date {
  return Object.prototype.toString.call(value) === "[object Date]";
}

function hasZipSignature(data: ArrayBuffer): boolean {
  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 4));
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function columnLabel(index: number): string {
  let label = "";
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }
  return label;
}
