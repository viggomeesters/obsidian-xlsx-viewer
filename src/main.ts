import {
  FileView,
  Notice,
  Plugin,
  TFile,
  WorkspaceLeaf,
  setIcon,
} from "obsidian";
import { ParsedWorkbook, WorksheetTable, columnLabel, parseWorkbook } from "./parser";

const VIEW_TYPE_XLSX_VIEWER = "xlsx-viewer";
const XLSX_EXTENSIONS = ["xlsx"];

export default class XlsxViewerPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(
      VIEW_TYPE_XLSX_VIEWER,
      (leaf) => new XlsxViewerView(leaf),
    );
    this.registerExtensions(XLSX_EXTENSIONS, VIEW_TYPE_XLSX_VIEWER);

    this.addCommand({
      id: "open-current-xlsx-in-viewer",
      name: "Open current XLSX file in viewer",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!isXlsxFile(file)) return false;

        if (!checking) {
          void this.openXlsxFile(file);
        }
        return true;
      },
    });
  }

  async openXlsxFile(file: TFile): Promise<void> {
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState({
      type: VIEW_TYPE_XLSX_VIEWER,
      state: { file: file.path },
      active: true,
    });
  }
}

class XlsxViewerView extends FileView {
  private workbook: ParsedWorkbook | null = null;
  private activeSheet = "";
  private filterValue = "";
  private errorMessage = "";

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_XLSX_VIEWER;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "XLSX viewer";
  }

  getIcon(): string {
    return "table-2";
  }

  async onLoadFile(file: TFile): Promise<void> {
    await this.loadWorkbook(file);
  }

  async onUnloadFile(): Promise<void> {
    this.workbook = null;
    this.activeSheet = "";
    this.errorMessage = "";
    this.contentEl.empty();
  }

  private async loadWorkbook(file: TFile): Promise<void> {
    try {
      const data = await this.app.vault.readBinary(file);
      this.workbook = await parseWorkbook(data);
      this.activeSheet = this.workbook.sheetNames[0] ?? "";
      this.errorMessage = "";
    } catch (error) {
      this.workbook = null;
      this.activeSheet = "";
      this.errorMessage = `Unable to read workbook: ${getErrorMessage(error)}`;
    }
    this.render();
  }

  private render(): void {
    const container = this.contentEl;
    container.empty();
    container.addClass("xlsx-viewer");

    const header = container.createDiv({ cls: "xlsx-viewer__header" });
    this.renderTitle(header);
    this.renderToolbar(header);

    if (!this.file) {
      renderMessage(container, "No XLSX file is attached to this viewer.");
      return;
    }

    if (!isXlsxFile(this.file)) {
      renderMessage(container, "This viewer only supports .xlsx files.");
      return;
    }

    if (this.errorMessage) {
      renderMessage(container, this.errorMessage);
      return;
    }

    if (!this.workbook) {
      renderMessage(container, "Workbook is not loaded.");
      return;
    }

    renderWorkbookWarnings(container, this.workbook.warnings);
    this.renderTabs(container, this.workbook);

    const sheet = this.activeWorksheet(this.workbook);
    if (!sheet) {
      renderMessage(container, "No active sheet.");
      return;
    }

    renderSummary(container, this.workbook, sheet);
    renderSheetWarnings(container, sheet);
    renderTable(container, sheet, this.filterValue);
  }

  private renderTitle(parent: HTMLElement): void {
    const title = parent.createDiv({ cls: "xlsx-viewer__title" });
    title.createDiv({
      cls: "xlsx-viewer__filename",
      text: this.file?.name ?? "XLSX file",
    });
    title.createDiv({
      cls: "xlsx-viewer__path",
      text: this.file?.path ?? "",
    });
  }

  private renderToolbar(parent: HTMLElement): void {
    const toolbar = parent.createDiv({ cls: "xlsx-viewer__toolbar" });

    const searchWrap = toolbar.createDiv({ cls: "xlsx-viewer__search" });
    setIcon(searchWrap.createSpan({ cls: "xlsx-viewer__search-icon" }), "search");
    const searchInput = searchWrap.createEl("input", {
      attr: {
        "aria-label": "Filter rows",
        placeholder: "Filter",
        spellcheck: "false",
        type: "search",
        value: this.filterValue,
      },
    });
    searchInput.addEventListener("input", () => {
      this.filterValue = searchInput.value;
      this.render();
    });

    const refreshButton = createIconButton(toolbar, "refresh-cw", "Refresh workbook");
    refreshButton.addEventListener("click", () => {
      void this.reloadFile();
    });
  }

  private renderTabs(parent: HTMLElement, workbook: ParsedWorkbook): void {
    const tabs = parent.createDiv({ cls: "xlsx-viewer__tabs" });

    if (workbook.sheetNames.length === 0) {
      tabs.createDiv({ cls: "xlsx-viewer__tab-empty", text: "No sheets" });
      return;
    }

    workbook.sheetNames.forEach((sheetName) => {
      const button = tabs.createEl("button", {
        cls: "xlsx-viewer__tab",
        text: sheetName,
        attr: { type: "button" },
      });
      button.toggleClass("is-active", sheetName === this.activeSheet);
      button.addEventListener("click", () => {
        this.activeSheet = sheetName;
        this.filterValue = "";
        this.render();
      });
    });
  }

  private activeWorksheet(workbook: ParsedWorkbook): WorksheetTable | undefined {
    return workbook.sheets.find((sheet) => sheet.name === this.activeSheet) ?? workbook.sheets[0];
  }

  private async reloadFile(): Promise<void> {
    if (!this.file) {
      new Notice("No XLSX file to refresh");
      return;
    }
    await this.loadWorkbook(this.file);
  }
}

