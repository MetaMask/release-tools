---
'@metamask/changesets-utils': minor
---

## Added

- Add `restoreResidualChangesets` for rewriting Changeset files after a partial release ([#78](https://github.com/MetaMask/release-tools/pull/78))
  - Writes back only the releases for packages that were not released, preserves the original summary and bump types, leaves fully consumed Changeset files deleted, and is safe to run more than once.
