# Updating changelogs

Each package in this repo has a `CHANGELOG.md` file that records consumer-facing changes over time. It helps consumers understand new features, bug fixes, and breaking changes when upgrading. All changelogs follow the ["Keep a Changelog"](https://keepachangelog.com/) specification (validated by `@metamask/auto-changelog`).

This repository uses [Changesets](https://github.com/changesets/changesets) to manage package versions and changelogs. **Do not edit `CHANGELOG.md` directly in feature pull requests.** Instead, add a changeset file in `.changeset/` on the same branch.

## Adding a changeset

1. Run `yarn changeset` from the repository root.
2. Select the packages affected by your change and choose the SemVer bump type (`patch`, `minor`, or `major`).
3. Write the summary using one level-two [Keep a Changelog](https://keepachangelog.com/en/1.1.0/#how) category heading followed by one top-level bullet:

   ```markdown
   ## Added

   - Add support for custom categories
     - Optional nested details go here
   ```

   Supported category headings are `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`.

4. Validate your changeset files by running:

   ```sh
   yarn lint:changesets
   ```

   You can also verify that every changed package has a changeset against `origin/main` by running:

   ```sh
   yarn check:changesets
   ```

## Writing good changeset summaries

- Describe exact changes to the public API or consumer-facing behavior rather than copying commit messages.
- Use nested bullets under the main bullet when you need to list extra details.
- Omit non-consumer-facing changes (such as test updates, internal scripts, or contributor docs). If a PR touches a package without consumer-facing changes, add the `no-changelog` (or `no-changeset`) label instead of adding a changeset.
- Do not add pull request links to the summary. `@metamask/changesets-changelog` adds the PR link automatically from the commit at release time.
- Do not prefix entries with `**BREAKING:**` manually. Choose a `major` bump in the changeset, and `@metamask/changesets-changelog` adds the prefix automatically when generating `CHANGELOG.md`.
- Dependency bumps between workspace packages are recorded in `CHANGELOG.md` automatically at release time.
