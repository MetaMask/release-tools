---
'@metamask/auto-changelog': minor
---

## Added

- Add `--allowMissingUnreleasedSection` and `--removeEmptyUnreleasedSection` options to the `validate` command for changelogs managed with Changesets ([#134](https://github.com/MetaMask/release-tools/pull/134))
  - With `--allowMissingUnreleasedSection`, the `Unreleased` section is optional.
  - With `--removeEmptyUnreleasedSection`, `--fix` removes an empty `Unreleased` section. This requires `--allowMissingUnreleasedSection`.
