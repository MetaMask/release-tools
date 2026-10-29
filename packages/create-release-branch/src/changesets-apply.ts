import { applyReleasePlan } from '@metamask/apply-release-plan';
import { parseChangelog } from '@metamask/auto-changelog';
import { restoreResidualChangesets } from '@metamask/changesets-utils';
import type { WriteStream } from 'fs';
import path from 'path';

import type { LoadedChangesetsPlan } from './changesets-plan.js';
import type { ChangesetsReleasePlan } from './changesets-release-plan.js';
import { fileExists, readFile, writeFile } from './fs.js';
import type { Formatter } from './initial-parameters.js';
import { wrapError } from './misc-utils.js';
import { readPackageManifest } from './package-manifest.js';
import type { Package } from './package.js';
import { getFormatter, updatePackage } from './package.js';
import type { Project } from './project.js';

const RECOVERY_COMMAND =
  'git restore :/ && git clean -fd -e RELEASE_SPEC.yml :/';

const RECOVERY_MESSAGE = `The release could not be completed. Changesets that were only partly released have been restored. Discard the remaining uncommitted changes (${RECOVERY_COMMAND}, from anywhere in the repository), then run this tool again to resume from the release spec.`;

const RESTORATION_FAILED_MESSAGE = `The release could not be completed, and the Changesets that were only partly released could not be restored. Discard every uncommitted change to get the Changesets back (${RECOVERY_COMMAND}, from anywhere in the repository), then run this tool again to resume from the release spec.`;

/**
 * The headings before which `applyReleasePlan` inserts a new release block. In
 * a changelog without them, it adds the block at the end, after any link
 * reference definition, where the changelog can no longer be parsed.
 */
const VERSION_HEADING_PATTERN = /^#{1,6}\s+.*\d+\.\d+/mu;

const LINK_REFERENCE_DEFINITION_PATTERN = /^\[[^\]]+\]:/mu;

/**
 * Checks that `applyReleasePlan` can add a release block to the changelog of
 * every package that the release bumps.
 *
 * @param project - The project.
 * @param releasePlan - The release plan built from the release spec.
 * @throws If a changelog has no release yet but has a link reference
 * definition, such as the link of an empty `Unreleased` section. The error
 * names every such package.
 */
async function checkChangelogsAcceptReleases(
  project: Project,
  releasePlan: ChangesetsReleasePlan,
): Promise<void> {
  const problems: string[] = [];
  for (const { name, type } of releasePlan.filteredPlan.releases) {
    if (type === 'none') {
      continue;
    }
    const { changelogPath } = project.workspacePackages[name];
    if (!(await fileExists(changelogPath))) {
      continue;
    }
    const changelogContent = await readFile(changelogPath);
    if (
      !VERSION_HEADING_PATTERN.test(changelogContent) &&
      LINK_REFERENCE_DEFINITION_PATTERN.test(changelogContent)
    ) {
      problems.push(
        `The changelog of ${name} (${changelogPath}) has no release yet but has a link reference definition, so the release cannot be added to it. Remove the empty Unreleased section and its link reference definition, then run this tool again.`,
      );
    }
  }
  if (problems.length > 0) {
    throw new Error(problems.join('\n'));
  }
}

/**
 * Reads the manifest of a package again, so that the changes that
 * `applyReleasePlan` made to it are kept when the package is updated.
 *
 * @param pkg - The package.
 * @returns The package with the manifest that is on disk.
 */
async function rereadPackageManifest(pkg: Package): Promise<Package> {
  const { unvalidated, validated } = await readPackageManifest(
    pkg.manifestPath,
  );
  return {
    ...pkg,
    unvalidatedManifest: unvalidated,
    validatedManifest: validated,
  };
}

/**
 * Applies the release blocks that Changesets wrote and the legacy releases,
 * then bumps the root package.
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.plan - The loaded Changesets plan.
 * @param args.releasePlan - The release plan built from the release spec.
 * @param args.newReleaseVersion - The new version of the root package.
 * @param args.formatter - The formatter to use for formatting the changelogs.
 * @param args.stderr - A stream that can be used to write to standard error.
 */
