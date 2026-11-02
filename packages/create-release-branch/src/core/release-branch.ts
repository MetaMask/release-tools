import type { Project } from '../project/project.js';
import { debug } from '../utils/misc-utils.js';
import {
  branchExists,
  getCurrentBranchName,
  runGitCommandWithin,
} from './repo.js';
import type { ReleaseType } from './types.js';

/**
 * Determines the version of the new release from the current release version
 * of the project.
 *
 * @param project - Information about the whole project (e.g., names of
 * packages and where they can be found).
 * @param releaseType - The type of release ("ordinary" or "backport"), which
 * affects how the version is bumped.
 * @returns The version of the new release.
 */
export function determineReleaseVersion(
  project: Project,
  releaseType: ReleaseType,
): string {
  return releaseType === 'backport'
    ? `${project.releaseVersion.ordinaryNumber}.${
        project.releaseVersion.backportNumber + 1
      }.0`
    : `${project.releaseVersion.ordinaryNumber + 1}.0.0`;
}

/**
 * Switches to the release branch for the given version, creating it if it does
 * not exist.
 *
 * @param project - Information about the whole project (e.g., names of
 * packages and where they can be found).
 * @param version - The version of the new release.
 * @returns A promise that resolves to an object with a boolean indicating
 * whether it's the first run (that is, whether the branch was created).
 */
export async function ensureReleaseBranch(
  project: Project,
  version: string,
): Promise<{ firstRun: boolean }> {
  const releaseBranchName = `release/${version}`;

  const currentBranchName = await getCurrentBranchName(project.directoryPath);

  if (currentBranchName === releaseBranchName) {
    debug(`Already on ${releaseBranchName} branch.`);
    return { firstRun: false };
  }

  if (await branchExists(project.directoryPath, releaseBranchName)) {
    debug(
      `Current release branch already exists. Checking out the existing branch.`,
    );
    await runGitCommandWithin(project.directoryPath, 'checkout', [
      releaseBranchName,
    ]);
    return { firstRun: false };
  }

  await runGitCommandWithin(project.directoryPath, 'checkout', [
    '-b',
    releaseBranchName,
  ]);

  return { firstRun: true };
}
