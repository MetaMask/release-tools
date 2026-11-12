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
  if (left > right) {
    return 1;
  }
  if (left < right) {
    return -1;
  }
  return 0;
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
 * Builds a candidate for a bumping release.
 *
 * @param release - The bumping release.
 * @param state - The Changesets state.
 * @param project - The project.
 * @returns The candidate.
 */
function buildCandidate(
  release: BumpingRelease,
  state: ChangesetsState,
  project: Project,
): Candidate {
  const { name, newVersion } = release;
  const currentVersion =
    project.workspacePackages[name].validatedManifest.version.version;
  const changeCount = state.releasePlan.changesets.filter(({ releases }) =>
    releases.some(
      (changesetRelease) =>
        changesetRelease.name === name && changesetRelease.type !== 'none',
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
}

/**
 * Gets the candidates that the release plan bumps.
 *
 * @param state - The Changesets state.
 * @param project - The project.
 * @returns The candidates, grouped by kind and sorted by name.
 */
export function getChangesetsCandidates(
  state: ChangesetsState,
  project: Project,
): Candidate[] {
  return state.releasePlan.releases
    .filter(isBumpingRelease)
    .map((release) => buildCandidate(release, state, project))
    .sort(
      (left, right) =>
        KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind) ||
        compareNames(left.name, right.name),
    );
}
