# `@metamask/changesets-changelog`

Changesets changelog module for MetaMask

This is the changelog module that [Changesets](https://github.com/changesets/changesets) calls to render release entries. It writes ["Keep a Changelog"](https://keepachangelog.com/) sections instead of the default `### Minor Changes` sections, in the format MetaMask changelogs use.

## Installation

`yarn add @metamask/changesets-changelog`

or

`npm install @metamask/changesets-changelog`

## Usage

Point the `changelog` field of your Changesets config at this package, and pass the GitHub repository that the pull request links refer to:

```json
{
  "changelog": ["@metamask/changesets-changelog", { "repo": "MetaMask/core" }]
}
```

This module requires [`@metamask/apply-release-plan`](../apply-release-plan), which renders the categorized sections. The stock `@changesets/cli` ignores the categories and the version header.

### Entries

Each changeset holds one entry: a category heading and one top-level bullet. For example:

```markdown
---
'@metamask/base-controller': minor
---

## Added

- Add `getNetworkClient` for looking up a client by chain ID
  - The client is cached per chain.
```

That changeset renders as:

```markdown
## [1.1.0]

### Added

- Add `getNetworkClient` for looking up a client by chain ID ([#1234](https://github.com/MetaMask/core/pull/1234))
  - The client is cached per chain.
```

The supported categories are `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`. Sections appear in that order. Sub-bullets and continuation lines are kept below the entry.

Entries of a `major` release get a `**BREAKING:**` prefix. Dependency bumps go into `Changed`.

### Pull request links

The pull request number comes from the commit that added the changeset file. The module reads the commit subject with `git show`, so it needs no GitHub token and makes no network call. It supports squash subjects such as `Add a feature (#1234)` and merge subjects such as `Merge pull request #1234 from owner/branch`.

Rendering fails if the pull request number cannot be found, so that no entry is published without a link.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
