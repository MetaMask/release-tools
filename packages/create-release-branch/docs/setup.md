# Setting up your project

There are three different type of projects that this tool supports: packages that live within a polyrepo architecture (or stand alone), monorepos that use a "fixed" versioning strategy, and monorepos that use an "independent" versioning strategy (see [here](./understanding.md) for more about the implications between them). The tool has the ability to detect the difference between these at runtime, provided that some requirements are met.

## Polyrepos

By default, the tool will assume your project is within a polyrepo, so if that is the case, you can start using the tool right away — there's no additional setup needed.

## Monorepos

To determine whether a project is a monorepo, the tool will look at the project's `package.json` file for a non-empty `workspaces` field, which lists directories that hold packages you want to publish.

To determine which versioning strategy a monorepo is using, the tool will look for a `release.config.json` file within the root directory of the project. This file should define an object, and that object should have a `versioningStrategy` property. The expected value for this property and associated requirements are explained below.

### Monorepos with fixed versions

For a monorepo with fixed versions, you will want to add a `release.config.json` with a `versioningStrategy` of `"fixed"`.

Combined with the changes above, this might look like:

```
# package.json
{
  "version": "1.0.0",
  "workspaces": ["packages/*"],
}

# release.config.json
{
  "versioningStrategy": "fixed"
}
```

### Monorepos with independent versions

For a monorepo with independent versions, you will want to add a `release.config.json` with a `versioningStrategy` of `"independent"`.

Combined with the changes above, this might look like:

```
# package.json
{
  "version": "1.0.0",
  "workspaces": ["packages/*"],
}

# release.config.json
{
  "versioningStrategy": "independent"
}
```

## Changesets mode

By default, the tool reads the Git history to write the changelogs. A monorepo with independent versions can use [Changesets](https://github.com/changesets/changesets) instead. In Changesets mode:

- The pending Changesets in the `.changeset` directory set the packages to release and their new versions.
- The release spec lists these packages, with their version specifiers already filled in. Do not change a specifier. If a specifier gives another version than the Changesets, the tool stops with an error. To keep the Changesets of a package for a later release, remove the package from the release spec.
- The tool writes the changelogs from the Changesets. Then it deletes the Changesets that the release uses.
- The tool does not release the entries in the "Unreleased" section of a changelog. A package without Changesets is not released, even if it has such entries. If a package in the release has such entries, the tool stops with an error. Move the entries into Changesets and commit them, or remove the entries. You can also release them in legacy mode before you use Changesets mode.

To use Changesets mode, set `mode` to `"changesets"` in `release.config.json`:

```
# release.config.json
{
  "versioningStrategy": "independent",
  "mode": "changesets"
}
```

You can also run the tool with the `--changesets` flag. The flag selects Changesets mode for one run, whatever `mode` is set to.

Changesets mode has these requirements:

- The project must have a `.changeset/config.json` file that uses the `@metamask/changesets-changelog` changelog module. Give the module the GitHub repository of the project:

  ```json
  {
    "changelog": [
      "@metamask/changesets-changelog",
      { "repository": "<owner>/<repo>" }
    ]
  }
  ```

- Each Changeset summary must have one category heading and one entry, such as `## Added` followed by `- Add a feature`. If the subject of the commit that adds a Changeset ends with a pull request number, such as `Add a feature (#123)`, the changelog entry links to this pull request. If the subject has no pull request number, for example for a Changeset that you commit on the release branch, the entry has no link. Add the link by hand.
- Changesets pre mode must be off. To exit pre mode, run `changeset pre exit`.
- The `.changeset` directory must not have uncommitted changes. The tool checks this before it makes the first commit of the release, and again before it writes the release.
- The interactive UI (`--interactive`) does not support Changesets mode yet. Edit the release spec in your editor instead.
