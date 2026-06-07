# Community Submission Checklist

Current release target: `0.1.0`

This plugin is currently scoped for personal/local use. If it is submitted later, use this checklist before publishing.

## Repository

- [ ] Public GitHub repository exists.
- [x] `README.md` describes what the plugin does and how to use it.
- [x] `LICENSE` exists.
- [x] `manifest.json` exists at repository root.
- [x] `manifest.json.id` is unique and does not contain the product name prefix.
- [x] `manifest.json.description` does not include the redundant product name.
- [x] `manifest.json.version` uses `x.y.z`.
- [x] `versions.json` maps plugin version to minimum app version.

## Release

- [ ] `npm run build` passes.
- [ ] `npx tsc --noEmit` passes.
- [ ] `npm test` passes.
- [ ] GitHub release tag equals `manifest.json.version`.
- [ ] Release assets include `main.js`.
- [ ] Release assets include `manifest.json`.
- [ ] Release assets include `styles.css`.

## Artifact attestations

For a public release, prefer GitHub Actions with artifact attestations for `main.js` and `styles.css`. Manual releases are still usable, but automated review may show a recommendation about missing artifact attestations.

## Directory Submission

- [ ] Sign in to https://community.obsidian.md.
- [ ] Link the GitHub account that owns the repository.
- [ ] Open **Plugins -> New plugin**.
- [ ] Submit `https://github.com/viggomeesters/obsidian-xlsx-viewer`.
- [ ] Confirm developer policies and support commitment.
- [ ] Address automated review feedback.

These final steps require the repository owner's account.

Official references:

- https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin
- https://github.com/obsidianmd/obsidian-releases
