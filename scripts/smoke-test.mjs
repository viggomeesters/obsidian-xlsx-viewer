import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const main = fs.readFileSync("src/main.ts", "utf8");
const parser = fs.readFileSync("src/parser.ts", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

const assertions = [
  [manifest.id === "xlsx-viewer", "manifest id is xlsx-viewer"],
  [manifest.version === "0.1.0", "manifest version is 0.1.0"],
  [!/obsidian/i.test(manifest.description), "manifest description avoids product name"],
  [main.includes("registerExtensions(XLSX_EXTENSIONS"), "xlsx extension is registered"],
  [main.includes("extends FileView"), "binary FileView is used"],
  [main.includes("this.app.vault.readBinary(file)"), "vault binary reader is used"],
  [main.includes("renderTable(container, sheet, this.filterValue)"), "table view code path exists"],
  [parser.includes("RENDER_ROW_LIMIT = 10000"), "render cap exists"],
  [parser.includes("readSheetNames") && parser.includes("readXlsxFile"), "read-excel-file workbook parser is used"],
  [!main.includes("navigator.clipboard") && !parser.includes("navigator.clipboard"), "no clipboard access"],
  [!main.includes("fetch(") && !parser.includes("fetch("), "no fetch usage"],
  [!main.includes("writeBinary") && !main.includes("writeFile") && !parser.includes("writeFile"), "no workbook writeback"],
  [!styles.includes("!important"), "styles do not use important overrides"],
];

const failures = assertions.filter(([passes]) => !passes).map(([, label]) => label);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log("XLSX Viewer smoke checks passed.");
