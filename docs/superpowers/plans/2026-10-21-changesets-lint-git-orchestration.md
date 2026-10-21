# Changesets Lint Git Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select Changeset files from Git or the working tree and validate the selected files through the existing Changesets validator.

**Architecture:** Add a small Git adapter that reads changed paths with `git diff --name-status` and a library orchestrator that selects `.changeset/*.md` files, reads them, and calls `validateChangesetFile`. With no base revision, the orchestrator scans the working tree. With a base revision, it compares that revision with `HEAD` and keeps only added or modified Changeset Markdown files. The library accepts a revision exactly as supplied by its caller; merge-queue and pull-request event handling remains outside this PR.

**Tech Stack:** TypeScript, `execa`, Node.js filesystem APIs, Vitest, existing `validateChangesetFile` and `LintDiagnostic` types.

**Spec:** The PR 3 scope agreed in chat: `--since` will later select added or modified Changeset files, no `--since` will validate all Changeset files, and the CLI and workflow wiring remain deferred to PR 4. The library API uses an optional `since` revision rather than implementing the CLI flag.

## Global Constraints

- Validate only Markdown files directly under `.changeset/`.
- Exclude `.changeset/README.md` and `.changeset/config.json`; the extension filter excludes the latter.
- With a base revision, include Git status `A` and `M`; exclude deleted, renamed, copied, and untracked files.
- With no base revision, enumerate files from the current working tree.
- Treat the supplied base revision as any Git revision accepted by Git, including a branch, remote ref, or SHA.
- Fail clearly when the Git revision cannot be resolved or the Git command fails.
- Do not fetch, mutate the working tree, or write generated files.
- Keep parser/recovery logic and policy validation separate from Git selection/orchestration.
- Add JSDoc to production helper functions and preserve structured diagnostics.
- Keep CLI entry points, `bin` metadata, GitHub event handling, checkout depth, and workflow changes for PR 4.

## Review Focus

- A deleted Changeset must not be read from the working tree or validated; test Git status filtering in the selection task.
- A rename must not be treated as an added or modified Changeset; test status handling explicitly.
- A missing or invalid base revision must fail loudly instead of returning an empty selection; test the surfaced error.
- A filename with spaces or unusual characters must remain one path; test line-safe Git output or an explicit supported-path contract.
- No `since` value must scan only current `.changeset/*.md` files and ignore README/config files; test the default selection path.

---

### Task 1: Add the Git path-selection adapter

**Files:**

- Create: `packages/changesets-lint/src/git.ts`
- Test: `packages/changesets-lint/src/git.test.ts`
- Modify: `packages/changesets-lint/package.json`
- Modify: `yarn.lock`

**Interfaces:**

- Consumes: A repository directory and an optional base revision.
- Produces: `getChangedChangesetPaths(repositoryDirectory: string, since: string): Promise<string[]>`, returning repository-relative paths for added or modified files directly under `.changeset/` and ending in `.md`.

- [ ] **Step 1: Write failing tests for Git status selection**

  Mock `execa` and pin these cases:
  - `git diff --name-status --diff-filter=AM <since> HEAD -- .changeset` returns added and modified Markdown paths, and the function returns those paths.
  - Deleted, renamed, copied, and non-Markdown paths are excluded.
  - Git failures reject with an error that identifies the revision and repository operation.
  - A path containing spaces remains a single returned path if the selected Git output format supports it; otherwise define and test the repository-relative path contract before implementation.

- [ ] **Step 2: Run the focused test and confirm it fails**

  Run: `yarn workspace @metamask/changesets-lint test --run src/git.test.ts --coverage.enabled=false`

  Expected: FAIL because the Git adapter does not exist.

- [ ] **Step 3: Add the Git dependency and implement `getChangedChangesetPaths`**

  Add `execa` as a runtime dependency if it is not already directly declared. Run Git with an argument array and `cwd: repositoryDirectory`. Use Git’s machine-readable name/status output and filter status codes and paths in TypeScript. Convert command failures to a concise error while preserving the original error as the cause.

- [ ] **Step 4: Run the focused test and confirm it passes**

  Run: `yarn workspace @metamask/changesets-lint test --run src/git.test.ts --coverage.enabled=false`

  Expected: All Git adapter tests pass.

- [ ] **Step 5: Commit the adapter**

  ```bash
  git add packages/changesets-lint/src/git.ts packages/changesets-lint/src/git.test.ts packages/changesets-lint/package.json yarn.lock
  git commit -m "feat: select changesets from git"
  ```

### Task 2: Add current-tree Changeset discovery

**Files:**

- Create: `packages/changesets-lint/src/changeset-paths.ts`
- Test: `packages/changesets-lint/src/changeset-paths.test.ts`

**Interfaces:**

- Consumes: A repository directory.
- Produces: `getChangesetPaths(repositoryDirectory: string): Promise<string[]>`, returning sorted repository-relative `.changeset/*.md` paths from the current tree.

