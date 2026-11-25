import {
  oxfmt,
  parseChangelog,
  prettier,
  updateChangelog,
} from '@metamask/auto-changelog';
import { assertExhaustive } from '@metamask/utils';
import path from 'path';

import type { Formatter } from '../core/types.js';
import { readFile, writeFile, writeJsonFile } from '../utils/fs.js';
import { isErrorWithCode } from '../utils/misc-utils.js';
import {
  readPackageManifest,
  UnvalidatedPackageManifest,
  ValidatedPackageManifest,
} from './package-manifest.js';
import { Project } from './project.js';

const MANIFEST_FILE_NAME = 'package.json';
const CHANGELOG_FILE_NAME = 'CHANGELOG.md';

/**
 * Information about a package within a project.
 *
 * @property directoryPath - The path to the directory where the package is
 * located.
 * @property manifestPath - The path to the manifest file.
 * @property unvalidatedManifest - The raw data extracted from the manifest.
 * @property validatedManifest - The validated data extracted from the manifest.
 * @property changelogPath - The path to the changelog file (which may or may
 * not exist).
 */
export type Package = {
  directoryPath: string;
  manifestPath: string;
  unvalidatedManifest: UnvalidatedPackageManifest;
  validatedManifest: ValidatedPackageManifest;
  changelogPath: string;
};

/**
 * Instructions for how to update a package within a project in order to prepare
 * it for a new release.
 *
 * @property package - Information about the package.
 * @property newVersion - The new version for the package, as a
 * SemVer-compatible string.
 */
export type PackageReleasePlan = {
  package: Package;
  newVersion: string;
};

/**
 * What happened to the changelog of a package: it was updated, the package
 * has no changelog, or there was nothing to add to it.
 */
export type ChangelogUpdateResult = 'updated' | 'no-changelog' | 'no-updates';

/**
 * Collects information about a package located at the given directory.
 *
 * @param packageDirectoryPath - The path to the package directory.
 * @returns Information about the package.
 */
export async function readPackage(
  packageDirectoryPath: string,
): Promise<Package> {
  const manifestPath = path.join(packageDirectoryPath, MANIFEST_FILE_NAME);
  const changelogPath = path.join(packageDirectoryPath, CHANGELOG_FILE_NAME);
  const { unvalidated: unvalidatedManifest, validated: validatedManifest } =
    await readPackageManifest(manifestPath);

  return {
    directoryPath: packageDirectoryPath,
    manifestPath,
    validatedManifest,
    unvalidatedManifest,
    changelogPath,
  };
}

/**
 * Get the formatting function for the given formatter name.
 *
 * @param formatter - The name of the formatter.
 * @returns The formatting function.
 */
export function getFormatter(
  formatter: 'oxfmt' | 'prettier',
): (changelog: string) => Promise<string> {
  switch (formatter) {
    case 'oxfmt':
      return oxfmt;

    case 'prettier':
      return prettier;

    default:
      return assertExhaustive(formatter);
  }
}

/**
 * Migrate all unreleased changes to a release section.
 *
 * Changes are migrated in their existing categories, and placed above any
 * pre-existing changes in that category.
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.project.repositoryUrl - The URL of the project's repository.
 * @param args.package - A particular package in the project.
 * @param args.version - The release version to migrate unreleased changes to.
 * @param args.formatter - The formatter to use for formatting the changelog.
 * @returns What happened to the changelog.
 */
export async function migrateUnreleasedChangelogChangesToRelease({
  project: { repositoryUrl },
  package: pkg,
  version,
  formatter,
}: {
  project: Pick<Project, 'directoryPath' | 'repositoryUrl'>;
  package: Package;
  version: string;
  formatter: Formatter;
}): Promise<ChangelogUpdateResult> {
  let changelogContent;

  try {
    changelogContent = await readFile(pkg.changelogPath);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      return 'no-changelog';
    }

    throw error;
  }

  const changelog = parseChangelog({
    changelogContent,
    repoUrl: repositoryUrl,
    tagPrefix: `${pkg.validatedManifest.name}@`,
    formatter: getFormatter(formatter),
  });

  changelog.addRelease({ version });
  changelog.migrateUnreleasedChangesToRelease(version);
  await writeFile(pkg.changelogPath, await changelog.toString());
  return 'updated';
}

/**
 * Updates the changelog file of the given package using
 * `@metamask/auto-changelog`. Assumes that the changelog file is located at the
 * package root directory and named "CHANGELOG.md".
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.project.repositoryUrl - The URL of the project's repository.
 * @param args.package - A particular package in the project.
 * @param args.formatter - The formatter to use for formatting the changelog.
 * @returns What happened to the changelog.
 */
export async function updatePackageChangelog({
  project: { repositoryUrl },
  package: pkg,
  formatter,
}: {
  project: Pick<Project, 'directoryPath' | 'repositoryUrl'>;
  package: Package;
  formatter: Formatter;
}): Promise<ChangelogUpdateResult> {
  let changelogContent;

  try {
    changelogContent = await readFile(pkg.changelogPath);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      return 'no-changelog';
    }

    throw error;
  }

  const newChangelogContent = await updateChangelog({
    changelogContent,
    // Setting `isReleaseCandidate` to false because `updateChangelog` requires a
    // specific version number when this flag is true, and the package release version
    // is not determined at this stage of the process.
    isReleaseCandidate: false,
    projectRootDirectory: pkg.directoryPath,
    repoUrl: repositoryUrl,
    tagPrefixes: [`${pkg.validatedManifest.name}@`, 'v'],
    formatter: getFormatter(formatter),
  });

  if (!newChangelogContent) {
    return 'no-updates';
  }

  await writeFile(pkg.changelogPath, newChangelogContent);
  return 'updated';
}

/**
 * Updates the package by replacing the `version` field in the manifest
 * according to the one in the given release plan. Also updates the
 * changelog by migrating changes in the Unreleased section to the section
 * representing the new version.
 *
 * @param args - The project.
 * @param args.project - The project.
 * @param args.packageReleasePlan - The release plan for a particular package in the
 * project.
 * @param args.formatter - The formatter to use for formatting the changelog.
 * @returns What happened to the changelog.
 */
export async function updatePackage({
  project,
  packageReleasePlan,
  formatter,
}: {
  project: Pick<Project, 'directoryPath' | 'repositoryUrl'>;
  packageReleasePlan: PackageReleasePlan;
  formatter: Formatter;
}): Promise<ChangelogUpdateResult> {
  const { package: pkg, newVersion } = packageReleasePlan;

  await writeJsonFile(pkg.manifestPath, {
    ...pkg.unvalidatedManifest,
    version: newVersion,
  });

  return await migrateUnreleasedChangelogChangesToRelease({
    project,
    package: pkg,
    formatter,
    version: newVersion,
  });
}
