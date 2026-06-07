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
  outfile: ".tmp-parser-test.mjs",
  platform: "node",
  target: "node20",
});

const { columnLabel, parseWorkbook } = await import(new URL("../.tmp-parser-test.mjs", import.meta.url));

function workbookBuffer(sheets) {
  const files = {
    "[Content_Types].xml": xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
        ${sheets
          .map(
            (_, index) =>
              `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("")}
      </Types>`),
    "_rels/.rels": xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
      </Relationships>`),
    "xl/workbook.xml": xml(`<?xml version="1.0" encoding="UTF-8"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
        xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>
          ${sheets
            .map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
            .join("")}
        </sheets>
      </workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        ${sheets
          .map(
            (_, index) =>
              `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
          )
          .join("")}
        <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
      </Relationships>`),
    "xl/styles.xml": xml(`<?xml version="1.0" encoding="UTF-8"?>
      <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <cellXfs count="2">
          <xf numFmtId="0"/>
          <xf numFmtId="14" applyNumberFormat="1"/>
        </cellXfs>
      </styleSheet>`),
  };

  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = xml(`<?xml version="1.0" encoding="UTF-8"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        ${sheet.rows.length > 0 ? `<dimension ref="A1:${columnAddress(sheet.rows.length, maxColumns(sheet.rows))}"/>` : ""}
        <sheetData>
          ${sheet.rows.map((row, rowIndex) => rowXml(row, rowIndex + 1)).join("")}
        </sheetData>
      </worksheet>`);
  });

  return zipSync(files).buffer;
}

function xml(value) {
  return strToU8(value.replace(/>\s+</g, "><").trim());
}

function rowXml(row, rowNumber) {
  return `<row r="${rowNumber}">${row.map((cell, columnIndex) => cellXml(cell, rowNumber, columnIndex + 1)).join("")}</row>`;
}

function cellXml(cell, rowNumber, columnNumber) {
  const address = `${columnName(columnNumber)}${rowNumber}`;
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return `<c r="${address}"><v>${cell}</v></c>`;
  if (typeof cell === "boolean") return `<c r="${address}" t="b"><v>${cell ? 1 : 0}</v></c>`;
  if (cell.type === "date") return `<c r="${address}" s="1"><v>${dateSerial(cell.value)}</v></c>`;
  if (cell.type === "formula") return `<c r="${address}"><f>${escapeXml(cell.formula)}</f><v>${cell.result}</v></c>`;
  return `<c r="${address}" t="inlineStr"><is><t>${escapeXml(String(cell))}</t></is></c>`;
}

function columnName(columnNumber) {
  let current = columnNumber;
  let name = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function columnAddress(rowCount, columnCount) {
  return `${columnName(columnCount)}${rowCount}`;
}

function maxColumns(rows) {
  return rows.reduce((max, row) => Math.max(max, row.length), 1);
}

function dateSerial(dateString) {
  const excelEpoch = Date.UTC(1899, 11, 30);
  const date = Date.parse(`${dateString}T00:00:00Z`);
  return Math.round((date - excelEpoch) / 86400000);
}

function escapeXml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const basic = await parseWorkbook(
  workbookBuffer([
    {
      name: "Values",
      rows: [
        ["name", "count", "active", "date"],
        ["alpha", 42, true, { type: "date", value: "2026-06-07" }],
      ],
    },
  ]),
);
assert.deepEqual(basic.sheetNames, ["Values"]);
assert.equal(basic.sheets[0].rowCount, 2);
assert.equal(basic.sheets[0].columnCount, 4);
assert.equal(basic.sheets[0].renderedRows[1][0], "alpha");
assert.equal(basic.sheets[0].renderedRows[1][1], "42");
assert.equal(basic.sheets[0].renderedRows[1][2], "true");
assert.equal(basic.sheets[0].renderedRows[1][3], "2026-06-07");

const multi = await parseWorkbook(
  workbookBuffer([
    { name: "First", rows: [["a"]] },
    { name: "Second", rows: [["b", "c"]] },
  ]),
);
assert.deepEqual(multi.sheetNames, ["First", "Second"]);
assert.equal(multi.sheets[1].columnCount, 2);

const empty = await parseWorkbook(workbookBuffer([{ name: "Empty", rows: [] }]));
assert.equal(empty.sheets[0].rowCount, 0);
assert.ok(empty.sheets[0].warnings.some((warning) => warning.includes("empty")));

const formula = await parseWorkbook(
  workbookBuffer([
    {
      name: "Formula",
      rows: [
        ["base", "double"],
        [2, { type: "formula", formula: "A2*2", result: 4 }],
      ],
    },
  ]),
);
assert.equal(formula.sheets[0].renderedRows[1][1], "4");

const largeRows = Array.from({ length: 10005 }, (_, index) => [`row-${index + 1}`, index + 1]);
const large = await parseWorkbook(workbookBuffer([{ name: "Large", rows: largeRows }]));
assert.equal(large.sheets[0].renderedRows.length, 10000);
assert.equal(large.sheets[0].skippedRows, 5);
assert.ok(large.sheets[0].warnings.some((warning) => warning.includes("not rendered")));

assert.equal(columnLabel(0), "A");
assert.equal(columnLabel(25), "Z");
assert.equal(columnLabel(26), "AA");
assert.equal(columnLabel(701), "ZZ");

await assert.rejects(async () => {
  await parseWorkbook(new TextEncoder().encode("not an xlsx workbook").buffer);
});

fs.rmSync(new URL("../.tmp-parser-test.mjs", import.meta.url));
console.log("XLSX parser fixture tests passed.");
