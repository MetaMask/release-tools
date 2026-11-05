import { SemVer } from 'semver';

import type { Notice } from '../../core/notices.js';
import type { Formatter, VersionSpecifiers } from '../../core/types.js';
import { updatePackage } from '../../project/package.js';
import type { PackageReleasePlan } from '../../project/package.js';
import { buildChangelogNotices, Project } from '../../project/project.js';
import { debug } from '../../utils/misc-utils.js';

/**
 * Instructions for how to update the project in order to prepare it for a new
 * release.
 *
 * @property newVersion - The new version that should be released, encompassing
 * one or more updates to packages within the project. This is always a
 * SemVer-compatible string, though the meaning of each number depends on the
 * type of project. For a polyrepo package or a monorepo with fixed versions,
 * the format of the version string is "MAJOR.MINOR.PATCH"; for a monorepo with
 * independent versions, it is "ORDINARY.BACKPORT.0", where `BACKPORT` is used
 * to name a release that sits between two ordinary releases, and `ORDINARY` is
 * used to name any other (non-backport) release.
 * @property packages - Describes how the packages in the project should be
 * updated. For a polyrepo package, this list will only contain the package
 * itself; for a monorepo package it will consist of the root package and any
 * workspace packages that will be included in the release.
 */
export type ReleasePlan = {
  newVersion: string;
  packages: PackageReleasePlan[];
};

/**
 * Uses the release specification to calculate the final versions of the
 * workspace packages that we want to update.
 *
 * @param args - The arguments.
 * @param args.project - Information about the whole project (e.g., names of
 * packages and where they can found).
 * @param args.releaseSpecificationPackages - A parsed version of the release spec
 * entered by the user.
 * @returns Information about the workspace packages in the new release.
 */
export function planWorkspacePackageReleases({
  project,
  releaseSpecificationPackages,
}: {
  project: Project;
  releaseSpecificationPackages: VersionSpecifiers;
}): PackageReleasePlan[] {
  return Object.keys(releaseSpecificationPackages).map((packageName) => {
    const pkg = project.workspacePackages[packageName];
    const versionSpecifier = releaseSpecificationPackages[packageName];
    const currentVersion = pkg.validatedManifest.version;
    const newVersion =
      versionSpecifier instanceof SemVer
        ? versionSpecifier
        : new SemVer(currentVersion.toString()).inc(versionSpecifier);

    return {
      package: pkg,
      newVersion: newVersion.toString(),
    };
  });
}

/**
 * Uses the release specification to calculate the final versions of all of the
 * packages that we want to update.
 *
 * @param args - The arguments.
 * @param args.project - Information about the whole project (e.g., names of
 * packages and where they can found).
 * @param args.releaseSpecificationPackages - A parsed version of the release spec
 * entered by the user.
 * @param args.newReleaseVersion - The new release version.
 * @returns A promise for information about the new release.
 */
export async function planRelease({
  project,
  releaseSpecificationPackages,
  newReleaseVersion,
}: {
  project: Project;
  releaseSpecificationPackages: VersionSpecifiers;
  newReleaseVersion: string;
}): Promise<ReleasePlan> {
  const rootReleasePlan: PackageReleasePlan = {
    package: project.rootPackage,
    newVersion: newReleaseVersion,
  };

  return {
    newVersion: newReleaseVersion,
    packages: [
      rootReleasePlan,
      ...planWorkspacePackageReleases({
        project,
        releaseSpecificationPackages,
      }),
    ],
  };
}

/**
 * Bumps versions of packages within the monorepo according to the release plan.
 *
 * @param project - Information about the whole project (e.g., names of packages
 * and where they can found).
 * @param releasePlan - Compiled instructions on how exactly to update the
 * project in order to prepare a new release.
 * @param formatter - The formatter to use for formatting the changelog.
 * @returns The packages without a changelog as notices, leaving out the root
 * package.
 */
export async function executeReleasePlan(
  project: Project,
  releasePlan: ReleasePlan,
  formatter: Formatter,
): Promise<Notice[]> {
  const results = await Promise.all(
    releasePlan.packages.map(async (workspaceReleasePlan) => {
      const { name } = workspaceReleasePlan.package.validatedManifest;
      debug(`Updating package ${name}...`);
      return {
        isRoot: workspaceReleasePlan.package === project.rootPackage,
        name,
        result: await updatePackage({
          project,
          packageReleasePlan: workspaceReleasePlan,
          formatter,
        }),
      };
    }),
  );
  return buildChangelogNotices(results.filter(({ isRoot }) => !isRoot));
}
