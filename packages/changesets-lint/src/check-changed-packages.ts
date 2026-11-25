import { execa } from 'execa';
import isEqual from 'lodash/isEqual.js';
import omit from 'lodash/omit.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { isChangesetPath } from './changeset-paths.js';
import type { LintDiagnostic } from './diagnostics.js';
import { parseChangesetFile } from './parse-changeset-file.js';
import { VALID_BUMP_TYPES } from './validate-changeset-file.js';
import type { WorkspacePackage } from './workspace-package-names.js';

const IGNORED_PACKAGE_FILES = new Set(['CHANGELOG.md']);
const IGNORED_PACKAGE_PATH_PATTERNS = [
  /(?:^|\/)(?:docs|tests|__tests__)\//u,
  /\.(?:test|spec)\.[^/]+$/u,
];

export type CheckChangedPackagesOptions = {
  repositoryDirectory: string;
  since: string;
  workspaces: readonly WorkspacePackage[];
};

/**
 * Checks whether a path relative to a workspace directory does not affect
 * consumers.
 *
 * @param relativePath - The file path relative to the workspace directory.
 * @returns Whether changes to the file can be ignored.
 */
function isIgnoredPackageFile(relativePath: string): boolean {
  return (
    IGNORED_PACKAGE_FILES.has(relativePath) ||
    IGNORED_PACKAGE_PATH_PATTERNS.some((pattern) => pattern.test(relativePath))
  );
}

/**
 * Parses a JSON manifest and strips fields that do not affect consumers.
 *
 * @param rawContent - The raw `package.json` string.
 * @returns The consumer-facing manifest fields.
 */
function parseConsumerManifestFields(rawContent: string): object {
  const parsed: unknown = JSON.parse(rawContent);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Expected package.json to contain a JSON object.');
  }

  return omit(parsed, ['version', 'devDependencies']);
}

/**
 * Checks whether a `package.json` file changed beyond `version` and
 * `devDependencies`.
 *
 * @param baseContent - The `package.json` content at the merge base, or
 * `undefined` if absent.
 * @param headContent - The `package.json` content at `HEAD`, or `undefined` if
 * deleted.
 * @returns Whether consumer-facing manifest fields changed.
 */
function hasConsumerFacingPackageJsonChange(
  baseContent: string | undefined,
  headContent: string | undefined,
): boolean {
  if (headContent === undefined) {
    return false;
  }

  if (baseContent === undefined) {
    return true;
  }

  return !isEqual(
    parseConsumerManifestFields(baseContent),
    parseConsumerManifestFields(headContent),
  );
}

/**
 * Finds the merge base between `since` and `HEAD`.
 *
 * @param repositoryDirectory - The repository root directory.
 * @param since - The base git ref or commit SHA.
 * @returns The merge-base commit SHA.
 */
