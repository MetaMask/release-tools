# Delegation: `@metamask/changesets-lint`

Date: 2026-10-19
Status: Ready to delegate
Depends on: `@metamask/changesets-utils` and `@metamask/changesets-changelog`

## Task

Build `@metamask/changesets-lint`, the CI linter for MetaMask/core Changeset files.

The linter must validate only the Changeset files that were added or modified since a supplied Git reference when `--since` is provided. It must validate all `.changeset/*.md` files when `--since` is omitted.

The command compares a supplied Git reference directly with the working tree. This includes committed, staged, unstaged, and untracked Changeset files.

Work in an isolated `gr/` worktree branch. Do not modify the branches for `changesets-utils`, `changesets-changelog`, or PR #25.

Use the repository workflow:

1. Read the context and inspect existing package patterns.
2. Write a design spec and get approval.
3. Write an implementation plan and get approval.
4. Implement test-first.
5. Run the complete repository verification suite.

## Context to read

Read these files before designing:

- The approved design and implementation of `@metamask/changesets-utils` in its worktree, merged branch, or published package. Treat its implemented public API as authoritative after confirming that it matches the six-category grammar restated below.
- `packages/apply-release-plan/package.json`
- Root `package.json`, `tsconfig.json`, and lint/build configuration.
- `@changesets/read`, `@changesets/parse`, and `@manypkg/get-packages` APIs used by the repository's pinned Changesets version.

The grammar in this brief is authoritative for the linter. The supported categories are `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security`. Before designing, verify that the targeted `@metamask/changesets-utils` revision exposes this contract. Do not duplicate or override its parser in the linter.

## Package name and role

Use the plural package name:

```text
@metamask/changesets-lint
```

This package validates Changeset artifacts. It does not create, rewrite, or render changelogs.

## Current Changeset grammar

Each Changeset contains exactly one categorized entry:

```md
---
'@metamask/network-controller': major
---

## Changed

- Rename `get-client` to `get-network-client`
  - The old method is no longer available
```

The summary rules are:

