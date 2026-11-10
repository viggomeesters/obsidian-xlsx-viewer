import { Unzip, UnzipInflate, unzipSync } from "fflate";
import { ParsedWorkbook, worksheetToTable } from "./parser";

const ODS_MIMETYPE = "application/vnd.oasis.opendocument.spreadsheet";
const OFFICE = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
const TABLE = "urn:oasis:names:tc:opendocument:xmlns:table:1.0";
const TEXT = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_XML_BYTES = 8 * 1024 * 1024;
const ARCHIVE_CHUNK_BYTES = 1024;
const MAX_ARCHIVE_ENTRIES = 4096;
const MAX_COLUMNS = 1024;
const MAX_ROWS = 20000;
const MAX_SHEETS = 100;
const MAX_WORKBOOK_CELLS = 250000;
const MAX_WORKBOOK_TEXT = 8 * 1024 * 1024;

export function readOdsContent(data: ArrayBuffer): string {
  if (data.byteLength > MAX_ARCHIVE_BYTES) throw new Error("ODS archive exceeds the 32 MiB limit.");
  const bytes = new Uint8Array(data);
  const expectedEntries = archiveEntryCount(bytes);

  const entries = new Map<string, string[]>();
  const completed = new Set<string>();
  let seen = 0;
  const archive = new Unzip((file) => {
    if (++seen > expectedEntries) throw new Error("Invalid ODS archive entry count.");
    const { name } = file;
    if (name !== "mimetype" && name !== "content.xml") return;
    if (entries.has(name)) throw new Error(`Duplicate ODS entry: ${name}.`);

    const limit = name === "mimetype" ? 256 : MAX_XML_BYTES;
    if (file.originalSize !== undefined && file.originalSize > limit) {
      throw new Error(`ODS entry exceeds the size limit: ${name}.`);
    }

    const parts: string[] = [];
    entries.set(name, parts);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let decodedBytes = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw new Error(`Unable to read ODS entry: ${name}.`, { cause: error });
      decodedBytes += chunk.length;
      if (decodedBytes > limit) throw new Error(`ODS entry exceeds the size limit: ${name}.`);
      parts.push(decoder.decode(chunk, { stream: !final }));
      if (!final) return;

      completed.add(name);
      if (name === "mimetype" && parts.join("").trim() !== ODS_MIMETYPE) {
        throw new Error("File is not a valid .ods spreadsheet.");
      }
    };
    file.start();
  });
  archive.register(UnzipInflate);
  // Small input chunks bound the decoder's output allocation before ondata
  // can enforce the total size, even if the ZIP header understates that size.
  for (let start = 0; start < bytes.length; start += ARCHIVE_CHUNK_BYTES) {
    const end = Math.min(start + ARCHIVE_CHUNK_BYTES, bytes.length);
    archive.push(bytes.subarray(start, end), end === bytes.length);
  }
  if (seen !== expectedEntries || !completed.has("content.xml") || completed.size !== entries.size) {
    throw new Error("File is not a valid .ods spreadsheet.");
  }
  return entries.get("content.xml")!.join("");
}

function archiveEntryCount(bytes: Uint8Array): number {
  let count = 0;
  try {
    unzipSync(bytes, {
      filter: () => {
        if (++count > MAX_ARCHIVE_ENTRIES) throw new Error("ODS archive exceeds the 4096 entry limit.");
        return false;
      },
    });
  } catch (error) {
    if (count > MAX_ARCHIVE_ENTRIES) throw error;
    throw new Error("File is not a valid .ods archive.", { cause: error });
  }
  return count;
}

export function parseOds(contentXml: string): ParsedWorkbook {
  if (contentXml.includes("<!DOCTYPE")) throw new Error("ODS content.xml must not contain a document type.");
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(contentXml, "application/xml");
  } catch (error) {
    throw new Error("ODS content.xml is not valid XML.", { cause: error });
  }
  const parserErrors = Array.from(doc.getElementsByTagNameNS("*", "parsererror"));
  if (parserErrors.some((node) => node.namespaceURI === "http://www.w3.org/1999/xhtml"
    || node.namespaceURI === "http://www.mozilla.org/newlayout/xml/parsererror.xml")) {
    throw new Error("ODS content.xml is not valid XML.");
  }

  const root = doc.documentElement;
  const body = root && isElement(root, OFFICE, "document-content")
    ? childElements(root).find((node) => isElement(node, OFFICE, "body"))
    : undefined;
  const spreadsheet = body && childElements(body).find((node) => isElement(node, OFFICE, "spreadsheet"));
  if (!spreadsheet) throw new Error("File is not a valid .ods spreadsheet.");

  const tables = childElements(spreadsheet).filter((node) => isElement(node, TABLE, "table"));
  const warnings: string[] = [];
  if (tables.length === 0) warnings.push("Workbook has no sheets.");
  if (tables.length > MAX_SHEETS) warnings.push("Only the first 100 sheets are shown.");

  let remainingCells = MAX_WORKBOOK_CELLS;
  let remainingText = MAX_WORKBOOK_TEXT;
  const sheets = tables.slice(0, MAX_SHEETS).map((table, index) => {
    const name = table.getAttributeNS(TABLE, "name") || `Sheet${index + 1}`;
    const { rows, truncated, textLength } = readTableRows(table, remainingCells, remainingText);
    const sheet = worksheetToTable(name, rows);
    remainingCells -= rows.length * Math.max(1, sheet.columnCount);
    remainingText -= textLength;
    if (truncated) sheet.warnings.unshift("Sheet truncated at the ODS preview limits.");
    return sheet;
  });

  return { sheetNames: sheets.map((sheet) => sheet.name), sheets, warnings };
}

