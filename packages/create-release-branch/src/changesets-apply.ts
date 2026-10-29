import { applyReleasePlan } from '@metamask/apply-release-plan';
import { parseChangelog } from '@metamask/auto-changelog';
import { restoreResidualChangesets } from '@metamask/changesets-utils';
import type { WriteStream } from 'fs';
import path from 'path';

import type { LoadedChangesetsPlan } from './changesets-plan.js';
import type { ChangesetsReleasePlan } from './changesets-release-plan.js';
import { readFile, writeFile } from './fs.js';
import type { Formatter } from './initial-parameters.js';
import { wrapError } from './misc-utils.js';
import { readPackageManifest } from './package-manifest.js';
import type { Package } from './package.js';
import { getFormatter, updatePackage } from './package.js';
import type { Project } from './project.js';

const RECOVERY_MESSAGE =
  'The release could not be completed. Changesets that were only partly released have been restored. Discard the remaining uncommitted changes (git restore . && git clean -fd .changeset), then run this tool again to resume from the release spec.';

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
    const changelog = parseChangelog({
      changelogContent: await readFile(changelogPath),
      repoUrl: project.repositoryUrl,
      tagPrefix: `${name}@`,
      formatter: getFormatter(formatter),
      changesets: true,
    });
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
 * Applies a Changesets release to the project: bumps versions and internal
 * ranges, writes the changelogs, deletes the consumed Changesets, releases the
 * packages that only have legacy `Unreleased` entries, and bumps the root
 * package. Changesets that are only partly released are then restored with
 * their remaining releases, even if the release fails.
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.plan - The loaded Changesets plan.
 * @param args.releasePlan - The release plan built from the release spec.
 * @param args.newReleaseVersion - The new version of the root package.
 * @param args.formatter - The formatter to use for formatting the changelogs.
 * @param args.stderr - A stream that can be used to write to standard error.
 * @throws If any step fails. The error explains how to recover, and its cause
 * is the original error (an `AggregateError` if the restoration failed too).
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
  const errors: unknown[] = [];

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
    errors.push(error);
  }

  try {
    await restoreResidualChangesets({
      changesetDir: path.join(project.directoryPath, '.changeset'),
      changesets: plan.originalChangesets,
      releasedPackageNames: releasePlan.filteredPlan.releases.map(
        ({ name }) => name,
      ),
    });
  } catch (error) {
    errors.push(error);
  }

  if (errors.length > 0) {
    throw wrapError(
      RECOVERY_MESSAGE,
      errors.length === 1
        ? errors[0]
        : new AggregateError(
            errors,
            'The release failed, then restoring the Changesets failed too.',
          ),
    );
  }
}
