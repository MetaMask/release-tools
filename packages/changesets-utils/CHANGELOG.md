# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `parseChangesetSummary` for parsing categorized Changeset summaries, and `GrammarError` for structured parse failures ([#41](https://github.com/MetaMask/release-tools/pull/41))
  - Summaries contain one entry: a level-two `## <category>` heading followed by exactly one top-level bullet. Heading categories match case-insensitively and are returned in canonical spelling as `Added`, `Changed`, `Removed`, `Fixed`, `Security`, or `Deprecated` for plugin use.
- Add `filterChangesets` for filtering changesets down to selected package releases ([#76](https://github.com/MetaMask/release-tools/pull/76))
  - Returns new changeset and release objects, preserves summaries and metadata, drops changesets with no selected releases, and does not mutate its inputs.
- Add `restoreResidualChangesets` for rewriting Changeset files after a partial release ([#78](https://github.com/MetaMask/release-tools/pull/78))
  - Writes back only the releases for packages that were not released, preserves the original summary and bump types, leaves fully consumed Changeset files deleted, and is safe to run more than once.
- Export the supported changeset categories for changelog plugins ([#87](https://github.com/MetaMask/release-tools/pull/87)).

[Unreleased]: https://github.com/MetaMask/release-tools/
