import type { ComprehensiveRelease } from '@changesets/types';

import type { Candidate, CandidateKind } from '../../core/candidates.js';
import type { Project } from '../../project/project.js';
import type { ChangesetsState } from './load.js';

/**
 * A release that bumps the version of its package.
 */
export type BumpingRelease = Exclude<ComprehensiveRelease, { type: 'none' }>;

const KIND_ORDER: CandidateKind[] = ['changes', 'dependency'];

/**
 * Compares two strings by code unit, whatever the locale.
 *
 * @param left - The first string.
 * @param right - The second string.
 * @returns A negative number, zero, or a positive number.
 */
export function compareNames(left: string, right: string): number {
  return Number(left > right) - Number(left < right);
}

/**
 * Determines whether a release bumps the version of its package.
 *
 * @param release - The release.
 * @returns Whether the release type is not `none`.
 */
export function isBumpingRelease(
  release: ComprehensiveRelease,
): release is BumpingRelease {
  return release.type !== 'none';
}

/**
 * Lists the packages that the full release plan bumps.
 *
 * @param project - The project.
 * @param state - The Changesets state.
 * @returns The candidates, grouped by kind and sorted by name.
 */
export function listChangesetsCandidates(
  project: Project,
  state: ChangesetsState,
): Candidate[] {
  return state.fullPlan.releases
    .filter(isBumpingRelease)
    .map(({ name, newVersion }): Candidate => {
      const currentVersion =
        project.workspacePackages[name].validatedManifest.version.version;
      const changeCount = state.fullPlan.changesets.filter(({ releases }) =>
        releases.some(
          (release) => release.name === name && release.type !== 'none',
        ),
      ).length;
      return changeCount > 0
        ? {
            name,
            currentVersion,
            plannedVersion: newVersion,
            kind: 'changes',
            changeCount,
          }
        : {
            name,
            currentVersion,
            plannedVersion: newVersion,
            kind: 'dependency',
          };
    })
    .sort(
      (left, right) =>
        KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind) ||
        compareNames(left.name, right.name),
    );
}
