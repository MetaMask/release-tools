# Delegation: Changesets mode for `@metamask/create-release-branch`

Date: 2026-10-20
Status: Ready to delegate
Package: `@metamask/create-release-branch`
Target release: v5

## Task

Add Changesets support to `@metamask/create-release-branch` while preserving the existing release-specification workflow.

The package must support two modes:

- **Legacy mode:** the current behavior remains unchanged.
- **Changesets mode:** selected automatically when `<projectDirectory>/.changeset/config.json` exists.

Add `--no-changesets` as an escape hatch that forces legacy mode. Changesets mode is for monorepos in v1. Do not adapt the interactive web UI in v1; report a clear unsupported-mode error when `--interactive` is used with Changesets mode.

Work in an isolated `gr/` worktree branch. Do not modify the `changesets-utils`, `changesets-changelog`, or `changesets-lint` worktrees.

## Required workflow before implementation

1. Read this delegation document and the existing package implementation.
2. Inspect the exact APIs and versions of the Changesets packages available in the repository.
3. Write a design spec and get approval.
4. Write an implementation plan and get approval.
5. Implement test-first.
6. Run the full verification suite.

Do not begin implementation before the design and plan are approved.

## Context files to read

Read these files first:

- `packages/create-release-branch/src/main.ts`
- `packages/create-release-branch/src/command-line-arguments.ts`
- `packages/create-release-branch/src/initial-parameters.ts`
- `packages/create-release-branch/src/monorepo-workflow-operations.ts`
- `packages/create-release-branch/src/release-plan.ts`
- `packages/create-release-branch/src/release-specification.ts`
- `packages/create-release-branch/src/project.ts`
- `packages/create-release-branch/src/package.ts`
- `packages/create-release-branch/src/repo.ts`
- `packages/create-release-branch/src/yarn-commands.ts`
- Existing unit and functional tests for the package.
- `docs/superpowers/specs/2026-10-09-changeset-utils-design.md`
- `docs/superpowers/specs/2026-10-12-changeset-utils-summary-grammar-amendment.md`
- The current `@metamask/changesets-utils` package and public API.
- The current `@metamask/changesets-changelog` package and public API.
- The current `@metamask/apply-release-plan` package and its categorized changelog API.
- The `@metamask/auto-changelog` API and the version containing optional `Unreleased` support.

The current package already has a legacy monorepo workflow. Reuse its common release tail instead of duplicating branch, commit, constraints, lockfile, and deduplication behavior.

## Changesets mode selection

The project root is the existing `--project-directory` value.

Mode selection:

1. If `--no-changesets` is supplied, use legacy mode even when `.changeset/config.json` exists.
2. Otherwise, if `<projectDirectory>/.changeset/config.json` exists, use Changesets mode.
3. Otherwise, use legacy mode.

Keep the current default behavior for projects without Changesets configuration.

Add the new flag to the existing command-line argument type and parser. Preserve all existing options and semantics.

## Changesets workflow

Implement a separate workflow module. Suggested names are:

- `src/changesets-workflow-operations.ts`
- `src/release-selection.ts`

The final names are the implementer's design choice after inspecting the codebase.

The workflow is:

### 1. Create the release branch

Preserve the existing branch and commit conventions:

- Branch name: `release/<version>`.
- First commit: `Initialize Release <version>`.
- Final commit: `Update Release <version>`.
- Preserve the root `ORDINARY.BACKPORT.0` version bump behavior.
- Preserve the existing release detection contract used by CI.

The Changesets release version is derived from the selected Changesets release plan. The implementation must define how the root release version is calculated and preserve the existing backport behavior where applicable. Raise this as a design question if the current Changesets plan does not provide a unique root version.

### 2. Read the full Changesets release plan

Use the pinned Changesets APIs, not the CLI subprocess, to load the plan:

- `@changesets/get-release-plan`
- `@changesets/assemble-release-plan`
- `@changesets/config`
- `@manypkg/get-packages`

`getReleasePlan(projectDirectory)` provides the full plan and the parsed `.changesets` collection needed later.

Pin exact versions for semi-internal Changesets APIs according to repository conventions. Confirm the actual exports and types before implementation.

### 3. Select packages through an editor

Replace the legacy `RELEASE_SPEC.yml` in Changesets mode with a temporary `RELEASE_SELECTION.yml`.

The selection file must:

