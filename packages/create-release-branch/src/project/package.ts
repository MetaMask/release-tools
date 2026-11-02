import {
  oxfmt,
  parseChangelog,
  prettier,
  updateChangelog,
} from '@metamask/auto-changelog';
import { assertExhaustive } from '@metamask/utils';
import path from 'path';
import { format } from 'util';

import type { CliOutput } from '../core/cli-output.js';
import { hasChangesInDirectorySinceGitTag } from '../core/repo.js';
import type { Formatter } from '../core/types.js';
import type { PackageReleasePlan } from '../modes/legacy/release-plan.js';
import { readFile, writeFile, writeJsonFile } from '../utils/fs.js';
import { isErrorWithCode } from '../utils/misc-utils.js';
import { SemVer } from '../utils/semver.js';
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
 * @property manifest - The data extracted from the manifest.
 * @property changelogPath - The path to the changelog file (which may or may
 * not exist).
 */
export type Package = {
  directoryPath: string;
  manifestPath: string;
  unvalidatedManifest: UnvalidatedPackageManifest;
  validatedManifest: ValidatedPackageManifest;
  changelogPath: string;
  hasChangesSinceLatestRelease: boolean;
};

/**
 * Generates the possible Git tag name for the root package of a monorepo. The
 * only tag name in use at this time is "v" + the package version.
 *
 * @param packageVersion - The version of the package.
 * @returns An array of possible release tag names.
 */
function generateMonorepoRootPackageReleaseTagName(
  packageVersion: string,
): string {
  return `v${packageVersion}`;
}

/**
 * Generates a possible Git tag name for the workspace package of a monorepo.
 * Accounts for changes to `action-publish-release`, which going forward will
 * generate tags for workspace packages in `PACKAGE_NAME@MAJOR.MINOR.PATCH`.
 *
 * @param packageName - The name of the package.
 * @param packageVersion - The version of the package.
 * @returns An array of possible release tag names.
 */
function generateMonorepoWorkspacePackageReleaseTagName(
  packageName: string,
  packageVersion: string,
): string {
  return `${packageName}@${packageVersion}`;
}

/**
 * Collects information about the root package of a monorepo.
 *
 * @param args - The arguments to this function.
 * @param args.packageDirectoryPath - The path to a package within a project.
 * @param args.projectDirectoryPath - The path to the project directory.
 * @param args.projectTagNames - The tag names across the whole project.
 * @returns Information about the package.
 */
export async function readMonorepoRootPackage({
  packageDirectoryPath,
  projectDirectoryPath,
  projectTagNames,
}: {
  packageDirectoryPath: string;
  projectDirectoryPath: string;
  projectTagNames: string[];
}): Promise<Package> {
  const manifestPath = path.join(packageDirectoryPath, MANIFEST_FILE_NAME);
  const changelogPath = path.join(packageDirectoryPath, CHANGELOG_FILE_NAME);
  const { unvalidated: unvalidatedManifest, validated: validatedManifest } =
    await readPackageManifest(manifestPath);
  const expectedTagNameForLatestRelease =
    generateMonorepoRootPackageReleaseTagName(
      validatedManifest.version.toString(),
    );
  const matchingTagNameForLatestRelease = projectTagNames.find(
    (tagName) => tagName === expectedTagNameForLatestRelease,
  );

  if (
    projectTagNames.length > 0 &&
    matchingTagNameForLatestRelease === undefined
  ) {
    throw new Error(
      format(
        'The package %s has no Git tag for its current version %s (expected %s), so this tool is unable to determine whether it should be included in this release. You will need to create a tag for this package in order to proceed.',
        validatedManifest.name,
        validatedManifest.version,
        `"${expectedTagNameForLatestRelease}"`,
      ),
    );
  }

  const hasChangesSinceLatestRelease =
    matchingTagNameForLatestRelease === undefined
      ? true
      : await hasChangesInDirectorySinceGitTag(
          projectDirectoryPath,
          packageDirectoryPath,
          expectedTagNameForLatestRelease,
        );

  return {
    directoryPath: packageDirectoryPath,
    manifestPath,
    validatedManifest,
    unvalidatedManifest,
    changelogPath,
    hasChangesSinceLatestRelease,
  };
}

/**
 * Collects information about a workspace package within a monorepo.
 *
 * @param args - The arguments to this function.
 * @param args.packageDirectoryPath - The path to a package within a project.
 * @param args.rootPackageName - The name of the root package within the
 * monorepo to which this package belongs.
 * @param args.rootPackageVersion - The version of the root package within the
 * monorepo to which this package belongs.
 * @param args.projectDirectoryPath - The path to the project directory.
 * @param args.projectTagNames - The tag names across the whole project.
 * @param args.output - Where to write user-facing messages.
 * @returns Information about the package.
 */
