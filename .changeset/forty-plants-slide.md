---
'@metamask/changesets-utils': minor
---

## Added

- Add `filterChangesets` for filtering changesets down to selected package releases ([#76](https://github.com/MetaMask/release-tools/pull/76), [#168](https://github.com/MetaMask/release-tools/pull/168))
  - Returns new changeset and release objects, preserves summaries and metadata, drops changesets with no selected releases, and does not mutate its inputs.
  - Keeps the `none` releases of a kept changeset, and keeps changesets with only `none` releases, so that a release consumes them.
