# `@metamask/create-release-branch`

This is an interactive command-line tool that automates steps involved in preparing a new release of a project. These steps include updating versions of one or more desired packages, adding a new section to the packages' changelogs to include changes since the previous release, and then creating a new branch from which a pull request can be submitted for review before the release goes live.

> **Note**
> At the moment, this tool only supports monorepos that use an independent versioning strategy. Support for other types of projects is planned in a future release.

## Installation

Add this tool as a development dependency to your project:

```sh
yarn add @metamask/create-release-branch --dev
```

or:

```sh
npm install @metamask/create-release-branch --save-dev
```

## Usage

For more on how to use this tool, please see the [documentation](./docs).

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