export async function readMonorepoWorkspacePackage({
  packageDirectoryPath,
  rootPackageName,
  rootPackageVersion,
  projectDirectoryPath,
  projectTagNames,
  output,
}: {
  packageDirectoryPath: string;
  rootPackageName: string;
  rootPackageVersion: SemVer;
  projectDirectoryPath: string;
  projectTagNames: string[];
  output: CliOutput;
}): Promise<Package> {
  const manifestPath = path.join(packageDirectoryPath, MANIFEST_FILE_NAME);
  const changelogPath = path.join(packageDirectoryPath, CHANGELOG_FILE_NAME);
  const { unvalidated: unvalidatedManifest, validated: validatedManifest } =
    await readPackageManifest(manifestPath);
  const expectedTagNameForWorkspacePackageLatestRelease =
    generateMonorepoWorkspacePackageReleaseTagName(
      validatedManifest.name,
      validatedManifest.version.toString(),
    );
  const expectedTagNameForRootPackageLatestRelease =
    generateMonorepoRootPackageReleaseTagName(rootPackageVersion.toString());
  const matchingTagNameForWorkspacePackageLatestRelease = projectTagNames.find(
    (tagName) => tagName === expectedTagNameForWorkspacePackageLatestRelease,
  );
  const matchingTagNameForRootPackageLatestRelease = projectTagNames.find(
    (tagName) => tagName === expectedTagNameForRootPackageLatestRelease,
  );
  const matchingTagNameForLatestRelease =
    matchingTagNameForWorkspacePackageLatestRelease ??
    matchingTagNameForRootPackageLatestRelease;

  if (
    projectTagNames.length > 0 &&
    matchingTagNameForLatestRelease === undefined
  ) {
    throw new Error(
      format(
        'The current release of workspace package %s, %s, has no corresponding Git tag %s, and the current release of root package %s, %s, has no tag %s. Hence, this tool is unable to know whether the workspace package changed and should be included in this release. You will need to create tags for both of these packages in order to proceed.',
        validatedManifest.name,
        validatedManifest.version,
        `"${expectedTagNameForWorkspacePackageLatestRelease}"`,
        rootPackageName,
        rootPackageVersion,
        `"${expectedTagNameForRootPackageLatestRelease}"`,
      ),
    );
  }

  if (
    matchingTagNameForWorkspacePackageLatestRelease === undefined &&
    matchingTagNameForRootPackageLatestRelease !== undefined
  ) {
    output.warn(
      format(
        'WARNING: Could not determine changes for workspace package %s version %s based on Git tag %s; using tag for root package %s version %s, %s, instead.\n',
        validatedManifest.name,
        validatedManifest.version,
        `"${expectedTagNameForWorkspacePackageLatestRelease}"`,
        rootPackageName,
        rootPackageVersion,
        `"${expectedTagNameForRootPackageLatestRelease}"`,
      ),
    );
  }

  const hasChangesSinceLatestRelease =
    matchingTagNameForLatestRelease === undefined
      ? true
      : await hasChangesInDirectorySinceGitTag(
          projectDirectoryPath,
          packageDirectoryPath,
          matchingTagNameForLatestRelease,
        );

  return {
    directoryPath: packageDirectoryPath,
    manifestPath,
    validatedManifest,
    unvalidatedManifest,
    changelogPath,
    hasChangesSinceLatestRelease,
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
 * @param args.output - Where to write user-facing messages.
 * @returns The result of writing to the changelog.
 */
export async function migrateUnreleasedChangelogChangesToRelease({
  project: { repositoryUrl },
  package: pkg,
  version,
  formatter,
  output,
}: {
  project: Pick<Project, 'directoryPath' | 'repositoryUrl'>;
  package: Package;
  version: string;
  formatter: Formatter;
  output: CliOutput;
}): Promise<void> {
  let changelogContent;

  try {
    changelogContent = await readFile(pkg.changelogPath);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      output.warn(
        `${pkg.validatedManifest.name} does not seem to have a changelog. Skipping.\n`,
      );
      return;
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
 * @param args.output - Where to write user-facing messages.
 * @returns The result of writing to the changelog.
 */
export async function updatePackageChangelog({
  project: { repositoryUrl },
  package: pkg,
  formatter,
  output,
}: {
  project: Pick<Project, 'directoryPath' | 'repositoryUrl'>;
  package: Package;
  formatter: Formatter;
  output: CliOutput;
}): Promise<void> {
  let changelogContent;

  try {
    changelogContent = await readFile(pkg.changelogPath);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      output.warn(
        `${pkg.validatedManifest.name} does not seem to have a changelog. Skipping.\n`,
      );
      return;
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

  if (newChangelogContent) {
    await writeFile(pkg.changelogPath, newChangelogContent);
  } else {
    output.warn(
      `Changelog for ${pkg.validatedManifest.name} was not updated as there were no updates to make.`,
    );
  }
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
 * @param args.output - Where to write user-facing messages.
 */
export async function updatePackage({
  project,
  packageReleasePlan,
  formatter,
  output,
}: {
  project: Pick<Project, 'directoryPath' | 'repositoryUrl'>;
  packageReleasePlan: PackageReleasePlan;
  formatter: Formatter;
  output: CliOutput;
}): Promise<void> {
  const { package: pkg, newVersion } = packageReleasePlan;

  await writeJsonFile(pkg.manifestPath, {
    ...pkg.unvalidatedManifest,
    version: newVersion,
  });

  await migrateUnreleasedChangelogChangesToRelease({
    project,
    package: pkg,
    formatter,
    output,
    version: newVersion,
  });
}
