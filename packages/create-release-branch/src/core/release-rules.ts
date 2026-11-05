import { diff } from 'semver';

import type { Package } from '../project/package.js';
import type { Project } from '../project/project.js';
import { hasProperty } from '../utils/misc-utils.js';
import { isValidSemver, semver, SemVer } from '../utils/semver.js';
import type { VersionSpecifiers } from './types.js';

/**
 * The SemVer-compatible parts of a version string that can be bumped by this
 * tool.
 */
export const IncrementableVersionParts = {
  major: 'major',
  minor: 'minor',
  patch: 'patch',
} as const;

export type IncrementableVersionPart =
  (typeof IncrementableVersionParts)[keyof typeof IncrementableVersionParts];

export const SKIP_PACKAGE_DIRECTIVE = null;
const INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE = 'intentionally-skip';

/**
 * The maintainer's choice for each package, as given: a bump type, an exact
 * version, `intentionally-skip`, or `null`.
 */
export type ReleaseChoices = Record<string, string | null>;

/**
 * The packages that a choice requires but that are missing from the choices.
 *
 * @property missingDirectDependentNames - Direct dependents of a package that
 * is being released with a major version bump.
 * @property missingPeerDependentNames - Peer dependents of a package that is
 * being released with a major version bump.
 * @property missingDependencies - Dependencies or peer dependencies that have
 * changes since their latest release.
 */
export type DependencyFinding = {
  missingDirectDependentNames: string[];
  missingPeerDependentNames: string[];
  missingDependencies: string[];
};

/**
 * A problem with the release choices.
 *
 * @property packageName - The name of the package that the problem is about.
 * @property entryIndex - The index of the choice in `Object.entries(choices)`,
 * for problems that point at a single entry.
 * @property problem - What is wrong, written to follow the package name.
 * @property hint - How to fix it.
 */
export type ReleaseChoiceError = {
  packageName?: string;
  entryIndex?: number;
  problem: string;
  hint?: string;
};

/**
 * Finds all workspace packages that have the given package under a particular
 * "dependencies" section.
 *
 * @param project - The project containing workspace packages.
 * @param packageName - The name of the package to find dependents for.
 * @param type - The section in which to look for the package.
 * @returns An array of package names.
 */
export function findWorkspaceDependentNamesOfType(
  project: Project,
  packageName: string,
  type: 'dependencies' | 'peerDependencies',
): string[] {
  return Object.keys(project.workspacePackages).filter(
    (possibleDependentName) => {
      const possibleDependent =
        project.workspacePackages[possibleDependentName];
      return hasProperty(
        possibleDependent.validatedManifest[type],
        packageName,
      );
    },
  );
}

/**
 * Finds all workspace packages that list the package in a particular
 * "dependencies" section but are missing from the release choices.
 *
 * @param project - The project containing workspace packages.
 * @param packageName - The name of the package to find dependents for.
 * @param choices - The release choices.
 * @param type - The type of dependents to find for.
 * @returns An array of package names.
 */
function findMissingWorkspaceDependentNamesOfType(
  project: Project,
  packageName: string,
  choices: ReleaseChoices,
  type: 'dependencies' | 'peerDependencies',
): string[] {
  const dependentNames = findWorkspaceDependentNamesOfType(
    project,
    packageName,
    type,
  );

  return dependentNames.filter((dependentName) => {
    return !choices[dependentName];
  });
}

/**
 * Finds all workspace packages that are direct or peer dependencies of the
 * given package and have changes since their latest release.
 *
 * @param changedPackage - The package to find dependencies for.
 * @param choices - The release choices.
 * @param packagesWithChanges - The names of the packages that have changes
 * since their latest release.
 * @returns An array of package names.
 */
function findMissingUnreleasedDependencies(
  changedPackage: Package,
  choices: ReleaseChoices,
  packagesWithChanges: ReadonlySet<string>,
): string[] {
  return Object.keys({
    ...changedPackage.validatedManifest.dependencies,
    ...changedPackage.validatedManifest.peerDependencies,
  }).filter((dependency) => {
    return packagesWithChanges.has(dependency) && !choices[dependency];
  });
}