function renderWorkbookWarnings(parent: HTMLElement, warnings: string[]): void {
  renderWarnings(parent, warnings, "Workbook warnings");
}

function renderSheetWarnings(parent: HTMLElement, sheet: WorksheetTable): void {
  renderWarnings(parent, sheet.warnings, "Sheet warnings");
}

function renderWarnings(parent: HTMLElement, warnings: string[], title: string): void {
  if (warnings.length === 0) return;
  const box = parent.createDiv({ cls: "xlsx-viewer__warnings" });
  box.createDiv({ cls: "xlsx-viewer__warnings-title", text: title });
  warnings.slice(0, 8).forEach((warning) => {
    box.createDiv({ cls: "xlsx-viewer__warning", text: warning });
  });
  if (warnings.length > 8) {
    box.createDiv({
      cls: "xlsx-viewer__warning-more",
      text: `${warnings.length - 8} additional warnings hidden`,
    });
  }
}

function renderSummary(parent: HTMLElement, workbook: ParsedWorkbook, sheet: WorksheetTable): void {
  const summary = parent.createDiv({ cls: "xlsx-viewer__summary" });
  summary.createSpan({
    cls: "xlsx-viewer__pill",
    text: `${workbook.sheetNames.length} sheets`,
  });
  summary.createSpan({
    cls: "xlsx-viewer__pill",
    text: sheet.name,
  });
  summary.createSpan({
    cls: "xlsx-viewer__pill",
    text: `${sheet.rowCount} rows`,
  });
  summary.createSpan({
    cls: "xlsx-viewer__pill",
    text: `${sheet.columnCount} columns`,
  });
  if (sheet.skippedRows > 0) {
    summary.createSpan({
      cls: "xlsx-viewer__note",
      text: `${sheet.renderedRows.length} rows rendered`,
    });
  }
}

function renderTable(parent: HTMLElement, sheet: WorksheetTable, query: string): void {
  if (sheet.renderedRows.length === 0) {
    renderMessage(parent, "This sheet is empty.");
    return;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const rows = sheet.renderedRows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(({ row }) => !normalizedQuery || row.join(" ").toLowerCase().includes(normalizedQuery));

  if (rows.length === 0) {
    renderMessage(parent, "No rows match the current filter.");
    return;
  }

  const wrap = parent.createDiv({ cls: "xlsx-viewer__table-wrap" });
  const table = wrap.createEl("table", { cls: "xlsx-viewer__table" });
  const head = table.createEl("thead");
  const headRow = head.createEl("tr");
  headRow.createEl("th", { cls: "xlsx-viewer__row-number", text: "#" });
  for (let column = 0; column < sheet.columnCount; column += 1) {
    headRow.createEl("th", { text: columnLabel(column) });
  }

  const body = table.createEl("tbody");
  rows.forEach(({ row, rowNumber }) => {
    const tr = body.createEl("tr");
    tr.createEl("th", {
      cls: "xlsx-viewer__row-number",
      text: String(rowNumber),
    });
    for (let column = 0; column < sheet.columnCount; column += 1) {
      tr.createEl("td", { text: row[column] ?? "" });
    }
  });
}

function createIconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "clickable-icon xlsx-viewer__button",
    attr: { "aria-label": label, title: label, type: "button" },
  });
  setIcon(button, icon);
  return button;
}

function renderMessage(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "xlsx-viewer__message", text: message });
}

function isXlsxFile(file: TFile | null): file is TFile {
  return Boolean(file && XLSX_EXTENSIONS.includes(file.extension.toLowerCase()));
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
