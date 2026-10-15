# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add the Changesets changelog module that renders "Keep a Changelog" release entries ([#83](https://github.com/MetaMask/release-tools/pull/83))
  - Exports `getReleaseLine`, `getDependencyReleaseLine`, `categorizeReleaseLine`, `categorizeDependencyReleaseLine`, `getVersionHeader`, and `categories`.
  - Renders one section per category, in the order `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`, and keeps sub-bullets and continuation lines.
  - Prefixes entries of a `major` release with `**BREAKING:**`, and puts dependency bumps into `Changed`.
  - Resolves pull request links from the local commit subject with `git show`, so it needs no GitHub token and makes no network call. Rendering fails if no pull request number is found.

[Unreleased]: https://github.com/MetaMask/release-tools/