function readTableRows(table: Element, cellBudget: number, textBudget: number): {
  rows: string[][];
  truncated: boolean;
  textLength: number;
} {
  const rows: string[][] = [];
  let pendingEmptyRows = 0;
  let width = 1;
  let truncated = false;
  let textLength = 0;

  for (const row of sheetRows(table)) {
    const repeat = repeatCount(row.getAttributeNS(TABLE, "number-rows-repeated"));
    const { cells, truncated: columnsTruncated } = readRowCells(row);
    truncated ||= columnsTruncated;
    if (cells.length === 0) {
      pendingEmptyRows = Math.min(MAX_ROWS, pendingEmptyRows + repeat);
      continue;
    }

    const nextWidth = Math.max(width, cells.length);
    const limit = Math.min(MAX_ROWS, Math.floor(cellBudget / nextWidth));
    const rowTextLength = cells.reduce((sum, cell) => sum + cell.length, 0);
    const available = Math.min(
      limit - rows.length - pendingEmptyRows,
      Math.floor((textBudget - textLength) / rowTextLength),
    );
    if (available <= 0) return { rows, truncated: true, textLength };
    for (let index = 0; index < pendingEmptyRows; index += 1) rows.push([]);
    pendingEmptyRows = 0;
    const visibleRepeats = Math.min(repeat, available);
    for (let copy = 0; copy < visibleRepeats; copy += 1) rows.push(cells);
    textLength += visibleRepeats * rowTextLength;
    if (repeat > available) return { rows, truncated: true, textLength };
    width = nextWidth;
  }
  return { rows, truncated, textLength };
}

function* sheetRows(table: Element): Generator<Element> {
  const pending = childElements(table).reverse();
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.namespaceURI !== TABLE) continue;
    if (node.localName === "table-row") yield node;
    if (["table-header-rows", "table-row-group", "table-rows"].includes(node.localName)) {
      const children = childElements(node);
      for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
    }
  }
}

function readRowCells(row: Element): { cells: string[]; truncated: boolean } {
  const cells: string[] = [];
  let pendingEmptyCells = 0;

  for (const node of childElements(row)) {
    if (node.namespaceURI !== TABLE || !["table-cell", "covered-table-cell"].includes(node.localName)) continue;
    const repeat = repeatCount(node.getAttributeNS(TABLE, "number-columns-repeated"));
    const text = cellText(node);
    if (!text) {
      pendingEmptyCells = Math.min(MAX_COLUMNS, pendingEmptyCells + repeat);
      continue;
    }

    const available = MAX_COLUMNS - cells.length - pendingEmptyCells;
    if (available <= 0) return { cells, truncated: true };
    for (let index = 0; index < pendingEmptyCells; index += 1) cells.push("");
    pendingEmptyCells = 0;
    for (let copy = 0; copy < Math.min(repeat, available); copy += 1) cells.push(text);
    if (repeat > available) return { cells, truncated: true };
  }

  return { cells, truncated: false };
}

function cellText(cell: Element): string {
  // Read direct paragraphs so cell annotations and nested tables stay separate.
  return childElements(cell)
    .filter((node) => node.namespaceURI === TEXT && (node.localName === "p" || node.localName === "h"))
    .map((paragraph) => paragraph.textContent ?? "")
    .join("\n");
}

function childElements(parent: Element): Element[] {
  const result: Element[] = [];
  for (let node = parent.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) result.push(node as Element);
  }
  return result;
}

function isElement(element: Element, namespace: string, name: string): boolean {
  return element.namespaceURI === namespace && element.localName === name;
}

function repeatCount(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