/**
 * Finds the direct or peer dependents of a major-bumped package that are
 * candidates for inclusion in the release.
 *
 * @param project - Information about the whole project (e.g., names of packages
 * and where they can be found).
 * @param packageName - The name of the package to validate.
 * @param versionSpecifierOrDirective - The version specifier or directive for
 * the package.
 * @param choices - The release choices.
 * @param type - The type of dependents to search for.
 * @returns An array of direct dependents for the package.
 */
function findCandidateDependentsOfTypeForMajorBump(
  project: Project,
  packageName: string,
  versionSpecifierOrDirective: string | null,
  choices: ReleaseChoices,
  type: 'dependencies' | 'peerDependencies',
): string[] {
  const changedPackage = project.workspacePackages[packageName];

  if (
    versionSpecifierOrDirective === 'major' ||
    (isValidSemver(versionSpecifierOrDirective) &&
      diff(
        changedPackage.validatedManifest.version,
        versionSpecifierOrDirective,
      ) === 'major')
  ) {
    return findMissingWorkspaceDependentNamesOfType(
      project,
      packageName,
      choices,
      type,
    );
  }

  return [];
}

/**
 * For a package being included in the release, finds all direct peer or
 * dependencies that have changes since their last release but have not been
 * added to the release yet.
 *
 * @param changedPackage - The package to validate.
 * @param versionSpecifierOrDirective - The version specifier or directive for the package.
 * @param choices - The release choices.
 * @param packagesWithChanges - The names of the packages that have changes
 * since their latest release.
 * @returns An array of package names.
 */
function findCandidateDependencies(
  changedPackage: Package,
  versionSpecifierOrDirective: string | null,
  choices: ReleaseChoices,
  packagesWithChanges: ReadonlySet<string>,
): string[] {
  if (
    changedPackage &&
    versionSpecifierOrDirective &&
    (hasProperty(IncrementableVersionParts, versionSpecifierOrDirective) ||
      isValidSemver(versionSpecifierOrDirective))
  ) {
    return findMissingUnreleasedDependencies(
      changedPackage,
      choices,
      packagesWithChanges,
    );
  }

  return [];
}

/**
 * Checks the release choices against the project: the names of the packages,
 * the version specifiers, and the dependencies and dependents that must be
 * released with them.
 *
 * @param project - Information about the whole project (e.g., names of packages
 * and where they can be found).
 * @param choices - The release choices.
 * @param options - The options.
 * @param options.packagesWithChanges - The names of the packages that have
 * changes since their latest release. Defaults to the workspace packages that
 * have changes since their latest release.
 * @returns The problems with the choices, and the missing dependencies and
 * dependents for each package that has any.
 */
