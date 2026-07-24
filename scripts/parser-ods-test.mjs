import assert from "node:assert/strict";
import fs from "node:fs";
import { DOMParser } from "@xmldom/xmldom";
import esbuild from "esbuild";
import { strToU8, zipSync } from "fflate";

globalThis.DOMParser = DOMParser;

await esbuild.build({
  bundle: true,
  entryPoints: ["src/parser.ts"],
  format: "esm",
  outfile: ".tmp-parser-ods-test.mjs",
  platform: "node",
  target: "node20",
});

const { parseWorkbook } = await import(new URL("../.tmp-parser-ods-test.mjs", import.meta.url));

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
].join(" ");

function odsBuffer(sheets, { includeContent = true, includeMimetype = true } = {}) {
  const files = {};
  if (includeMimetype) {
    files["mimetype"] = strToU8("application/vnd.oasis.opendocument.spreadsheet");
  }
  if (includeContent) files["content.xml"] = strToU8(contentXml(sheets));
  return zipSync(files).buffer;
}

function contentXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS}>
  <office:body>
    <office:spreadsheet>
      ${sheets.map(sheetXml).join("")}
    </office:spreadsheet>
  </office:body>
</office:document-content>`;
}

function sheetXml(sheet) {
  return `<table:table table:name="${escapeXml(sheet.name)}">${(sheet.rows || []).map(rowXml).join("")}</table:table>`;
}

function rowXml(row) {
  if (row && row.rowRepeat) {
    return `<table:table-row table:number-rows-repeated="${row.rowRepeat}">${(row.cells || []).map(cellXml).join("")}</table:table-row>`;
  }
  return `<table:table-row>${(row || []).map(cellXml).join("")}</table:table-row>`;
}

function cellXml(cell) {
  if (cell === null || cell === undefined || cell === "") return `<table:table-cell/>`;
  if (typeof cell === "object") {
    const repeat = cell.colRepeat ? ` table:number-columns-repeated="${cell.colRepeat}"` : "";
    const formula = cell.formula ? ` table:formula="${escapeXml(cell.formula)}"` : "";
    if (cell.text === undefined || cell.text === "") return `<table:table-cell${repeat}${formula}/>`;
    return `<table:table-cell${repeat}${formula}><text:p>${escapeXml(String(cell.text))}</text:p></table:table-cell>`;
  }
  return `<table:table-cell><text:p>${escapeXml(String(cell))}</text:p></table:table-cell>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// --- one-sheet workbook, value display text, and cached formula result ---
const basic = await parseWorkbook(
  odsBuffer([
    {
      name: "Values",
      rows: [
        ["name", "count", "active", "date"],
        ["alpha", "42", "TRUE", "2026-06-07"],
        ["beta", "50%", "", { text: "4", formula: "of:=[.B2]+[.B3]" }],
      ],
    },
  ]),
);
assert.deepEqual(basic.sheetNames, ["Values"]);
assert.equal(basic.sheets[0].rowCount, 3);
assert.equal(basic.sheets[0].columnCount, 4);
assert.equal(basic.sheets[0].renderedRows[1][0], "alpha");
assert.equal(basic.sheets[0].renderedRows[1][1], "42");
assert.equal(basic.sheets[0].renderedRows[1][2], "TRUE");
assert.equal(basic.sheets[0].renderedRows[1][3], "2026-06-07");
assert.equal(basic.sheets[0].renderedRows[2][1], "50%");
assert.equal(basic.sheets[0].renderedRows[2][3], "4"); // cached formula result

// --- multi-sheet workbook ---
const multi = await parseWorkbook(
  odsBuffer([
    { name: "First", rows: [["a"]] },
    { name: "Second", rows: [["b", "c"]] },
  ]),
);
assert.deepEqual(multi.sheetNames, ["First", "Second"]);
assert.equal(multi.sheets[1].columnCount, 2);

// --- empty sheet ---
const empty = await parseWorkbook(odsBuffer([{ name: "Empty", rows: [] }]));
assert.equal(empty.sheets[0].rowCount, 0);
assert.ok(empty.sheets[0].warnings.some((warning) => warning.includes("empty")));

// --- number-columns-repeated expansion ---
const colRepeat = await parseWorkbook(
  odsBuffer([{ name: "Cols", rows: [[{ text: "x", colRepeat: 3 }, "y"]] }]),
);
assert.deepEqual(colRepeat.sheets[0].renderedRows[0], ["x", "x", "x", "y"]);
assert.equal(colRepeat.sheets[0].columnCount, 4);

// --- trailing empty repeated columns are trimmed (repeat trap) ---
const trailingCols = await parseWorkbook(
  odsBuffer([{ name: "TrailCols", rows: [["a", "b", { text: "", colRepeat: 1000 }]] }]),
);
assert.deepEqual(trailingCols.sheets[0].renderedRows[0], ["a", "b"]);
assert.equal(trailingCols.sheets[0].columnCount, 2);

// --- number-rows-repeated expansion ---
const rowRepeat = await parseWorkbook(
  odsBuffer([
    {
      name: "Rows",
      rows: [{ rowRepeat: 3, cells: ["dup"] }, ["last"]],
    },
  ]),
);
assert.equal(rowRepeat.sheets[0].rowCount, 4);
assert.equal(rowRepeat.sheets[0].renderedRows[0][0], "dup");
assert.equal(rowRepeat.sheets[0].renderedRows[2][0], "dup");
assert.equal(rowRepeat.sheets[0].renderedRows[3][0], "last");

// --- trailing empty repeated rows are trimmed (repeat trap) ---
const trailingRows = await parseWorkbook(
  odsBuffer([
    { name: "TrailRows", rows: [["only"], { rowRepeat: 100000, cells: [] }] },
  ]),
);
assert.equal(trailingRows.sheets[0].rowCount, 1);

// --- render cap ---
const bigRows = Array.from({ length: 10005 }, (_, index) => [`row-${index + 1}`]);
const large = await parseWorkbook(odsBuffer([{ name: "Large", rows: bigRows }]));
assert.equal(large.sheets[0].renderedRows.length, 10000);
assert.equal(large.sheets[0].skippedRows, 5);
assert.ok(large.sheets[0].warnings.some((warning) => warning.includes("not rendered")));

// --- detection without an explicit mimetype entry ---
const noMime = await parseWorkbook(
  odsBuffer([{ name: "S", rows: [["v"]] }], { includeMimetype: false }),
);
assert.equal(noMime.sheets[0].renderedRows[0][0], "v");

// --- malformed: ODS archive missing content.xml ---
await assert.rejects(
  async () => parseWorkbook(odsBuffer([], { includeContent: false })),
  /not a valid \.ods/,
);

// --- malformed: not a zip at all ---
await assert.rejects(async () =>
  parseWorkbook(new TextEncoder().encode("not a spreadsheet").buffer),
);

// --- a different ODF package (e.g. .odt) is NOT routed to the ODS parser ---
const odtBuffer = zipSync({
  mimetype: strToU8("application/vnd.oasis.opendocument.text"),
  "content.xml": strToU8(
    `<?xml version="1.0"?><office:document-content ${NS}><office:body><office:text><text:p>hi</text:p></office:text></office:body></office:document-content>`,
  ),
}).buffer;
await assert.rejects(async () => parseWorkbook(odtBuffer));

fs.rmSync(new URL("../.tmp-parser-ods-test.mjs", import.meta.url));
console.log("ODS parser fixture tests passed.");
