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

### Changesets mode

If your monorepo has a `.changeset/config.json` file, the tool uses [Changesets](https://github.com/changesets/changesets) to prepare the release. Pending Changesets decide which packages can be released and how much their versions are bumped. The changelog plugin set in `.changeset/config.json` writes the new changelog entries.

To use the legacy workflow in such a monorepo, run:

```
create-release-branch --no-changesets
```

The release spec (`RELEASE_SPEC.yml`) has the same format as in the legacy workflow. The tool lists these packages, in this order:

1. Packages that a Changeset releases, with the bump type of the Changesets release plan.
2. Packages that are released only because a dependency is released (for example, the dependents of a major release), with their planned bump type.
3. Packages that no Changeset releases but whose changelog has entries in its `Unreleased` section, with no version (`null`).

A comment after each package explains why it is listed:

```yaml
packages:
  '@metamask/foo': major # 1.4.0 -> 2.0.0, 3 changesets
  '@metamask/bar': patch # 0.8.1 -> 0.8.2, released because dependency @metamask/foo is released as major
  '@metamask/baz': null # legacy Unreleased entries only: choose major, minor, patch, or an exact version
```

You can edit the release spec in these ways:

- To leave a package out of the release, remove its line or set it to `null`. Its Changesets stay in `.changeset` for a later release. A Changeset that also releases other packages is kept with only the releases that were left out.
- To leave out a package that is listed only because a dependency is released, set it to `intentionally-skip`.
- To change the version of a package, replace the bump type with another bump type or with an exact version (for example, `2.1.0`). The tool always uses the value you give.
- To release a package from the third group, replace `null` with a bump type or an exact version. Its `Unreleased` entries move to the new release.

If a package that the tool releases also has entries in the `Unreleased` section of its changelog, the tool moves these entries into the new release, together with the entries from the Changesets.

Changesets with only `none` releases bump nothing. They are not listed in the release spec, and they are consumed by the release.

The tool checks the whole release spec before it changes any version, changelog, or Changeset, and reports all of the errors together. For example, a package that is released because of a dependency must be listed or set to `intentionally-skip`, and a listed package must have something to release.

The `--interactive` option is not supported in Changesets mode yet. Run the tool without it, or use `--no-changesets`.

#### If the release fails

If the tool fails while it applies the release, it restores the Changesets that were only partly released, and keeps the release spec. To try again:

1. Discard the uncommitted changes on the release branch:

   ```
   git restore . && git clean -fd .changeset
   ```

2. Run the tool again. It continues from the release spec that it kept.

The tool restores Changesets from the copy that it read before it applied the release. It does not protect uncommitted changes to Changesets: the commands above discard them, and also delete Changeset files that are not committed. Commit your Changesets before you run the tool.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
