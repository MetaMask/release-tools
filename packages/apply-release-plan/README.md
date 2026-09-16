# `@metamask/apply-release-plan`

Fork of [`@changesets/apply-release-plan`](https://github.com/changesets/changesets/tree/main/packages/apply-release-plan) with support for categorized (Keep a Changelog style) changelog sections.

## What this fork adds

Upstream `applyReleasePlan` renders each release's changelog entry as a `## <version>` heading followed by `### Major Changes` / `### Minor Changes` / `### Patch Changes` sections — the grouping and file structure are hardcoded, and the changelog module configured in `.changeset/config.json` only controls the content of individual lines.

This fork adds an opt-in **categorized mode**. A changelog module opts in by exporting three additional members alongside the standard `getReleaseLine` / `getDependencyReleaseLine`:

```ts
import type {
  CategorizedReleaseLine,
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

Everything else — version bumping, dependency range rewriting, changeset file deletion, formatting — behaves exactly like upstream, and modules without the categorized exports get byte-identical upstream behavior.

Note that this fork intentionally does **not** produce a complete Keep a Changelog document on its own: it only writes the new release section. Version link references at the bottom of the file (and any other whole-file conventions) are expected to be maintained by a separate tool such as [`@metamask/auto-changelog`](https://github.com/MetaMask/auto-changelog), run as a post-processing step.

## Fork maintenance

- **Upstream base**: `@changesets/apply-release-plan@8.1.1` (tag `@changesets/apply-release-plan@8.1.1` in [changesets/changesets](https://github.com/changesets/changesets)).
- **House style**: the forked sources are fully adapted to this repository's conventions (ESLint rules, TypeScript strictness including `exactOptionalPropertyTypes`, `oxfmt` formatting, `.js` import extensions) rather than kept byte-identical to upstream. Upstream _behavior_ is what must be preserved, and it is pinned down by the ported upstream test suite.
- **Functional changes on top of upstream**:
  - `src/types.ts` (new): the categorized changelog module types.
  - `src/get-changelog-entry.ts`: `isCategorizedChangelogFunctions`, the categorized entry renderer, and extraction of the shared `getUpdatedDependencies` helper.
  - `src/index.ts`: validation of categorized modules, and categorized-mode placement in `updateChangelog`.
  - `src/categorized.test.ts` and `src/test-utils/categorized-functions*.ts` (new): tests for the categorized mode.
  - `src/test-utils/index.ts` (new): trimmed, style-adapted copy of the changesets repository's private `@changesets/test-utils` helpers.
- **Syncing with a new upstream release**: review the upstream diff between the pinned base tag and the new tag (`git diff <old-tag>..<new-tag> -- packages/apply-release-plan` in the changesets repository), port the changes into these restyled sources by hand, port any new upstream test cases into `src/index.test.ts` (the upstream suite; only the `@changesets/cli` path constants at the top differ), and update the base tag in this section. The test suite passing is the behavioral parity gate.
- The categorized-mode extension is intended to be proposed upstream ([changesets#1178](https://github.com/changesets/changesets/issues/1178)); if it lands, this fork should be retired in favor of upstream.

## Installation

`yarn add @metamask/apply-release-plan`

or

`npm install @metamask/apply-release-plan`

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/release-tools#readme).
