import type { ComprehensiveRelease, VersionType } from '@changesets/types';
import path from 'node:path';
/**
 * Shared utility functions and business logic
 */
import semverSatisfies from 'semver/functions/satisfies.js';
import validRange from 'semver/ranges/valid.js';

const bumpTypes = ['none', 'patch', 'minor', 'major'];

/* Converts a bump type into a numeric level to indicate order */
function getBumpLevel(type: VersionType): number {
  const level = bumpTypes.indexOf(type);
  if (level < 0) {
    throw new Error(`Unrecognised bump type ${type}`);
  }
  return level;
}

export function shouldUpdateDependencyBasedOnConfig(
  cwd: string,
  release: ComprehensiveRelease & { dir: string },
  {
    depVersionRange,
    depType,
  }: {
    depVersionRange: string;
    depType:
      | 'dependencies'
      | 'devDependencies'
      | 'peerDependencies'
      | 'optionalDependencies';
  },
  {
    minReleaseType,
    onlyUpdatePeerDependentsWhenOutOfRange,
  }: {
    minReleaseType: 'patch' | 'minor';
    onlyUpdatePeerDependentsWhenOutOfRange: boolean;
  },
): boolean {
  if (release.newVersion === null || release.newVersion === undefined) {
    return false;
  }
  let versionRange = depVersionRange;
  const usesWorkspaceRange = versionRange.startsWith('workspace:');
  if (usesWorkspaceRange) {
    versionRange = versionRange.replace(/^workspace:/u, '');
    switch (versionRange) {
      case '*':
        // given the old range was exact, we can short circuit and return true
        return true;
      case '^':
      case '~':
        versionRange = `${versionRange}${release.oldVersion}`;
        break;
      default: {
        if (!validRange(versionRange)) {
          return (
            path.posix.normalize(versionRange) ===
            path.relative(cwd, release.dir).replace(/\\/gu, '/')
          );
        }
        // fallthrough
      }
    }
  }
  if (!semverSatisfies(release.newVersion, versionRange)) {
    // Dependencies leaving semver range should always be updated
    return true;
  }

  const minLevel = getBumpLevel(minReleaseType);
  let shouldUpdate = getBumpLevel(release.type) >= minLevel;

  if (depType === 'peerDependencies') {
    shouldUpdate = !onlyUpdatePeerDependentsWhenOutOfRange;
  }
  return shouldUpdate;
}

export function capitalize(str: string): string {
  return str[0].toUpperCase() + str.slice(1);
}
