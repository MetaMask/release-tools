# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Show colors and progress spinners in the CLI output ([#154](https://github.com/MetaMask/release-tools/pull/154))
- Show the CLI output in one block, with a spinner for long steps and the output of a failing Yarn step ([#159](https://github.com/MetaMask/release-tools/pull/159))
- Show errors without a stack trace (set `DEBUG=create-release-branch:*` to see it), with their causes, and list release spec problems by line and package ([#<n>](https://github.com/MetaMask/release-tools/pull/<n>))

### Fixed

- Open the editor on the release spec without a shell, so paths with spaces or shell characters are passed as-is ([#156](https://github.com/MetaMask/release-tools/pull/156))
- Support editor commands with arguments in `EDITOR`, such as `idea --wait` ([#158](https://github.com/MetaMask/release-tools/pull/158))

## [4.2.4]

### Changed

- Bump `@metamask/auto-changelog` from `^7.0.0` to `^7.1.0` ([#129](https://github.com/MetaMask/release-tools/pull/129), [#143](https://github.com/MetaMask/release-tools/pull/143))

### Fixed

- Fix the "Initialize Release" commit failing with "nothing to commit" when the changelogs are already up to date ([#142](https://github.com/MetaMask/release-tools/pull/142))

## [4.2.3]

### Changed

- Bump `@metamask/auto-changelog` from `^6.1.0` to `^7.0.0` ([#103](https://github.com/MetaMask/release-tools/pull/103), [#85](https://github.com/MetaMask/release-tools/pull/85))
- This package was migrated from [`MetaMask/create-release-branch`](https://github.com/MetaMask/create-release-branch). See [the original changelog](https://github.com/MetaMask/create-release-branch/blob/v4.2.2/CHANGELOG.md) for changes prior to the migration.

[Unreleased]: https://github.com/MetaMask/release-tools/compare/@metamask/create-release-branch@4.2.4...HEAD
[4.2.4]: https://github.com/MetaMask/release-tools/compare/@metamask/create-release-branch@4.2.3...@metamask/create-release-branch@4.2.4
[4.2.3]: https://github.com/MetaMask/release-tools/releases/tag/@metamask/create-release-branch@4.2.3
