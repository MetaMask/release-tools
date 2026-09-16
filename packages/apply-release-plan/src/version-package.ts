import type { ComprehensiveRelease, PackageJSON } from '@changesets/types';
import SemverRange from 'semver/classes/range.js';
import semverInc from 'semver/functions/inc.js';
import semverPrerelease from 'semver/functions/prerelease.js';
import semverSatisfies from 'semver/functions/satisfies.js';
import validRange from 'semver/ranges/valid.js';

import type { EditJsonOperation } from './edit-json.js';
import { shouldUpdateDependencyBasedOnConfig } from './utils.js';

const DEPENDENCY_TYPES = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

type VersionToUpdate = ComprehensiveRelease & { dir: string };

export type DependencyUpdateOptions = {
  cwd: string;
  updateInternalDependencies: 'patch' | 'minor';
  onlyUpdatePeerDependentsWhenOutOfRange: boolean;
  bumpVersionsWithWorkspaceProtocolOnly?: boolean | undefined;
  snapshot?: string | boolean | undefined;
};

export function getDependencyVersionEdits(
  packageJson: PackageJSON,
  versionsToUpdate: VersionToUpdate[],
  {
    cwd,
    updateInternalDependencies,
    onlyUpdatePeerDependentsWhenOutOfRange,
    bumpVersionsWithWorkspaceProtocolOnly,
    snapshot,
  }: DependencyUpdateOptions,
): EditJsonOperation[] {
  const pkgJsonEdits: EditJsonOperation[] = [];

  for (const depType of DEPENDENCY_TYPES) {
    const deps = packageJson[depType];
    if (deps) {
      for (const release of versionsToUpdate) {
        const { name, newVersion, type } = release;
        if (
          newVersion === null ||
          newVersion === undefined ||
          type === 'none'
        ) {
          continue;
        }

        let depCurrentVersion = deps[name];
        if (
          !depCurrentVersion ||
          depCurrentVersion.startsWith('file:') ||
          depCurrentVersion.startsWith('link:') ||
          !shouldUpdateDependencyBasedOnConfig(
            cwd,
            release,
            {
              depVersionRange: depCurrentVersion,
              depType,
            },
            {
              minReleaseType: updateInternalDependencies,
              onlyUpdatePeerDependentsWhenOutOfRange,
            },
          )
        ) {
          continue;
        }
        const usesWorkspaceRange = depCurrentVersion.startsWith('workspace:');

        if (
          !usesWorkspaceRange &&
          (bumpVersionsWithWorkspaceProtocolOnly ||
            validRange(depCurrentVersion) === null)
        ) {
          continue;
        }

        if (usesWorkspaceRange) {
          const workspaceDepVersion = depCurrentVersion.replace(
            /^workspace:/u,
            '',
          );
          if (
            workspaceDepVersion === '*' ||
            workspaceDepVersion === '^' ||
            workspaceDepVersion === '~' ||
            validRange(workspaceDepVersion) === null
          ) {
            continue;
          }
          depCurrentVersion = workspaceDepVersion;
        }
        if (
          // an empty string is the normalised version of x/X/*
          // we don't want to change these versions because they will match
          // any version and if someone makes the range that
          // they probably want it to stay like that...
          new SemverRange(depCurrentVersion).range !== '' ||
          // ...unless the current version of a dependency is a prerelease (which doesn't satisfy x/X/*)
          // leaving those as is would leave the package in a non-installable state (wrong dep versions would get installed)
          semverPrerelease(newVersion) !== null
        ) {
          let newNewRange = snapshot
            ? newVersion
            : getNewDependencyRange(depCurrentVersion, newVersion, type);
          if (usesWorkspaceRange) {
            newNewRange = `workspace:${newNewRange}`;
          }
          pkgJsonEdits.push({ keys: [depType, name], value: newNewRange });
        }
      }
    }
  }

  return pkgJsonEdits;
}

function getNewDependencyRange(
  versionRange: string,
  newVersion: string,
  releaseType: 'major' | 'minor' | 'patch',
): string {
  const comparatorSets = new SemverRange(versionRange).set;
  // A union has multiple comparator sets and cannot be rewritten as one bounded range.
  const comparators = comparatorSets.length === 1 ? comparatorSets[0] : [];

  if (
    // A bounded range has exactly one lower and one upper comparator.
    comparators.length === 2 &&
    versionRange.includes('>') &&
    versionRange.includes('<')
  ) {
    const lowerBound = comparators.find(({ operator }) =>
      operator.startsWith('>'),
    );
    const upperBound = comparators.find(({ operator }) =>
      operator.startsWith('<'),
    );

    if (lowerBound && upperBound) {
      let newUpperBound = upperBound.value;
      if (!semverSatisfies(newVersion, newUpperBound)) {
        newUpperBound = `<${semverInc(newVersion, releaseType)}`;
      }

      return comparators[0] === lowerBound
        ? `>=${newVersion} ${newUpperBound}`
        : `${newUpperBound} >=${newVersion}`;
    }
  }

  return `${getVersionRangeType(versionRange)}${newVersion}`;
}

function getVersionRangeType(
  versionRange: string,
): '^' | '~' | '>=' | '<=' | '>' | '' {
  if (versionRange.startsWith('^')) {
    return '^';
  }
  if (versionRange.startsWith('~')) {
    return '~';
  }
  if (versionRange.startsWith('>=')) {
    return '>=';
  }
  if (versionRange.startsWith('<=')) {
    return '<=';
  }
  if (versionRange.startsWith('>')) {
    return '>';
  }
  return '';
}
