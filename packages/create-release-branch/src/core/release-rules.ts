import { diff } from 'semver';
import YAML from 'yaml';

import type { Package } from '../project/package.js';
import type { Project } from '../project/project.js';
import type { ReleaseSpecification } from '../release-specification.js';
import { hasProperty } from '../utils/misc-utils.js';
import { isValidSemver, semver, SemVer } from '../utils/semver.js';

/**
 * The SemVer-compatible parts of a version string that can be bumped by this
 * tool.
 */
export enum IncrementableVersionParts {
  major = 'major',
  minor = 'minor',
  patch = 'patch',
}

const SKIP_PACKAGE_DIRECTIVE = null;
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
 * @property message - The message, as a single string or as separate lines.
 * @property entryIndex - The index of the choice in `Object.entries(choices)`,
 * for problems that point at a single entry.
 */
export type ReleaseChoiceError = {
  message: string | string[];
  entryIndex?: number;
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
 * and where they can found).
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
 * Builds the YAML example, indented for an error message, that lists the
 * given packages with the "intentionally-skip" directive.
 *
 * @param packageNames - The names of the packages to list.
 * @returns The indented YAML example.
 */
function buildIntentionallySkipExample(packageNames: string[]): string {
  return YAML.stringify({
    packages: packageNames.reduce(
      (object, packageName) => ({
        ...object,
        [packageName]: INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE,
      }),
      {},
    ),
  })
    .trim()
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}

/**
 * Checks the release choices against the project: the names of the packages,
 * the version specifiers, and the dependencies and dependents that must be
 * released with them.
 *
 * @param project - Information about the whole project (e.g., names of packages
 * and where they can found).
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
          message: `${JSON.stringify(changedPackageName)} is not a package in the project`,
          entryIndex,
        });
      }

      if (
        versionSpecifierOrDirective !== SKIP_PACKAGE_DIRECTIVE &&
        versionSpecifierOrDirective !== INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE &&
        !hasProperty(IncrementableVersionParts, versionSpecifierOrDirective) &&
        !isValidSemver(versionSpecifierOrDirective)
      ) {
        errors.push({
          message: [
            `${JSON.stringify(versionSpecifierOrDirective)} is not a valid version specifier for package "${changedPackageName}"`,
            `(must be "major", "minor", or "patch"; or a version string with major, minor, and patch parts, such as "1.2.3")`,
          ],
          entryIndex,
        });
      }

      if (isValidSemver(versionSpecifierOrDirective)) {
        const comparison = new SemVer(versionSpecifierOrDirective).compare(
          changedPackage.validatedManifest.version,
        );

        if (comparison === 0) {
          errors.push({
            message: [
              `${JSON.stringify(versionSpecifierOrDirective)} is not a valid version specifier for package "${changedPackageName}"`,
              `("${changedPackageName}" is already at version "${versionSpecifierOrDirective}")`,
            ],
            entryIndex,
          });
        } else if (comparison < 0) {
          errors.push({
            message: [
              `${JSON.stringify(versionSpecifierOrDirective)} is not a valid version specifier for package "${changedPackageName}"`,
              `("${changedPackageName}" is at a greater version "${String(
                project.workspacePackages[changedPackageName].validatedManifest
                  .version,
              )}")`,
            ],
            entryIndex,
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
          message: [
            `The following direct dependents of package '${changedPackageName}', which is being released with a major version bump, are missing from the release spec.`,
            missingDirectDependentNames
              .map((dependent) => `  - ${dependent}`)
              .join('\n'),
            `  Consider including them in the release spec so that the dependency tree of consuming projects can be kept small.`,
            `  If you do not want to do this, then list it with a directive of "intentionally-skip". For example:`,
            buildIntentionallySkipExample(missingDirectDependentNames),
          ].join('\n\n'),
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
          message: [
            `The following dependents of package '${changedPackageName}', which is being released with a major version bump, are missing from the release spec.`,
            missingPeerDependentNames
              .map((dependent) => `  - ${dependent}`)
              .join('\n'),
            `  Consider including them in the release spec so that they are compatible with the new '${changedPackageName}' version.`,
            `  If you are ABSOLUTELY SURE these packages are safe to omit, however, and want to postpone the release of a package, then list it with a directive of "intentionally-skip". For example:`,
            buildIntentionallySkipExample(missingPeerDependentNames),
          ].join('\n\n'),
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
          message: [
            `The following packages, which are dependencies or peer dependencies of the package '${changedPackageName}' being released, are missing from the release spec.`,
            missingDependencies
              .map((dependency) => `  - ${dependency}`)
              .join('\n'),
            `  These packages may have changes that '${changedPackageName}' relies upon. Consider including them in the release spec.`,
            `  If you are ABSOLUTELY SURE these packages are safe to omit, however, and want to postpone the release of a package, then list it with a directive of "intentionally-skip". For example:`,
            buildIntentionallySkipExample(missingDependencies),
          ].join('\n\n'),
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
): ReleaseSpecification['packages'] {
  return Object.keys(choices).reduce<ReleaseSpecification['packages']>(
    (obj, packageName) => {
      const versionSpecifierOrDirective = choices[packageName];

      if (
        versionSpecifierOrDirective !== SKIP_PACKAGE_DIRECTIVE &&
        versionSpecifierOrDirective !== INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE
      ) {
        if (
          Object.values(IncrementableVersionParts).includes(
            // Typecast: It doesn't matter what type versionSpecifierOrDirective
            // is as we are checking for inclusion.
            versionSpecifierOrDirective as IncrementableVersionParts,
          )
        ) {
          return {
            ...obj,
            // Typecast: We know what this is as we've checked it above.
            [packageName]:
              versionSpecifierOrDirective as IncrementableVersionParts,
          };
        }

        return {
          ...obj,
          // Typecast: We know that this will safely parse.
          [packageName]: semver.parse(versionSpecifierOrDirective) as SemVer,
        };
      }

      return obj;
    },
    {},
  );
}
