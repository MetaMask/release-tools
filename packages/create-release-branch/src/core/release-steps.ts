import type { Project } from '../project/project.js';
import type { Mode, ModePlan } from './mode.js';
import { createReleaseBranch } from './release-branch.js';
import { checkReleaseChoices } from './release-rules.js';
import type {
  DependencyFinding,
  ReleaseChoiceError,
  ReleaseChoices,
} from './release-rules.js';
import { commitAllChanges } from './repo.js';
import type { ReleaseType } from './types.js';
import {
  deduplicateDependencies,
  fixConstraints,
  updateYarnLockfile,
} from './yarn-commands.js';

/**
 * Creates (or switches to) the release branch. On the first run, prepares the
 * project with the mode and commits the result.
 *
 * @param args - The arguments.
 * @param args.project - Information about the project.
 * @param args.releaseType - The type of release ("ordinary" or "backport"),
 * which affects how the version is bumped.
 * @param args.mode - The release mode.
 * @returns The version of the new release.
 */
export async function startRelease<Data>({
  project,
  releaseType,
  mode,
}: {
  project: Project;
  releaseType: ReleaseType;
  mode: Mode<Data>;
}): Promise<{ newReleaseVersion: string }> {
  const { version: newReleaseVersion, firstRun } = await createReleaseBranch({
    project,
    releaseType,
  });

  if (firstRun) {
    await mode.prepare();
    await commitAllChanges(
      project.directoryPath,
      `Initialize Release ${newReleaseVersion}`,
      { allowEmpty: mode.allowEmptyInitializeCommit },
    );
  }

  return { newReleaseVersion };
}

/**
 * Checks the release choices with the shared rules, then plans the release
 * with the mode if the rules found no errors.
 *
 * @param args - The arguments.
 * @param args.project - Information about the project.
 * @param args.mode - The release mode.
 * @param args.choices - The release choices.
 * @returns The errors, the missing dependencies and dependents for each
 * package that has any, and the plan if there are no errors.
 */
export async function checkChoices<Data>({
  project,
  mode,
  choices,
}: {
  project: Project;
  mode: Mode<Data>;
  choices: ReleaseChoices;
}): Promise<{
  errors: ReleaseChoiceError[];
  dependencyFindings: Record<string, DependencyFinding>;
  plan?: ModePlan<Data>;
}> {
  const candidates = await mode.listCandidates(choices);
  const packagesWithChanges = new Set(
    candidates
      .filter(({ kind }) => kind === 'changes' || kind === 'legacy-entries')
      .map(({ name }) => name),
  );

  const { errors, dependencyFindings } = checkReleaseChoices(project, choices, {
    packagesWithChanges,
  });

  if (errors.length > 0) {
    return { errors, dependencyFindings };
  }

  const planResult = await mode.plan(choices);

  if ('errors' in planResult) {
    return { errors: planResult.errors, dependencyFindings };
  }

  return { errors: [], dependencyFindings, plan: planResult.plan };
}

/**
 * Writes the planned release to the project with the mode.
 *
 * @param args - The arguments.
 * @param args.mode - The release mode.
 * @param args.plan - The plan from `checkChoices`.
 * @param args.newReleaseVersion - The version of the new release.
 */
export async function applyRelease<Data>({
  mode,
  plan,
  newReleaseVersion,
}: {
  mode: Mode<Data>;
  plan: ModePlan<Data>;
  newReleaseVersion: string;
}): Promise<void> {
  await mode.apply(plan, newReleaseVersion);
}

/**
 * Fixes constraints, updates the lockfile, deduplicates dependencies, and then
 * commits all changes for the release.
 *
 * @param args - The arguments.
 * @param args.project - Information about the project.
 * @param args.newReleaseVersion - The version of the new release.
 */
export async function finishRelease({
  project,
  newReleaseVersion,
}: {
  project: Project;
  newReleaseVersion: string;
}): Promise<void> {
  await fixConstraints(project.directoryPath);
  await updateYarnLockfile(project.directoryPath);
  await deduplicateDependencies(project.directoryPath);
  await commitAllChanges(
    project.directoryPath,
    `Update Release ${newReleaseVersion}`,
  );
}
