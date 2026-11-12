import { applyReleasePlan } from '@metamask/apply-release-plan';
import { parseChangelog } from '@metamask/auto-changelog';
import type { Changelog } from '@metamask/auto-changelog';
import { restoreResidualChangesets } from '@metamask/changesets-utils';
import { getErrorMessage } from '@metamask/utils';
import path from 'path';

import type { CliOutput } from '../../core/cli-output.js';
import { hasUncommittedChanges } from '../../core/repo.js';
import type { Formatter } from '../../core/types.js';
import type { ErrorDescription } from '../../core/user-facing-error.js';
import {
  describeError,
  UserFacingError,
} from '../../core/user-facing-error.js';
import { getFormatter } from '../../project/package.js';
import type { Project } from '../../project/project.js';
import {
  fileExists,
  readFile,
  readJsonObjectFile,
  writeFile,
  writeJsonFile,
} from '../../utils/fs.js';
import { isBumpingRelease } from './candidates.js';
import { ChangesetsSetupError } from './load.js';
import type { ChangesetsPlanData } from './plan.js';

/**
 * The command that puts aside the changes of a release that could not be
 * applied, including the files that it created.
 */
export const RECOVERY_COMMAND = 'git stash --include-untracked';

/**
 * The headings before which `applyReleasePlan` inserts a new release section.
 * In a changelog without them, it adds the section at the end, after any link
 * reference definition, where the changelog can no longer be parsed.
 */
const VERSION_HEADING_PATTERN = /^#{1,6}\s+.*\d+\.\d+/mu;

const LINK_REFERENCE_DEFINITION_PATTERN = /^\[[^\]]+\]:/mu;

/**
 * A release that failed after the tool started to write it.
 */
export class ChangesetsApplyError extends UserFacingError {
  /**
   * Creates the error.
   *
   * @param options - The options.
   * @param options.cause - The error that stopped the release.
   */
  constructor(options: { cause: unknown }) {
    super(undefined, options);
    const plain = (text: string): string => text;
    const { title, lines } = this.describe({ name: plain, dim: plain });
    this.message = [title, ...lines].join('\n');
  }

  describe(format: CliOutput['format']): ErrorDescription {
    const cause = describeError(this.cause, format, { debug: false });
    return {
      title: 'The release could not be applied.',
      lines: [
        cause.title,
        ...cause.lines,
        '',
        'The project may now have part of the release. Put the changes aside with this command, then run this tool again:',
        `  ${RECOVERY_COMMAND}`,
      ],
    };
  }
}

/**
 * Checks that the `.changeset` directory has no uncommitted changes, including
 * untracked files.
 *
 * @param project - The project.
 * @throws A `ChangesetsSetupError` if the directory has uncommitted changes.
 */
export async function checkChangesetDirectory(project: Project): Promise<void> {
  if (await hasUncommittedChanges(project.directoryPath, '.changeset')) {
    throw new ChangesetsSetupError({
      problem: 'The .changeset directory has uncommitted changes.',
      details: ['Commit or remove them, then run this tool again.'],
      filePath: path.join(project.directoryPath, '.changeset'),
    });
  }
}

/**
 * Checks that the changelog of every released package can be parsed, has no
 * entries in `Unreleased`, and can take its release section.
 *
 * @param project - The project.
 * @param data - The plan data.
 * @throws A `ChangesetsSetupError` if a changelog does not pass.
 */
async function checkChangelogs(
  project: Project,
  data: ChangesetsPlanData,
): Promise<void> {
  const changelogsWithUnreleasedEntries: string[] = [];
  const unfitChangelogs: string[] = [];

  for (const { name } of data.filteredPlan.releases.filter(isBumpingRelease)) {
    const pkg = project.workspacePackages[name];
    if (!(await fileExists(pkg.changelogPath))) {
      continue;
    }
    const changelogContent = await readFile(pkg.changelogPath);
    let changelog: Changelog;
    try {
      changelog = parseChangelog({
        changelogContent,
        repoUrl: project.repositoryUrl,
        tagPrefix: `${name}@`,
        allowMissingUnreleasedSection: true,
      });
    } catch (error) {
      throw new ChangesetsSetupError(
        {
          problem: `The changelog of ${name} could not be parsed.`,
          details: [
            getErrorMessage(error),
            'Fix the changelog, then run this tool again.',
          ],
          filePath: pkg.changelogPath,
        },
        { cause: error },
      );
    }
    if (Object.values(changelog.getUnreleasedChanges()).flat().length > 0) {
      changelogsWithUnreleasedEntries.push(`${name} ${pkg.changelogPath}`);
    }
    if (
      !VERSION_HEADING_PATTERN.test(changelogContent) &&
      LINK_REFERENCE_DEFINITION_PATTERN.test(changelogContent)
    ) {
      unfitChangelogs.push(`${name} ${pkg.changelogPath}`);
    }
  }

  if (changelogsWithUnreleasedEntries.length > 0) {
    throw new ChangesetsSetupError({
      problem:
        changelogsWithUnreleasedEntries.length === 1
          ? '1 changelog has entries in Unreleased:'
          : `${changelogsWithUnreleasedEntries.length} changelogs have entries in Unreleased:`,
      details: [
        ...changelogsWithUnreleasedEntries,
        'Changesets mode does not release entries in Unreleased. Move each entry into a Changeset and commit it, or remove the entry. Then run this tool again.',
      ],
    });
  }

  if (unfitChangelogs.length > 0) {
    throw new ChangesetsSetupError({
      problem:
        unfitChangelogs.length === 1
          ? '1 changelog cannot take the new release section:'
          : `${unfitChangelogs.length} changelogs cannot take the new release section:`,
      details: [
        ...unfitChangelogs,
        'A changelog with no release yet must not have link reference definitions, such as "[Unreleased]: ...". Remove them, then run this tool again.',
      ],
    });
  }
}