- List every package with at least one direct Changeset release.
- Prefill all listed packages as included.
- Show useful comments, including package name, current version, planned version, and number of direct Changesets.
- Provide a `skip:` section for dependents that the maintainer deliberately excludes.
- Preserve the existing `$EDITOR` behavior and error when no editor is available.
- Be removed after a successful run.
- Support `--reset` by removing a stale selection file before generating a new one.
- Support the existing resume behavior when a selection file remains after a failed or interrupted run.

The interactive web UI is not supported in Changesets mode in v1. It must fail before changing the repository and explain that selection through `--interactive` is not implemented for Changesets mode.

The exact YAML shape is part of the design work. Keep it simple and compatible with the existing editor flow.

### 4. Filter and re-plan

Use `filterChangesets` from `@metamask/changesets-utils` to retain only selected package releases.

Then call `assembleReleasePlan` with the filtered in-memory Changesets and the workspace/configuration data. Do not use Changesets `config.ignore` for partial selection because mixed Changesets can hard-error there.

The filtered release plan must be the only plan passed to `applyReleasePlan`.

### 5. Validate dependent selection

Preserve the current release specification's safety rules in Changesets mode:

- If a package receives a major release, its dependents and peer dependents must be selected or explicitly listed in `skip:`.
- Do not silently release unselected packages that `assembleReleasePlan` adds only because of dependency propagation.
- Report package names and the reason for every invalid selection.
- Keep error wording consistent with the existing release-specification behavior where possible.

The implementation must define how direct Changeset releases, dependency-only releases, selected packages, and explicitly skipped dependents are distinguished.

### 6. Apply the filtered release plan

Call the forked `@metamask/apply-release-plan` with the filtered plan, workspace packages, and the target project's Changesets configuration.

The target project's `.changeset/config.json` resolves the changelog plugin. `create-release-branch` must not import or directly depend on `@metamask/changesets-changelog`.

`applyReleasePlan` is responsible for:

- Bumping package versions.
- Updating internal dependency ranges.
- Writing categorized release blocks.
- Deleting consumed Changeset files.

Do not reimplement these operations in `create-release-branch`.

### 7. Post-process changelogs

After applying the release plan, run the existing `@metamask/auto-changelog` integration for each released package.

Use the optional-`Unreleased` behavior from the compatible auto-changelog version:

1. Parse the package changelog.
2. During the transition, migrate any remaining `[Unreleased]` entries into the new release.
3. Drop the empty `Unreleased` section when configured for optional mode.
4. Regenerate version link references.
5. Serialize and format with the selected formatter.
6. Write the result.

Post-processing must remain whole-file handling. The Changesets plugin and fork only produce the new release block.

### 8. Restore residual Changesets

Always call `restoreResidualChangesets` after `applyReleasePlan` and changelog post-processing.

For a Changeset that listed both released and unreleased packages:

- Keep the file on disk.
- Rewrite its frontmatter with only unreleased packages.
- Preserve the original summary.

For a fully consumed Changeset:

- Leave it deleted.

The operation must be safe for sequential partial releases and idempotent reruns.

### 9. Run the common release tail

Reuse the existing common operations:

- `yarn constraints --fix`.
- `yarn install --no-immutable`.
- `yarn dedupe`.
- The existing root version bump behavior.
- Final `Update Release <version>` commit.
- Existing release branch behavior.

Extract shared operations from the legacy workflow where needed. Do not change legacy behavior while extracting them.

## Legacy mode compatibility

Legacy mode must remain behaviorally unchanged:

- Existing release specification generation and validation continue to work.
- Existing `RELEASE_SPEC.yml` behavior remains unchanged.
- Existing interactive UI behavior remains unchanged.
- Existing polyrepo behavior remains unchanged.
- Existing functional fixtures continue to pass without updates unless a shared test utility requires a mechanical change.

`--no-changesets` must provide a reliable way to run this mode explicitly.

## Command-line behavior

Preserve all existing options and add:

```text
--no-changesets
```

The help text must explain that it forces the legacy workflow even when `.changeset/config.json` exists.

Changesets mode is selected automatically. It must not require a new mode flag.

In Changesets mode:

- `--reset` removes stale `RELEASE_SELECTION.yml` state.
- `--interactive` exits with a clear unsupported-mode error.
- `--formatter` continues to control changelog formatting.
- Existing project-directory, temporary-directory, default-branch, and backport options keep their documented meaning.

## Dependencies and package version

Update `packages/create-release-branch/package.json` with the exact approved versions of:

- `@changesets/get-release-plan`
- `@changesets/assemble-release-plan`
- `@changesets/config`
- `@manypkg/get-packages`
- `@metamask/apply-release-plan`
- `@metamask/changesets-utils`
- The compatible `@metamask/auto-changelog` version with optional `Unreleased` support.

Do not add a dependency on the changelog plugin. The target project's Changesets configuration resolves it.

Because Changesets v3 requires the newer Node range, evaluate and document the package major-version change. The planned release is v5. Update `engines` only to the approved Changesets-compatible range.

## Tests

Write tests before implementation.

### Mode selection

- No `.changeset/config.json` selects legacy mode.
- Existing config selects Changesets mode.
- `--no-changesets` forces legacy mode.
- Mode selection does not modify the repository.
- Polyrepo behavior remains unchanged.

### Plan and selection

- A fixture monorepo with valid Changesets produces the expected full release plan.
- `RELEASE_SELECTION.yml` contains direct-release packages and planned versions.
- All entries are initially selected.
- Removing a package excludes its direct releases.
- `skip:` acknowledges an excluded dependent.
- A missing editor follows the existing behavior.
- `--reset` removes stale selection state.
- A resumed run reuses valid selection state.
- Interactive Changesets mode fails clearly without modifying files.

### Filtering and dependent validation

- A filtered plan contains only selected package releases.
- A multi-package Changeset is filtered correctly.
- A major package requires selected or explicitly skipped dependents.
- Unselected dependency-only releases are removed.
- Invalid selection errors list all affected packages.
- A plan with no selected direct releases is handled explicitly.

### Apply and post-processing

- Package versions and internal dependency ranges match the filtered plan.
- Categorized changelog output is written through the configured plugin.
- Auto-changelog post-processing produces valid Keep a Changelog files.
- Version link references are regenerated.
- Transitional `Unreleased` sections are migrated and removed when configured.
- Fully consumed Changesets are deleted.
- Straddling Changesets are restored with residual frontmatter and unchanged summaries.
- Sequential release-A then release-B behavior works.
- Rerunning residual restoration is idempotent.

### Release workflow

- Release branch and commit names remain unchanged.
- Root version bump behavior remains unchanged.
- Constraints, install, and dedupe commands run in the expected order.
- Final release branch contents match the expected fixture.
- Legacy fixtures pass unchanged.

### Failure recovery

- A failure before apply does not modify package versions or changelogs.
- A failure after Changeset deletion can be recovered by residual restoration from the in-memory plan.
- Errors preserve useful context and do not leave misleading selection state.

## Acceptance rehearsal

After focused tests pass, create a fixture or temporary Core branch containing two or three realistic Changesets:

- One patch or minor package release.
- One major release with dependents.
- One multi-package Changeset that straddles a partial release.

Run the Changesets workflow end to end. Compare the output with the legacy workflow for equivalent release input:

- Package versions.
- Internal dependency ranges.
- Changelog content, allowing for removal of `Unreleased` sections.
- Version link references.
- Residual Changeset files.
- Root version bump.
- Branch name.
- Commit messages.
- Yarn artifacts.

The rehearsal is an acceptance gate. Do not report the phase complete until the differences are explained and approved.

## Out of scope

- Changesets support in the interactive web UI.
- Changesets adoption in Core itself.
- Changeset CI workflows.
- Changeset linting.
- Changeset changelog plugin implementation.
- Publishing or release automation changes outside this package.
- Upstreaming partial-release behavior to Changesets.
- Incremental editing of a partially applied release beyond the existing `--reset` semantics.
- Changes to the legacy workflow unless required for safe shared extraction.

## Working agreements

- Use a `gr/` branch.
- Keep changes isolated in a worktree.
- Open pull requests as drafts.
- Use the repository pull request description template.
- Do not post comments or review replies.
- Do not add AI attribution.
- Follow the existing TypeScript, Vitest, Oxfmt, and lint conventions.
- Do not add lint overrides or compiler relaxations.

## Completion criteria

The delegation is complete when:

- Changesets mode is automatically selected from `.changeset/config.json`.
- `--no-changesets` reliably selects legacy mode.
- The filtered Changesets release plan is applied through the approved APIs.
- Partial-release residual Changesets are restored correctly.
- Auto-changelog post-processing is integrated.
- Legacy behavior remains passing.
- Focused tests, the acceptance rehearsal, and full repository verification pass.
- A draft PR is prepared using the repository PR template.