async function getMergeBase(
  repositoryDirectory: string,
  since: string,
): Promise<string> {
  try {
    const { stdout } = await execa('git', ['merge-base', since, 'HEAD'], {
      cwd: repositoryDirectory,
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(
      `Could not find a common ancestor between HEAD and ${since}.`,
      { cause: error },
    );
  }
}

/**
 * Lists repository-relative files changed between `mergeBase` and `HEAD`.
 *
 * @param repositoryDirectory - The repository root directory.
 * @param mergeBase - The merge-base commit SHA.
 * @param addedOrModifiedOnly - Whether to restrict to added or modified files.
 * @returns The changed file paths.
 */
async function getChangedFiles(
  repositoryDirectory: string,
  mergeBase: string,
  addedOrModifiedOnly: boolean,
): Promise<string[]> {
  const args = addedOrModifiedOnly
    ? ['diff', '--name-only', '--diff-filter=AM', mergeBase, 'HEAD']
    : ['diff', '--name-only', mergeBase, 'HEAD'];
  const { stdout } = await execa('git', args, { cwd: repositoryDirectory });
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/**
 * Reads a file at a git revision, or returns `undefined` if it does not exist.
 *
 * @param repositoryDirectory - The repository root directory.
 * @param revision - The git revision.
 * @param filePath - The repository-relative file path.
 * @returns The file contents, or `undefined` if absent.
 */
async function readGitFileAtRevision(
  repositoryDirectory: string,
  revision: string,
  filePath: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await execa('git', ['show', `${revision}:${filePath}`], {
      cwd: repositoryDirectory,
    });
    return stdout;
  } catch {
    return undefined;
  }
}

/**
 * Matches a repository-relative file path to its innermost non-private
 * workspace.
 *
 * @param workspaces - Non-private workspaces sorted deepest-first.
 * @param filePath - The repository-relative file path.
 * @returns The matching workspace and path relative to it, or `undefined`.
 */
function matchWorkspace(
  workspaces: readonly WorkspacePackage[],
  filePath: string,
): { workspace: WorkspacePackage; relativePath: string } | undefined {
  for (const workspace of workspaces) {
    if (workspace.location === '.') {
      return { workspace, relativePath: filePath };
    }
    if (filePath.startsWith(`${workspace.location}/`)) {
      return {
        workspace,
        relativePath: filePath.slice(workspace.location.length + 1),
      };
    }
  }
  return undefined;
}

/**
 * Checks that every non-private workspace with consumer-facing changes since
 * `since` is covered by an added or modified Changeset file.
 *
 * @param options - The repository and check options.
 * @param options.repositoryDirectory - The repository root directory.
 * @param options.since - The base git ref or commit SHA.
 * @param options.workspaces - All discovered workspace packages.
 * @returns Diagnostics for changed packages without a Changeset.
 */
export async function checkChangedPackages({
  repositoryDirectory,
  since,
  workspaces,
}: CheckChangedPackagesOptions): Promise<LintDiagnostic[]> {
  const publicWorkspaces = workspaces
    .filter(({ isPrivate }) => !isPrivate)
    .toSorted((left, right) => {
      if (left.location === '.') {
        return 1;
      }
      if (right.location === '.') {
        return -1;
      }
      return right.location.length - left.location.length;
    });

  if (publicWorkspaces.length === 0) {
    return [];
  }

  const mergeBase = await getMergeBase(repositoryDirectory, since);
  const [changedFiles, addedModifiedFiles] = await Promise.all([
    getChangedFiles(repositoryDirectory, mergeBase, false),
    getChangedFiles(repositoryDirectory, mergeBase, true),
  ]);

  const changedPackages = new Set<string>();
  for (const filePath of changedFiles) {
    const match = matchWorkspace(publicWorkspaces, filePath);
    if (!match || changedPackages.has(match.workspace.name)) {
      continue;
    }

    if (isIgnoredPackageFile(match.relativePath)) {
      continue;
    }

    if (match.relativePath === 'package.json') {
      const [baseContent, headContent] = await Promise.all([
        readGitFileAtRevision(repositoryDirectory, mergeBase, filePath),
        readGitFileAtRevision(repositoryDirectory, 'HEAD', filePath),
      ]);
      if (!hasConsumerFacingPackageJsonChange(baseContent, headContent)) {
        continue;
      }
    }

    changedPackages.add(match.workspace.name);
  }

  if (changedPackages.size === 0) {
    return [];
  }

  const coveredPackages = new Set<string>();
  const changesetPaths = addedModifiedFiles.filter(isChangesetPath);

  for (const filePath of changesetPaths) {
    let contents: string;
    try {
      contents = await readFile(
        path.join(repositoryDirectory, filePath),
        'utf8',
      );
    } catch (error) {
      throw new Error(`Could not read Changeset file ${filePath}.`, {
        cause: error,
      });
    }

    const parsed = parseChangesetFile(contents);
    for (const { packageName, bumpType } of parsed.packageChanges) {
      if (typeof bumpType === 'string' && VALID_BUMP_TYPES.has(bumpType)) {
        coveredPackages.add(packageName);
      }
    }
  }

  return [...changedPackages]
    .filter((packageName) => !coveredPackages.has(packageName))
    .toSorted((left, right) => left.localeCompare(right))
    .map((packageName) => ({
      rule: 'missing-changeset',
      packageName,
      message: `The package ${packageName} changed without a matching Changeset.`,
      hint: 'Run `yarn changeset` to add a Changeset for this package.',
    }));
}