/**
 * Writes the new version of the root package to its manifest. The manifest is
 * read from disk, to keep the ranges that `applyReleasePlan` wrote to it.
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.newRootVersion - The new version of the root package.
 */
async function bumpRootVersion({
  project,
  newRootVersion,
}: {
  project: Project;
  newRootVersion: string;
}): Promise<void> {
  const { manifestPath } = project.rootPackage;
  await writeJsonFile(manifestPath, {
    ...(await readJsonObjectFile(manifestPath)),
    version: newRootVersion,
  });
}

/**
 * Rewrites the changelog of a released package with auto-changelog. The
 * changelog then has a link reference definition for the release section that
 * `applyReleasePlan` added, and no empty `Unreleased` section.
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.packageName - The name of the package.
 * @param args.formatter - The formatter to use for formatting the changelog.
 */
async function rewriteChangelog({
  project,
  packageName,
  formatter,
}: {
  project: Project;
  packageName: string;
  formatter: Formatter;
}): Promise<void> {
  const { changelogPath } = project.workspacePackages[packageName];
  if (!(await fileExists(changelogPath))) {
    return;
  }
  const changelog = parseChangelog({
    changelogContent: await readFile(changelogPath),
    repoUrl: project.repositoryUrl,
    tagPrefix: `${packageName}@`,
    formatter: getFormatter(formatter),
    allowMissingUnreleasedSection: true,
    removeEmptyUnreleasedSection: true,
  });
  await writeFile(changelogPath, await changelog.toString());
}

/**
 * Runs `applyReleasePlan` without the lines that it writes to the console when
 * it fails. The error that it throws describes the failure.
 *
 * @param args - The arguments of `applyReleasePlan`.
 */
async function applyReleasePlanQuietly(
  ...args: Parameters<typeof applyReleasePlan>
): Promise<void> {
  const { error } = console;
  console.error = (): void => {
    // Drop the message.
  };
  try {
    await applyReleasePlan(...args);
  } finally {
    console.error = error;
  }
}

/**
 * Writes the release to the project.
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.data - The plan data.
 * @param args.newRootVersion - The new version of the root package.
 * @param args.formatter - The formatter to use for formatting the changelogs.
 */
async function writeRelease({
  project,
  data,
  newRootVersion,
  formatter,
}: {
  project: Project;
  data: ChangesetsPlanData;
  newRootVersion: string;
  formatter: Formatter;
}): Promise<void> {
  const { state, filteredPlan, selectedChangesets } = data;
  await applyReleasePlanQuietly(filteredPlan, state.packages, state.config);

  for (const { name } of filteredPlan.releases.filter(isBumpingRelease)) {
    await rewriteChangelog({ project, packageName: name, formatter });
  }

  await bumpRootVersion({ project, newRootVersion });

  for (const { id, releases } of selectedChangesets) {
    await restoreResidualChangesets({
      changesetDir: path.join(project.directoryPath, '.changeset'),
      changesets: state.fullPlan.changesets.filter(
        (changeset) => changeset.id === id,
      ),
      releasedPackageNames: releases.map(({ name }) => name),
    });
  }
}

/**
 * Applies a Changesets release to the project. The Changesets that the
 * release only partly consumes are restored with the releases it leaves out.
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.data - The plan data.
 * @param args.newRootVersion - The new version of the root package.
 * @param args.formatter - The formatter to use for formatting the changelogs.
 * @throws A `ChangesetsSetupError` if a check fails before any file changes.
 * @throws A `ChangesetsApplyError` if a later step fails.
 */
export async function applyChangesetsRelease({
  project,
  data,
  newRootVersion,
  formatter,
}: {
  project: Project;
  data: ChangesetsPlanData;
  newRootVersion: string;
  formatter: Formatter;
}): Promise<void> {
  await checkChangesetDirectory(project);
  await checkChangelogs(project, data);

  try {
    await writeRelease({ project, data, newRootVersion, formatter });
  } catch (error) {
    throw new ChangesetsApplyError({ cause: error });
  }
}
