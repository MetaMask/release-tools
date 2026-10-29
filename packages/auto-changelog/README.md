# @metamask/auto-changelog

Utilities for validating and updating \"Keep a Changelog\" formatted changelogs.

This package has a CLI (`auto-changelog`), and an API.

## Installation

```sh
yarn add @metamask/auto-changelog --dev
```

or:

```sh
npm install @metamask/auto-changelog --save-dev
```

## CLI Usage

### Update

#### Update the "Unreleased" section of the changelog

`yarn run auto-changelog update`

or

`npm run auto-changelog update`

#### Use Conventional Commits prefixes to auto-categorize changes

`yarn run auto-changelog update --autoCategorize`

#### Read the "CHANGELOG entry:" on the PR

`yarn run auto-changelog update --useChangelogEntry`

#### Use Short PR links

- Like `(#247)` instead of `([#247](https://github.com/MetaMask/auto-changelog/pull/247))`

`yarn run auto-changelog update --useShortPrLink`

#### Require PR numbers (filter out commits without PR numbers)

- Only include commits that have associated PR numbers in the changelog
- Commits without PR numbers (like direct commits) will be filtered out
- This is useful for projects that want to ensure all changelog entries come from reviewed pull requests

`yarn run auto-changelog update --requirePrNumbers`

#### Normalize leading verbs to past tense

Convert recognized leading imperative verbs in generated entries to past tense,
such as `Fix` to `Fixed` and `Update` to `Updated`.

`yarn run auto-changelog update --normalizeToPastTense`

#### Exclude unannotated chore commits

Exclude `chore:` commits unless their body contains a `CHANGELOG entry:`. This
is useful when unannotated chores are considered internal-only.

`yarn run auto-changelog update --excludeChoreWithoutChangelogEntry`

#### Print update diagnostics

Print commit parsing, filtering, deduplication, and emitted-entry decisions to
stderr. This is opt-in and does not change the generated changelog.

`yarn run auto-changelog update --verbose`

#### Prevent automatic backfill

If a human or AI editor deliberately removes a commit, we want it to stay removed
if auto-changelog is run again. With the `--preventBackfill` option, we skip a commit
when it is an ancestor of a commit represented by a PR-linked entry already in the
target section. The guard uses Git ancestry, not commit timestamps, and only applies
when enabled.

`yarn run auto-changelog update --preventBackfill`

#### Update the current release section of the changelog

`yarn run auto-changelog update --rc`

or

`npm run auto-changelog update --rc`

### Deluxe, as used in metamask-extension

`yarn run auto-changelog update --autoCategorize --useChangelogEntry --useShortPrLink --rc`

### With requirePrNumbers (for stricter PR-based workflows)

`yarn run auto-changelog update --autoCategorize --useChangelogEntry --useShortPrLink --requirePrNumbers --rc`

#### Update the changelog for a renamed package

This option is designed to be used for packages that live in a monorepo.

For instance, if your package is called `polling-controller` and was renamed to `@metamask/polling-controller` at version 0.2.3, and thus the Git tags followed suit:

`yarn run auto-changelog update --tag-prefix-before-package-rename "polling-controller@" --version-before-package-name 0.2.3 --tag-prefix "@metamask/polling-controller@"`

or

`npm run auto-changelog update --tag-prefix-before-package-rename "polling-controller@" --version-before-package-name 0.2.3 --tag-prefix "@metamask/polling-controller@"`

### Validate

#### Validate the changelog simply

`yarn run auto-changelog validate`

or

`npm run auto-changelog validate`

#### Validate the changelog for a release candidate

`yarn run auto-changelog validate --rc`

or

`npm run auto-changelog validate --rc`

#### Validate the changelog with package-specific Git tags

This option is designed to be used for packages that live in a monorepo.

For instance, if your package is called `@metamask/polling-controller` and thus all Git tags for this package are prefixed with `@metamask/polling-controller@`:

`yarn run auto-changelog validate --tag-prefix "@metamask/polling-controller@"`

or

`npm run auto-changelog validate --tag-prefix "@metamask/polling-controller@"`