export function checkReleaseChoices(
  project: Project,
  choices: ReleaseChoices,
  {
    packagesWithChanges = new Set(
      Object.keys(project.workspacePackages).filter(
        (packageName) =>
          project.workspacePackages[packageName].hasChangesSinceLatestRelease,
      ),
    ),
  }: { packagesWithChanges?: ReadonlySet<string> } = {},
): {
  errors: ReleaseChoiceError[];
  dependencyFindings: Record<string, DependencyFinding>;
} {
  const errors: ReleaseChoiceError[] = [];
  const dependencyFindingEntries: [string, DependencyFinding][] = [];

  Object.entries(choices).forEach(
    ([changedPackageName, versionSpecifierOrDirective], entryIndex) => {
      const changedPackage = project.workspacePackages[changedPackageName];

      if (changedPackage === undefined) {
        errors.push({
          packageName: changedPackageName,
          entryIndex,
          problem: 'is not a package in the project',
          hint: 'Check the name, or remove the line.',
        });
        return;
      }

      if (
        versionSpecifierOrDirective !== SKIP_PACKAGE_DIRECTIVE &&
        versionSpecifierOrDirective !== INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE &&
        !hasProperty(IncrementableVersionParts, versionSpecifierOrDirective) &&
        !isValidSemver(versionSpecifierOrDirective)
      ) {
        errors.push({
          packageName: changedPackageName,
          entryIndex,
          problem: `"${
            typeof versionSpecifierOrDirective === 'string'
              ? versionSpecifierOrDirective
              : JSON.stringify(versionSpecifierOrDirective)
          }" is not a valid version specifier`,
          hint: 'Use major, minor, patch, or a version like 1.2.3.',
        });
      }

      if (isValidSemver(versionSpecifierOrDirective)) {
        const currentVersion = changedPackage.validatedManifest.version;
        const comparison = new SemVer(versionSpecifierOrDirective).compare(
          currentVersion,
        );

        if (comparison === 0) {
          errors.push({
            packageName: changedPackageName,
            entryIndex,
            problem: `is already at version ${versionSpecifierOrDirective}`,
            hint: 'Use a higher version, or major, minor, or patch.',
          });
        } else if (comparison < 0) {
          errors.push({
            packageName: changedPackageName,
            entryIndex,
            problem: `"${versionSpecifierOrDirective}" is lower than the current version ${String(currentVersion)}`,
            hint: 'Use a higher version, or major, minor, or patch.',
          });
        }
      }

      const missingDirectDependentNames =
        findCandidateDependentsOfTypeForMajorBump(
          project,
          changedPackageName,
          versionSpecifierOrDirective,
          choices,
          'dependencies',
        );

      if (missingDirectDependentNames.length > 0) {
        errors.push({
          packageName: changedPackageName,
          problem: `has a major bump, but its direct dependents are not in the release spec: ${missingDirectDependentNames.join(', ')}`,
          hint: 'Add them to the release spec, or set them to intentionally-skip.',
        });
      }

      const missingPeerDependentNames =
        findCandidateDependentsOfTypeForMajorBump(
          project,
          changedPackageName,
          versionSpecifierOrDirective,
          choices,
          'peerDependencies',
        );

      if (missingPeerDependentNames.length > 0) {
        errors.push({
          packageName: changedPackageName,
          problem: `has a major bump, but its peer dependents are not in the release spec: ${missingPeerDependentNames.join(', ')}`,
          hint: 'Add them so they stay compatible, or set them to intentionally-skip if they can wait.',
        });
      }

      const missingDependencies = findCandidateDependencies(
        changedPackage,
        versionSpecifierOrDirective,
        choices,
        packagesWithChanges,
      );

      if (missingDependencies.length > 0) {
        errors.push({
          packageName: changedPackageName,
          problem: `depends on packages with unreleased changes that are not in the release spec: ${missingDependencies.join(', ')}`,
          hint: 'Add them to the release spec, or set them to intentionally-skip if they can wait.',
        });
      }

      if (
        missingDirectDependentNames.length > 0 ||
        missingPeerDependentNames.length > 0 ||
        missingDependencies.length > 0
      ) {
        dependencyFindingEntries.push([
          changedPackageName,
          {
            missingDirectDependentNames,
            missingPeerDependentNames,
            missingDependencies,
          },
        ]);
      }
    },
  );

  return {
    errors,
    dependencyFindings: Object.fromEntries(dependencyFindingEntries),
  };
}

/**
 * Converts release choices into the packages of a release specification. It
 * leaves out the packages that are skipped (`null` or "intentionally-skip").
 *
 * @param choices - The release choices. They must have passed
 * `checkReleaseChoices` without errors.
 * @returns The version specifier for each package to release.
 */
export function normalizeReleaseChoices(
  choices: ReleaseChoices,
): VersionSpecifiers {
  return Object.keys(choices).reduce<VersionSpecifiers>((obj, packageName) => {
    const versionSpecifierOrDirective = choices[packageName];

    if (
      versionSpecifierOrDirective !== SKIP_PACKAGE_DIRECTIVE &&
      versionSpecifierOrDirective !== INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE
    ) {
      if (
        Object.values(IncrementableVersionParts).includes(
          // Typecast: It doesn't matter what type versionSpecifierOrDirective
          // is as we are checking for inclusion.
          versionSpecifierOrDirective as IncrementableVersionPart,
        )
      ) {
        return {
          ...obj,
          // Typecast: We know what this is as we've checked it above.
          [packageName]:
            versionSpecifierOrDirective as IncrementableVersionPart,
        };
      }

      return {
        ...obj,
        // Typecast: We know that this will safely parse.
        [packageName]: semver.parse(versionSpecifierOrDirective) as SemVer,
      };
    }

    return obj;
  }, {});
}