async function applyReleases({
  project,
  plan,
  releasePlan,
  newReleaseVersion,
  formatter,
  stderr,
}: {
  project: Project;
  plan: LoadedChangesetsPlan;
  releasePlan: ChangesetsReleasePlan;
  newReleaseVersion: string;
  formatter: Formatter;
  stderr: Pick<WriteStream, 'write'>;
}): Promise<void> {
  const { filteredPlan, legacyReleases } = releasePlan;
  await applyReleasePlan(filteredPlan, plan.packages, plan.config);

  for (const { name, type, newVersion } of filteredPlan.releases) {
    if (type === 'none') {
      continue;
    }
    const { changelogPath } = project.workspacePackages[name];
    const changelogContent = await readFile(changelogPath);
    let changelog: ReturnType<typeof parseChangelog>;
    try {
      changelog = parseChangelog({
        changelogContent,
        repoUrl: project.repositoryUrl,
        tagPrefix: `${name}@`,
        formatter: getFormatter(formatter),
        changesets: true,
      });
    } catch (error) {
      throw wrapError(
        `Could not parse the changelog of ${name} (${changelogPath}).`,
        error,
      );
    }
    changelog.migrateUnreleasedChangesToRelease(newVersion);
    await writeFile(changelogPath, await changelog.toString());
  }

  for (const { name, newVersion } of legacyReleases) {
    await updatePackage({
      project,
      packageReleasePlan: {
        package: await rereadPackageManifest(project.workspacePackages[name]),
        newVersion,
      },
      formatter,
      stderr,
      changesets: true,
    });
  }

  await updatePackage({
    project,
    packageReleasePlan: {
      package: await rereadPackageManifest(project.rootPackage),
      newVersion: newReleaseVersion,
    },
    formatter,
    stderr,
  });
}

/**
 * Restores the Changesets that the release consumed with the releases that it
 * left out. A Changeset is restored only if its file is gone, so Changesets
 * are left as they are if the release failed before it consumed them.
 *
 * @param project - The project.
 * @param plan - The loaded Changesets plan.
 * @param releasePlan - The release plan built from the release spec.
 * @returns The errors of the Changesets that could not be restored.
 */
async function restoreConsumedChangesets(
  project: Project,
  plan: LoadedChangesetsPlan,
  releasePlan: ChangesetsReleasePlan,
): Promise<unknown[]> {
  const changesetDir = path.join(project.directoryPath, '.changeset');
  const errors: unknown[] = [];
  for (const { id, releases } of releasePlan.selectedChangesets) {
    try {
      if (await fileExists(path.join(changesetDir, `${id}.md`))) {
        continue;
      }
      await restoreResidualChangesets({
        changesetDir,
        changesets: plan.originalChangesets.filter(
          (changeset) => changeset.id === id,
        ),
        releasedPackageNames: releases.map(({ name }) => name),
      });
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

/**
 * Applies a Changesets release to the project: bumps versions and internal
 * ranges, writes the changelogs, deletes the consumed Changesets, releases the
 * packages that only have legacy `Unreleased` entries, and bumps the root
 * package. Consumed Changesets that are only partly released are then restored
 * with their remaining releases, even if the release fails.
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.plan - The loaded Changesets plan.
 * @param args.releasePlan - The release plan built from the release spec.
 * @param args.newReleaseVersion - The new version of the root package.
 * @param args.formatter - The formatter to use for formatting the changelogs.
 * @param args.stderr - A stream that can be used to write to standard error.
 * @throws If a changelog cannot receive its release block, before any file
 * changes. If a later step fails, the error explains how to recover, and its
 * cause is the original error (an `AggregateError` if several steps failed).
 */
export async function applyChangesetsRelease({
  project,
  plan,
  releasePlan,
  newReleaseVersion,
  formatter,
  stderr,
}: {
  project: Project;
  plan: LoadedChangesetsPlan;
  releasePlan: ChangesetsReleasePlan;
  newReleaseVersion: string;
  formatter: Formatter;
  stderr: Pick<WriteStream, 'write'>;
}): Promise<void> {
  await checkChangelogsAcceptReleases(project, releasePlan);

  const releaseErrors: unknown[] = [];
  try {
    await applyReleases({
      project,
      plan,
      releasePlan,
      newReleaseVersion,
      formatter,
      stderr,
    });
  } catch (error) {
    releaseErrors.push(error);
  }

  const restorationErrors = await restoreConsumedChangesets(
    project,
    plan,
    releasePlan,
  );

  const errors = [...releaseErrors, ...restorationErrors];
  if (errors.length > 0) {
    throw wrapError(
      restorationErrors.length > 0
        ? RESTORATION_FAILED_MESSAGE
        : RECOVERY_MESSAGE,
      errors.length === 1
        ? errors[0]
        : new AggregateError(
            errors,
            releaseErrors.length > 0
              ? 'The release failed, then restoring the Changesets failed too.'
              : 'Restoring several Changesets failed.',
          ),
    );
  }
}
