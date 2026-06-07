# Contributing

Thanks for helping improve XLSX Viewer.

## Local setup

```bash
npm install
npm run build
npx tsc --noEmit
npm test
```

For manual testing, copy the built runtime files into `.obsidian/plugins/xlsx-viewer/` in a test vault, reload the app, and open `.xlsx` files.

## Pull requests

- Keep the plugin read-only.
- Do not add network APIs in runtime plugin code.
- Do not add clipboard access without explicit user action and documentation.
- Preserve parser coverage for one-sheet workbooks, multi-sheet workbooks, empty sheets, basic value types, cached formula values, malformed input, and the render cap.
- Run build, typecheck, and tests before opening a PR.

## Release assets

Community releases must include:

- `main.js`
- `manifest.json`
- `styles.css`
