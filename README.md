<p align="center">
  <img src="assets/hero.svg" alt="XLSX Viewer" width="100%">
</p>

<p align="center">
  <a href="https://github.com/viggomeesters/obsidian-xlsx-viewer/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/viggomeesters/obsidian-xlsx-viewer?style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-green?style=flat-square"></a>
  <img alt="Minimum app version 1.5.0+" src="https://img.shields.io/badge/minimum-1.5.0%2B-7c3aed?style=flat-square">
  <img alt="Read-only" src="https://img.shields.io/badge/mode-read--only-0f766e?style=flat-square">
</p>

# XLSX Viewer

XLSX Viewer is a read-only plugin for opening `.xlsx` files as workbook tables without launching Excel. It is built for quick inspection of AI-generated spreadsheets, exports, and reference files inside a vault.

![XLSX Viewer preview](assets/screenshot.svg)

## Features

- Opens `.xlsx` files in a dedicated view.
- Shows one sheet at a time with sheet tabs.
- Displays cell values only.
- Shows cached/formatted formula values when they are present in the workbook.
- Does not evaluate formulas.
- Filters visible rows by searching across cells.
- Shows sticky column letters and row numbers.
- Displays workbook sheet count, active sheet, row count, column count, and render-cap status.
- Handles empty sheets and malformed workbook input with plain error states.
- Renders the first 10,000 rows to keep the view responsive.
- Stays read-only by design: it never writes back to workbook files.

## Scope

This is intentionally a v0.1 viewer, not a spreadsheet editor. It does not support editing, formatting, charts, merged-cell layout, formulas, pivot tables, comments, macros, or workbook protection. The goal is simple: open the file, show the values, and avoid leaving the vault for a quick look.

## Large files

Spreadsheet files can become large quickly. XLSX Viewer parses the workbook and renders the first 10,000 rows of the active sheet. Additional rows are counted and reported in the warning area.

## Privacy and security

XLSX Viewer does not make network requests and does not send vault content to external services. It does not use the system clipboard. It reads files through the vault API and renders a local view.

## Installation

### Community plugin directory

XLSX Viewer is ready for submission to the Obsidian Community plugin directory. Once accepted, it can be installed from **Settings -> Community plugins -> Browse** inside Obsidian.

### Manual installation

Until the community directory submission is accepted:

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/viggomeesters/obsidian-xlsx-viewer/releases/latest).
2. Create this folder in your vault: `.obsidian/plugins/xlsx-viewer/`.
3. Put the downloaded files in that folder.
4. Reload Obsidian.
5. Enable **XLSX Viewer** in **Settings -> Community plugins**.

### BRAT installation

For beta testing, install the plugin with [BRAT](https://github.com/TfTHacker/obsidian42-brat) using this repository URL:

```text
https://github.com/viggomeesters/obsidian-xlsx-viewer
```

## Usage

Open any `.xlsx` file in your vault. The file opens with XLSX Viewer.

Use the toolbar to:

- filter visible rows
- switch sheets
- refresh the file after external changes

## Development

```bash
npm install
npm run build
npx tsc --noEmit
npm test
```

For local development, copy or symlink this repository into `.obsidian/plugins/xlsx-viewer/` inside a test vault.

## Release process

Obsidian installs community plugin files from GitHub releases. For each release:

1. Update `manifest.json`, `package.json`, and `versions.json`.
2. Run `npm install`, `npm run build`, `npx tsc --noEmit`, and `npm test`.
3. Create a GitHub release whose tag exactly matches `manifest.json.version`.
4. Attach `main.js`, `manifest.json`, and `styles.css` as release assets.

The repository includes a GitHub Actions release workflow with artifact attestation support. If GitHub Actions is disabled for the owner account, manual releases are still usable for Obsidian, but the Community automated review may show a recommendation about missing artifact attestations.

## Community directory submission

The repository is prepared for Obsidian Community plugin submission. The remaining submission step must be completed by the repository owner in the Obsidian Community site because it requires signing in, linking GitHub, and confirming the developer policies/support commitment.

Submit this repository URL:

```text
https://github.com/viggomeesters/obsidian-xlsx-viewer
```

Steps:

1. Sign in to [community.obsidian.md](https://community.obsidian.md).
2. Link the GitHub account that owns this repository.
3. Open **Plugins -> New plugin**.
4. Enter the repository URL above.
5. Confirm the developer policies and submit.
6. Address any automated review feedback.

The current release is ready for review:

- root `README.md`, `LICENSE`, and `manifest.json` exist
- `manifest.json.version` is `0.1.0`
- GitHub release `0.1.0` exists
- release assets include `main.js`, `manifest.json`, and `styles.css`
- `versions.json` maps supported Obsidian versions

Official references:

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Obsidian releases repository](https://github.com/obsidianmd/obsidian-releases)

## Parser dependency

XLSX Viewer uses [read-excel-file](https://gitlab.com/catamphetamine/read-excel-file) to read workbook data. The dependency is bundled into `main.js` at build time.

## License

[MIT](LICENSE)
