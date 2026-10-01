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

## Categorized changelogs

Upstream renders each release's changelog entry as a `## <version>` heading followed by `### Major Changes` / `### Minor Changes` / `### Patch Changes` sections — the grouping and structure are hardcoded, and the changelog module configured in `.changeset/config.json` only controls the content of individual lines.

This fork adds an opt-in **categorized mode**. A changelog module opts in by exporting three additional members alongside the standard `getReleaseLine` / `getDependencyReleaseLine`:

```ts
import type {
  GetCategorizedReleaseLines,
  GetCategorizedDependencyReleaseLines,
} from '@metamask/apply-release-plan';

// The complete, ordered list of section titles.
export const categories = [
  'Added',
  'Changed',
  'Deprecated',
  'Removed',
  'Fixed',
  'Security',
];

// One changeset can yield several lines, each assigned to a category.
export const getCategorizedReleaseLines: GetCategorizedReleaseLines = async (
  changeset,
  type,
  options,
) => [{ category: 'Added', line: '- Add a fabulous feature' }];

// The categorized variant of `getDependencyReleaseLine`.
export const getCategorizedDependencyReleaseLines: GetCategorizedDependencyReleaseLines =
  async (changesets, dependenciesUpdated, options) =>
    dependenciesUpdated.map((dependency) => ({
      category: 'Changed',
      line: `- Bump \`${dependency.name}\` to \`${dependency.newVersion}\``,
    }));
```

When a categorized module is configured:

- The release entry is rendered as `## [<version>]` (bracketed, Keep a Changelog style) followed by one `### <category>` section per entry in `categories`, in that order. Empty categories are omitted.
- Returning a line for a category not present in `categories` is an error, and no files are written.
- The new entry is inserted before the first existing version heading (bracketed headings like `## [1.2.3]` are recognized), or appended after the title and preamble when the changelog has no releases yet.

Modules without the categorized exports get the upstream behavior, unchanged.

Note that categorized mode only writes the new release section: it does not produce a complete Keep a Changelog document on its own. Version link references at the bottom of the file (and any other whole-file conventions) are expected to be maintained by a separate tool such as [`@metamask/auto-changelog`](https://github.com/MetaMask/auto-changelog), run as a post-processing step.

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
