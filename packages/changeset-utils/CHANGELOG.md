# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add `parseChangesetSummary` for parsing categorized Changeset summaries, and `GrammarError` for structured parse failures ([#41](https://github.com/MetaMask/release-tools/pull/41))
  - Summaries use a line-based grammar modeled on Conventional Commits. Blank lines separate entries, each entry starts with an `added:`, `changed:`, `removed:`, or `fixed:` header, and an optional `!` before the colon marks a breaking change.

[Unreleased]: https://github.com/MetaMask/release-tools/
