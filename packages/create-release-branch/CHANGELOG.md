# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Add the `--no-changesets` option to use the legacy workflow in a monorepo that has `.changeset/config.json` ([#135](https://github.com/MetaMask/release-tools/pull/135))

### Changed

- **BREAKING:** Use the Changesets workflow automatically in a monorepo that has `.changeset/config.json` ([#135](https://github.com/MetaMask/release-tools/pull/135))
  - Pending Changesets decide which packages are offered in the release spec and their version bumps, and the configured Changesets changelog plugin writes the release entries.
  - The `--interactive` option is not supported in this mode yet.
- Bump `@metamask/auto-changelog` from `^7.0.0` to `^7.0.1` ([#129](https://github.com/MetaMask/release-tools/pull/129))

## [4.2.3]

### Changed

- Bump `@metamask/auto-changelog` from `^6.1.0` to `^7.0.0` ([#103](https://github.com/MetaMask/release-tools/pull/103), [#85](https://github.com/MetaMask/release-tools/pull/85))
- This package was migrated from [`MetaMask/create-release-branch`](https://github.com/MetaMask/create-release-branch). See [the original changelog](https://github.com/MetaMask/create-release-branch/blob/v4.2.2/CHANGELOG.md) for changes prior to the migration.

[Unreleased]: https://github.com/MetaMask/release-tools/compare/@metamask/create-release-branch@4.2.3...HEAD
[4.2.3]: https://github.com/MetaMask/release-tools/releases/tag/@metamask/create-release-branch@4.2.3
