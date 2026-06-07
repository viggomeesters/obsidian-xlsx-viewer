# Community Submission Checklist

Current release target: `0.1.0`

This checklist tracks the repository state needed before submitting the plugin through the Obsidian Community site.

## Repository

- [x] Public GitHub repository exists.
- [x] `README.md` describes what the plugin does and how to use it.
- [x] `LICENSE` exists.
- [x] `manifest.json` exists at repository root.
- [x] `manifest.json.id` is unique and does not contain the product name prefix.
- [x] `manifest.json.description` does not include the redundant product name.
- [x] `manifest.json.version` uses `x.y.z`.
- [x] `versions.json` maps plugin version to minimum app version.

## Release

- [x] `npm run build` passes.
- [x] `npx tsc --noEmit` passes.
- [x] `npm test` passes.
- [x] GitHub release tag equals `manifest.json.version`.
- [x] Release assets include `main.js`.
- [x] Release assets include `manifest.json`.
- [x] Release assets include `styles.css`.

## Artifact attestations

The repository includes a release workflow that attests `main.js`, `manifest.json`, and `styles.css` with `actions/attest-build-provenance`. The `0.1.0` release was published manually because GitHub Actions is currently disabled for the owner account, so the Community automated review may show a non-blocking recommendation about missing artifact attestations.

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