- [ ] **Step 1: Write failing tests for default discovery**

  Use a temporary directory containing `.changeset/README.md`, `.changeset/config.json`, valid Markdown files, nested files, and a non-Changeset file. Assert that only directly nested Markdown files are returned in deterministic sorted order.

- [ ] **Step 2: Run the focused test and confirm it fails**

  Run: `yarn workspace @metamask/changesets-lint test --run src/changeset-paths.test.ts --coverage.enabled=false`

  Expected: FAIL because the discovery function does not exist.

- [ ] **Step 3: Implement `getChangesetPaths`**

  Use filesystem APIs with the repository directory as the root. Read only the `.changeset` directory, filter regular files whose names end in `.md`, exclude `README.md`, and return normalized repository-relative paths in lexical order. Do not recurse into subdirectories.

- [ ] **Step 4: Run the focused test and confirm it passes**

  Run: `yarn workspace @metamask/changesets-lint test --run src/changeset-paths.test.ts --coverage.enabled=false`

  Expected: All discovery tests pass.

- [ ] **Step 5: Commit the discovery helper**

  ```bash
  git add packages/changesets-lint/src/changeset-paths.ts packages/changesets-lint/src/changeset-paths.test.ts
  git commit -m "feat: discover changeset files"
  ```

### Task 3: Add validation orchestration

**Files:**

- Create: `packages/changesets-lint/src/lint-changesets.ts`
- Test: `packages/changesets-lint/src/lint-changesets.test.ts`
- Modify: `packages/changesets-lint/src/index.ts`

**Interfaces:**

- Consumes: `LintChangesetsOptions` with `repositoryDirectory: string`, optional `since?: string`, and `workspacePackageNames: ReadonlySet<string>`.
- Produces: `lintChangesets(options: LintChangesetsOptions): Promise<LintDiagnostic[]>`, returning diagnostics for every selected file in path order. Each diagnostic receives the selected repository-relative path in its `path` field.

- [ ] **Step 1: Write failing orchestration tests**

  Mock path selection and `validateChangesetFile`, then pin these cases:
  - Without `since`, current-tree discovery is used.
  - With `since`, Git selection is used.
  - Files are read and passed to `validateChangesetFile` with the provided workspace package names.
  - Diagnostics from all files are returned, with each file path attached.
  - File order is deterministic.
  - A file read failure rejects with a message that identifies the path.

- [ ] **Step 2: Run the focused test and confirm it fails**

  Run: `yarn workspace @metamask/changesets-lint test --run src/lint-changesets.test.ts --coverage.enabled=false`

  Expected: FAIL because the orchestration function does not exist.

- [ ] **Step 3: Implement `lintChangesets`**

  Select paths through `getChangedChangesetPaths` when `since` is defined and through `getChangesetPaths` otherwise. Read each selected file without modifying it, call `validateChangesetFile`, attach the repository-relative path to every diagnostic, flatten the results in sorted path order, and wrap file-read errors with the path.

- [ ] **Step 4: Export the public types and function**

  Export `lintChangesets` and `LintChangesetsOptions` from `src/index.ts`. Keep the lower-level path helpers private to the package unless tests or later PRs require them publicly.

- [ ] **Step 5: Run the focused test and confirm it passes**

  Run: `yarn workspace @metamask/changesets-lint test --run src/lint-changesets.test.ts --coverage.enabled=false`

  Expected: All orchestration tests pass.

- [ ] **Step 6: Commit the orchestration API**

  ```bash
  git add packages/changesets-lint/src/lint-changesets.ts packages/changesets-lint/src/lint-changesets.test.ts packages/changesets-lint/src/index.ts
  git commit -m "feat: orchestrate changesets validation"
  ```

### Task 4: Update package documentation and verify the PR

**Files:**

- Modify: `packages/changesets-lint/README.md`
- Modify: `packages/changesets-lint/CHANGELOG.md`
- Modify: `packages/changesets-lint/src/*.test.ts` only if coverage exposes missing behavior

- [ ] **Step 1: Document the library API and PR boundary**

  Document that the library validates all current Changesets by default and accepts an optional Git revision for changed-file selection. State that the command-line interface and CI workflow integration are planned separately.

- [ ] **Step 2: Run package verification**

  Run:
  - `yarn workspace @metamask/changesets-lint test`
  - `yarn build`
  - `yarn lint`
  - `git diff --check`

  Expected: All tests, the build, lint, and whitespace checks pass.

- [ ] **Step 3: Review the public API and Git behavior**

  Confirm that no CLI or workflow files changed, no Git command mutates repository state, invalid revisions fail loudly, and diagnostics retain the existing human-readable format.

- [ ] **Step 4: Commit the documentation and final changes**

  ```bash
  git add packages/changesets-lint/README.md packages/changesets-lint/CHANGELOG.md
  git commit -m "docs: document changesets lint orchestration"
  ```
