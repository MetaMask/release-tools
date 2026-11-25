---
'@metamask/create-release-branch': minor
---

## Added

- Add Changesets mode ([#170](https://github.com/MetaMask/release-tools/pull/170))
  - Use pending changesets to populate released packages and their new versions in the release spec and update changelogs automatically.
  - Choose it by setting `"mode": "changesets"` in a project's `release.config.json`.
  - For more, read `docs/setup.md`.
