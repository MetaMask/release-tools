# `@metamask/changesets-lint`

A CLI for validating Changeset files against MetaMask conventions

## Installation

`yarn add @metamask/changesets-lint`

or

`npm install @metamask/changesets-lint`

## Usage

Run the command from the root of a Yarn workspace repository:

```sh
yarn changesets-lint
```

The command runs linting by default; no `lint` subcommand is needed. Use `--help` to show usage or `--version` to print the version without running linting.

The command reads workspace package names through Yarn's APIs, including private packages and the root package if it has a name. It skips unnamed packages and does not need Yarn on `PATH`.

The command validates every regular `.md` file directly in `.changeset/`, except `README.md`, in filename order. It checks package names, bump types, and the summary grammar from `@metamask/changesets-utils`. It does not use Git to select files or inspect nested directories such as `.changeset/pre/`. It does not edit files or check whether a changed package needs a Changeset.

The command shows progress on stdout while discovering workspace packages and validating Changeset files. It animates a spinner in interactive terminals and prints progress lines otherwise. A successful run prints `✔ Done!` and exits with status `0`, including when no Changeset files exist.

Each diagnostic appears on stdout as one line:

```text
✖ .changeset/example.md:6: Unsupported category. (Fix: Use Added or Fixed.)
```

Line numbers and fix suggestions appear when available. Progress labels are dim, success symbols are green, and diagnostic and error symbols are red when the output stream supports color. Set `FORCE_COLOR=0` to disable color.

Validation failures exit with status `1` without a success message. Argument errors and operational errors, such as a missing `.changeset/` directory or invalid Yarn configuration, appear on stderr with a `✖` prefix and also exit with status `1`.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
