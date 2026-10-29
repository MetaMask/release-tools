# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add a `--changesets` option to the `validate` command for changelogs managed with Changesets ([#134](https://github.com/MetaMask/release-tools/pull/134))
  - In this mode, the `Unreleased` section is optional, and `--fix` removes an empty one
  - The option cannot be combined with `--checkDeps`

## [7.0.1]

### Fixed

- Improve populating changelogs from commits/PRs to prepare for AI-powered release workflows in MetaMask clients ([#127](https://github.com/MetaMask/release-tools/pull/127), [#130](https://github.com/MetaMask/release-tools/pull/130))
  - Handle extracting the PR number from a Runway-generated cherry-pick commit subject even when the subject has been hard-wrapped
  - Repair a Markdown link that accidentally splits a word
  - Handle parsing the PR number from a malformed link
  - Don't skip a PR that has a non-empty `CHANGELOG entry:` line even when it also has a `no-changelog` label
  - Use the trailing squash-merge PR reference when a commit subject includes both an original PR and its own PR
  - Parse a combined short PR reference such as `(#79, #91)` in an existing changelog entry as separate PRs (previously no PR numbers were extracted, so PRs documented this way were regenerated as duplicate entries in later releases)

## [7.0.0]

### Changed

- **BREAKING:** Drop CommonJS support ([#100](https://github.com/MetaMask/release-tools/pull/100))
  - This package is now ESM-only, but can still be used in CommonJS projects via `require(esm)` in modern Node.js versions (22+), or dynamic imports in older Node.js versions.
- This package was migrated from [`MetaMask/auto-changelog`](https://github.com/MetaMask/auto-changelog). See [the original changelog](https://github.com/MetaMask/auto-changelog/blob/v6.2.1/CHANGELOG.md) for changes prior to the migration.

[Unreleased]: https://github.com/MetaMask/release-tools/compare/@metamask/auto-changelog@7.0.1...HEAD
[7.0.1]: https://github.com/MetaMask/release-tools/compare/@metamask/auto-changelog@7.0.0...@metamask/auto-changelog@7.0.1
[7.0.0]: https://github.com/MetaMask/release-tools/releases/tag/@metamask/auto-changelog@7.0.0
