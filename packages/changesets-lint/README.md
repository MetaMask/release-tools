# `@metamask/changesets-lint`

A CLI for validating Changeset files against MetaMask conventions

## Installation

`yarn add @metamask/changesets-lint`

or

`npm install @metamask/changesets-lint`

## Usage

Call `lintChangesets` with the repository directory and the workspace package
names. It validates every Changeset Markdown file in `.changeset/`:

```ts
import { lintChangesets } from '@metamask/changesets-lint';

const diagnostics = await lintChangesets({
  repositoryDirectory: process.cwd(),
  workspacePackageNames: new Set(['@metamask/example']),
});
```

The function returns structured diagnostics for every Changeset. It skips
`README.md`, non-Markdown files, and nested directories. It throws if the
`.changeset/` directory or a selected file cannot be read.

The command-line interface and CI integration are not available yet.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
