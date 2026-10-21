# `@metamask/changesets-lint`

A CLI for validating Changeset files against MetaMask conventions

## Installation

`yarn add @metamask/changesets-lint`

or

`npm install @metamask/changesets-lint`

## Usage

Call `lintChangesets` with the repository directory and the workspace package
names. By default, it validates every Markdown file in `.changeset/`:

```ts
import { lintChangesets } from '@metamask/changesets-lint';

const diagnostics = await lintChangesets({
  repositoryDirectory: process.cwd(),
  workspacePackageNames: new Set(['@metamask/example']),
});
```

Set `since` to a Git revision to validate only Changeset files added or
modified between that revision and `HEAD`:

```ts
const diagnostics = await lintChangesets({
  repositoryDirectory: process.cwd(),
  since: 'origin/main',
  workspacePackageNames: new Set(['@metamask/example']),
});
```

The command-line interface and CI integration are not available yet.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