#### Validate the changelog for a renamed package

This option is designed to be used for packages that live in a monorepo.

For instance, if your package is called `polling-controller` and was renamed to `@metamask/polling-controller` at version 0.2.3, and thus the Git tags followed suit:

`yarn run auto-changelog validate --tag-prefix-before-package-rename "polling-controller@" --version-before-package-name 0.2.3 --tag-prefix "@metamask/polling-controller@"`

or

`npm run auto-changelog validate --tag-prefix-before-package-rename "polling-controller@" --version-before-package-name 0.2.3 --tag-prefix "@metamask/polling-controller@"`

#### Validate that each changelog entry has one or more associated pull requests

`yarn run auto-changelog validate --pr-links`

or

`npm run auto-changelog validate --pr-links`

#### Validate a changelog managed with Changesets

Changesets writes release sections directly, so the changelog does not need an "Unreleased" section. Use `--changesets` to make the "Unreleased" section optional. With `--fix`, an empty "Unreleased" section and its link are removed. A non-empty "Unreleased" section is kept.

`yarn run auto-changelog validate --changesets`

or

`npm run auto-changelog validate --changesets`

You cannot combine `--changesets` with `--checkDeps`.

### Check Dependencies

#### Check and validate dependency bump changelog entries

The `validate` command supports checking that changelog entries exist for dependency version bumps. This works on a single package's changelog at a time.

`yarn run auto-changelog validate --checkDeps`

or

`npm run auto-changelog validate --checkDeps`

#### Auto-fix missing dependency bump entries

Use the `--fix` and `--currentPr` flags to automatically add missing changelog entries for detected dependency bumps:

`yarn run auto-changelog validate --checkDeps --fix --currentPr 123`

Options:

- `--checkDeps` - Enable dependency bump changelog entry checking
- `--fromRef <ref>` - Starting git reference (commit, branch, or tag). If not provided, auto-detects from merge base with default branch.
- `--toRef <ref>` - Ending git reference (default: HEAD)
- `--remote <name>` - Remote name for auto-detection (default: origin)
- `--baseBranch <branch>` - Base branch reference for auto-detection
- `--fix` - Automatically update changelogs with missing dependency bump entries
- `--currentPr <number>` - PR number to use in changelog entries (required when using --fix with --checkDeps)

Features:

- Automatically detects dependency/peerDependency version changes (skips devDependencies/optionalDependencies)
- Validates changelog entries with exact version matching (catches stale entries)
- Marks peerDependency bumps as **BREAKING** changes
- Smart PR concatenation when same dependency is bumped multiple times
- Detects package releases and adds entries to correct section (Unreleased vs specific version)
- Handles renamed packages via package.json script hints

## API Usage

Each supported command is a separate named export.

### `updateChangelog`

This command updates the changelog.

```javascript
import { promises as fs } from 'fs';
import { updateChangelog } from '@metamask/auto-changelog';

const oldChangelog = await fs.readFile('CHANGELOG.md', {
  encoding: 'utf8',
});
const updatedChangelog = await updateChangelog({
  changelogContent: oldChangelog,
  currentVersion: '1.0.0',
  repoUrl: 'https://github.com/ExampleUsernameOrOrganization/ExampleRepository',
  isReleaseCandidate: false,
  requirePrNumbers: false, // Optional: set to true to filter out commits without PR numbers
});
await fs.writeFile('CHANGELOG.md', updatedChangelog);
```

### `validateChangelog`

This command validates the changelog.

```javascript
import { promises as fs } from 'fs';
import { validateChangelog } from '@metamask/auto-changelog';

const oldChangelog = await fs.readFile('CHANGELOG.md', {
  encoding: 'utf8',
});
try {
  await validateChangelog({
    changelogContent: oldChangelog,
    currentVersion: '1.0.0',
    repoUrl:
      'https://github.com/ExampleUsernameOrOrganization/ExampleRepository',
    isReleaseCandidate: false,
    ensureValidPrLinksPresent: true,
  });
  // changelog is valid!
} catch (error) {
  // changelog is invalid
}
```

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