- The summary starts with a level-two heading: `## Added`, `## Changed`, `## Deprecated`, `## Removed`, `## Fixed`, or `## Security`.
- Category matching is case-insensitive. Canonical output is `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, or `Security`.
- Exactly one unindented top-level bullet is required.
- Nested bullets and continuation lines belong to that entry.
- The entry must contain text.
- A second top-level bullet is invalid.
- A second heading is invalid.
- Leading, trailing, and heading-to-entry blank lines are allowed.
- Breaking status is not encoded in the summary. It is inferred from the frontmatter bump type by the changelog plugin.

Delegate summary parsing to `parseChangesetSummary` from `@metamask/changesets-utils`. Surface its `GrammarError` fields (`line`, `rule`, and `hint`) in linter diagnostics.

## Validation responsibilities

For each selected Changeset file, validate:

### Frontmatter

Use the repository's `yaml` package for low-level frontmatter parsing and recovery.

- Report YAML syntax errors while continuing to inspect the summary.
- Every package name exists in the workspace.
- Every bump type is `major`, `minor`, or `patch`.
- The file has at least one package release.
- Report the file path and package name where available.

For valid frontmatter, use the pinned Changesets parser as the compatibility check. Do not duplicate validation that the Changesets parser already performs unless the duplicate check improves the diagnostic. The low-level YAML parser is the recovery path that allows frontmatter and summary errors from the same file to be reported together.

### Summary

Call `parseChangesetSummary` and report `GrammarError` details clearly.

The linter must reject old or superseded formats, including:

- `- CHANGED: ...` without a category heading.
- `**BREAKING:**` markers.
- Multiple top-level entries in one file.
- Unsupported categories outside the six-category set, such as `Uncategorized`.

### Git selection

The linter selects files in one of two modes.

When `--since <git-ref>` is provided:

- Compare the reference directly with the working tree.
- Include committed, staged, unstaged, and untracked changes.
- Include added or modified `.changeset/*.md` files.
- For renames, validate the file at its new path and ignore the deleted old path.
- Ignore deleted files.
- Ignore unchanged files.

When `--since` is omitted:

- Validate all `.changeset/*.md` files in the working tree.

In both modes:

- Ignore `.changeset/README.md` and other non-Changeset Markdown files.
- If no relevant files are selected, print a concise message and exit successfully.
- Treat every finding as an error for now.
- Report all errors from all selected files. Continue validating other files after one file fails.

The linter must not decide whether a changed package needs a Changeset. That presence check remains the responsibility of `changeset status --since <ref>`.

The project root is `process.cwd()`. The public CLI does not expose `--project-directory`; the internal API may accept an injectable project directory for tests. Running outside the monorepo root should produce a clear error when `.changeset/` or workspace configuration cannot be found.

## CLI contract

Provide a binary named `changesets-lint`.

Support:

```text
changesets-lint
changesets-lint --since <git-ref>
```

Behavior:

- `--since` is optional. Without it, scan all `.changeset/*.md` files.
- `--help` describes the command and examples.
- A successful run exits with status `0`.
- Any validation error exits with a non-zero status.
- Output is human-readable text only. Do not add a JSON or other machine-readable output mode.
- Errors go to stderr. The no-files message may go to stdout.
- Diagnostics include the relative Changeset path and, when applicable, line, rule, package, or bump type.
- Do not add `--fix` or `--pr-number`.

The implementation may expose a library API for testing and future callers. Keep the CLI as the primary supported interface unless the existing repository conventions require otherwise.

## Breaking changes

Do not add a summary-level breaking marker check.

The frontmatter bump type remains available to the linter. Decide and document whether the linter needs any bump-policy validation beyond the allowed bump types. The default recommendation is:

- Validate that the bump type is supported.
- Do not infer or validate a `BREAKING` marker because no such marker exists.
- Do not enforce a separate major-bump policy unless Core provides a concrete rule.

## Explicitly out of scope

- PR-link parsing, validation, or insertion.
- `--fix` and `--pr-number` options.
- Changeset presence checks; use `changeset status --since`.
- Changelog rendering or version-header generation.
- Changelog category grouping.
- Partial-release filtering or residual Changeset restoration.
- Changes to `create-release-branch`.
- Core CI workflow changes.
- Automatic edits to Changeset files.
- Validation of every unchanged pending Changeset when `--since` is supplied.

## Architecture and package setup

Use the same CLI architecture as `@metamask/snaps-cli`, adapted to this repository's ESM, TypeScript, Vitest, and Oxfmt conventions:

- `src/main.ts` is the executable entry point and delegates failures to the CLI error handler.
- `src/cli.ts` owns the testable `yargs` setup, help text, strict option parsing, and exit behavior.
- `src/builders.ts` contains reusable option definitions.
- `src/commands/lint/index.ts` defines the command and its options.
- `src/commands/lint/lint.ts` orchestrates selection and validation.
- Separate implementation modules hold Git selection, YAML/frontmatter recovery, workspace validation, and diagnostic formatting.
- Keep the validation implementation independently testable without spawning the CLI.
- Use the Snaps pattern of focused command tests plus implementation tests and end-to-end CLI tests where useful.

The public command is `changesets-lint --since <ref>`, not a required subcommand form.

Follow this repository's package conventions:

- ESM only.
- Use the repository's TypeScript, Vitest, lint, formatting, and build conventions.
- Use exact or repository-approved dependency versions.
- Add `yaml` as a direct dependency. The repository already uses `yaml` in `packages/create-release-branch`; do not rely on transitive `js-yaml`.
- Expected dependencies include the pinned Changesets read/parser APIs and `@manypkg/get-packages`; confirm exact package names and versions before editing manifests.
- Do not depend on `@metamask/auto-changelog` or `@metamask/changesets-changelog` unless a concrete shared type requires it.
- Add package metadata, scripts, tests, and changelog entries according to the existing package template.

## Tests

Write tests before implementation. Cover at least:

### Git selection

- Added Changeset file is selected.
- Modified Changeset file is selected.
- Committed Changeset file is selected when changed since the reference.
- Staged Changeset file is selected.
- Unstaged Changeset file is selected.
- Untracked Changeset file is selected.
- Unchanged Changeset file is not selected.
- Deleted Changeset file is not selected.
- Non-Changeset Markdown under `.changeset/` is ignored.
- Files outside `.changeset/` are ignored.
- Rename behavior matches the documented design.
- No selected files prints a message and exits successfully.
- Without `--since`, all Changeset files are selected.
- A supplied Git reference is resolved and compared with the working tree.

### Frontmatter

- Valid package and bump pass.
- Unknown package fails.
- Invalid bump type fails.
- Malformed frontmatter fails.
- Missing release entries fail.
- Multiple packages in one file follow the Changesets parser behavior.

### Summary

- All six categories pass.
- Category matching is case-insensitive.
- Exactly one top-level bullet passes.
- Nested bullets and continuation lines pass.
- Missing heading fails.
- Wrong heading level fails.
- Unsupported category fails.
- Missing entry fails.
- Empty entry fails.
- Multiple top-level bullets fail.
- Multiple headings fail.
- Old grammar fails.
- `GrammarError` diagnostics include the path, line, rule, and hint.

### CLI

- Help output works.
- Omitting `--since` validates all Changeset files.
- Success returns exit code `0`.
- Validation failures return a non-zero exit code.
- Relative paths and diagnostic output are stable.

Use fixture repositories or the repository's existing test utilities for Git behavior. Avoid tests that depend on a developer's global Git configuration.

## Completion criteria

The delegation is complete when:

- The package implements the documented CLI and package API.
- Only added or modified `.changeset/*.md` files since `--since` are validated.
- All grammar and frontmatter rules above have test coverage.
- No PR-link or old breaking-marker behavior remains.
- The package passes its focused tests.
- The repository passes `yarn build`, `yarn lint`, and `yarn test`.
- A draft PR is prepared using the repository's pull request description template.
