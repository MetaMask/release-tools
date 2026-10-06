# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Uncategorized

- This package was forked from [`@changesets/apply-release-plan@8.1.1`](https://github.com/changesets/changesets/tree/%40changesets%2Fapply-release-plan%408.1.1/packages/apply-release-plan) in the `changesets/changesets` repository. See [the original changelog](https://github.com/changesets/changesets/blob/%40changesets%2Fapply-release-plan%408.1.1/packages/apply-release-plan/CHANGELOG.md) for changes before the fork.

### Added

- Add ability to customize changelog categories ([#25](https://github.com/MetaMask/release-tools/pull/25))
  - Changelog modules can export `categorizeReleaseLine` and `categorizeDependencyReleaseLine` to assign lines produced by `getReleaseLine` and `getDependencyReleaseLine` to named sections from an ordered `categories` list, instead of the hardcoded `### Major/Minor/Patch Changes`
- Add support for a `getVersionHeader` changelog module export that controls the heading line of a release entry (e.g. `## [1.2.3]` or `## v1.2.3`) ([#25](https://github.com/MetaMask/release-tools/pull/25))

### Changed

- Insert new release entries after the title and preamble (instead of after the first line) when a changelog has no version headings yet, and recognize any heading containing a version number when placing entries ([#25](https://github.com/MetaMask/release-tools/pull/25))

[Unreleased]: https://github.com/MetaMask/release-tools/
