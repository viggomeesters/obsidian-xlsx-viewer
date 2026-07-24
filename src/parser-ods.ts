import { strFromU8, unzipSync } from "fflate";
import { ParsedWorkbook, worksheetToTable } from "./parser";

const ODS_MIMETYPE = "application/vnd.oasis.opendocument.spreadsheet";
const MAX_COLUMNS = 1024;
const MAX_ROWS = 20000;

/**
 * Returns the `content.xml` text if `data` is an ODS archive, otherwise null.
 * Throws if the archive identifies as ODS but is missing `content.xml`.
 */
export function readOdsContent(data: ArrayBuffer): string | null {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(data));
  } catch {
    return null;
  }

  const mimetype = files["mimetype"] ? strFromU8(files["mimetype"]).trim() : "";
  // A different, known mimetype (another ODF app such as .odt/.odp, or any
  // non-spreadsheet package) is not ours — let it fall through to the xlsx path.
  if (mimetype && mimetype !== ODS_MIMETYPE) return null;

  const contentBytes = files["content.xml"];
  const content = contentBytes ? strFromU8(contentBytes) : "";

  // Accept when the mimetype names a spreadsheet, or (for producers that omit
  // the optional mimetype entry) when the content is actually a spreadsheet.
  const looksLikeOds =
    mimetype === ODS_MIMETYPE || content.includes("<office:spreadsheet");

  if (!looksLikeOds) return null;
  if (!contentBytes) {
    throw new Error("File is not a valid .ods spreadsheet.");
  }
  return content;
}

export function parseOds(contentXml: string): ParsedWorkbook {
  const doc = new DOMParser().parseFromString(contentXml, "application/xml");
  const tables = Array.from(doc.getElementsByTagName("table:table"));

  const warnings: string[] = [];
  if (tables.length === 0) warnings.push("Workbook has no sheets.");

  const sheetNames = tables.map(
    (table, index) => table.getAttribute("table:name") || `Sheet${index + 1}`,
  );
  const sheets = tables.map((table, index) =>
    worksheetToTable(sheetNames[index], readTableRows(table)),
  );

  return { sheetNames, sheets, warnings };
}

function readTableRows(table: Element): string[][] {
  const rowEls = Array.from(table.getElementsByTagName("table:table-row"));
  const rows: string[][] = [];

  for (const rowEl of rowEls) {
    const repeat = repeatCount(rowEl.getAttribute("table:number-rows-repeated"));
    const cells = readRowCells(rowEl);
    for (let copy = 0; copy < repeat && rows.length <= MAX_ROWS; copy += 1) {
      rows.push(cells.slice());
    }
    if (rows.length > MAX_ROWS) break;
  }

  return trimTrailingEmptyRows(rows);
}

function readRowCells(rowEl: Element): string[] {
  const cells: string[] = [];

  for (const node of childElements(rowEl)) {
    if (
      node.tagName !== "table:table-cell" &&
      node.tagName !== "table:covered-table-cell"
    ) {
      continue;
    }
    const repeat = repeatCount(node.getAttribute("table:number-columns-repeated"));
    const text = cellText(node);
    for (let copy = 0; copy < repeat && cells.length < MAX_COLUMNS; copy += 1) {
      cells.push(text);
    }
    if (cells.length >= MAX_COLUMNS) break;
  }

  return trimTrailingEmptyCells(cells);
}

function cellText(cellEl: Element): string {
  const paragraphs = Array.from(cellEl.getElementsByTagName("text:p"));
  if (paragraphs.length === 0) return "";
  return paragraphs.map((paragraph) => paragraph.textContent ?? "").join("\n");
}

function childElements(parent: Element): Element[] {
  const result: Element[] = [];
  const nodes = parent.childNodes;
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.nodeType === 1) result.push(node as Element);
  }
  return result;
}

function repeatCount(value: string | null): number {
  if (!value) return 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

function trimTrailingEmptyCells(cells: string[]): string[] {
  let end = cells.length;
  while (end > 0 && cells[end - 1] === "") end -= 1;
  return cells.slice(0, end);
}

function trimTrailingEmptyRows(rows: string[][]): string[][] {
  let end = rows.length;
  while (end > 0 && rows[end - 1].every((cell) => cell === "")) end -= 1;
  return rows.slice(0, end);
}
