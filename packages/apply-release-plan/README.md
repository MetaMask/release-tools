# `@metamask/apply-release-plan`

This takes a `releasePlan` object for changesets and applies the expected changes from that
release. This includes updating package versions, and updating changelogs.

This package was forked from [`@changesets/apply-release-plan@8.1.1`](https://github.com/changesets/changesets/tree/%40changesets%2Fapply-release-plan%408.1.1/packages/apply-release-plan), with its git history preserved. For changes before the fork, see [the upstream changelog](https://github.com/changesets/changesets/blob/%40changesets%2Fapply-release-plan%408.1.1/packages/apply-release-plan/CHANGELOG.md).

## Installation

`yarn add @metamask/apply-release-plan`

or

`npm install @metamask/apply-release-plan`

## Usage

```ts
import applyReleasePlan from "@metamask/apply-release-plan";
import type { ReleasePlan, Config, Packages } from "@changesets/types";

await applyReleasePlan(
    // The release plan to be applied - see @changesets/types for information about its shape
    releasePlan: ReleasePlan,

    // All information about to the repository packages - see @changesets/types for information about its shape
    packages: Packages,

    // A valid @changesets/config config - see @changesets/types for information about its shape
    config: Config
);
```

Note that `apply-release-plan` does not validate the release plan's accuracy.

To generate a release plan from written changesets use `@changesets/get-release-plan`

## Customizable changelog entries

Upstream renders each release's changelog entry as a `## <version>` heading followed by `### Major Changes` / `### Minor Changes` / `### Patch Changes` sections — the grouping and structure are hardcoded, and the changelog module configured in `.changeset/config.json` only controls the content of individual lines.

This fork lets the changelog module shape the entry, independently of any particular changelog format. All extensions are opt-in, and modules that do not use them get the upstream behavior, unchanged.

### Categorized sections

A changelog module can group release lines into arbitrary named sections instead of the bump-type sections, by exporting three additional members alongside the standard `getReleaseLine` / `getDependencyReleaseLine`:

```ts
import type {
  CategorizeReleaseLine,
  CategorizeDependencyReleaseLine,
} from '@metamask/apply-release-plan';

// The complete, ordered list of section titles. These are whatever the
// target changelog format calls for, e.g. Keep a Changelog categories or
// `Features` / `Bug Fixes`.
export const categories = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
];

// One changeset can yield several lines, each assigned to a category.
export const categorizeReleaseLine: CategorizeReleaseLine = async (
  changeset,
  type,
  options,
) => [{ category: 'Added', line: '- Add a fabulous feature' }];

// The categorized variant of `getDependencyReleaseLine`.
export const categorizeDependencyReleaseLine: CategorizeDependencyReleaseLine =
  async (changesets, dependenciesUpdated, options) =>
    dependenciesUpdated.map((dependency) => ({
      category: 'Changed',
      line: `- Bump \`${dependency.name}\` to \`${dependency.newVersion}\``,
    }));
```

The release entry is then rendered as a version heading followed by one `### <category>` section per entry in `categories`, in that order. Empty categories are omitted. Returning a line for a category not present in `categories` is an error, and no files are written.

### Custom version headings

Any changelog module (categorized or not) can control the heading line that opens a release entry by exporting `getVersionHeader`:

```ts
import type { GetVersionHeader } from '@metamask/apply-release-plan';

// For example `## [1.2.3]` (Keep a Changelog style), or `## v1.2.3`.
export const getVersionHeader: GetVersionHeader = async (release) =>
  `## [${release.newVersion}]`;
```

When absent, the default `## <version>` heading is used.

### Entry placement

New entries are inserted before the first existing version heading, or appended after the title and preamble when the changelog has no releases yet. Recognizing existing version headings is a best effort to fit common formats: plain (`## 1.2.3`), bracketed (`## [1.2.3]`), and `v`-prefixed (`## v1.2.3`) headings are all detected with `/^#{1,6}\s+.*\d+\.\d+/mu`.

Note that these extensions only shape the new release section: they do not produce a complete changelog document for formats with whole-file conventions. For example, Keep a Changelog version link references at the bottom of the file are expected to be maintained by a separate tool such as [`@metamask/auto-changelog`](https://github.com/MetaMask/auto-changelog), run as a post-processing step.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
