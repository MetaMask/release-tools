import type { Project } from '../project/project.js';
import type { CliOutput } from './cli-output.js';
import type { Mode, ModePlan } from './mode.js';
import {
  determineReleaseVersion,
  ensureReleaseBranch,
} from './release-branch.js';
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
 * project with the mode, prints the notices of the mode, and commits the
 * result.
 *
 * @param args - The arguments.
 * @param args.project - Information about the project.
 * @param args.releaseType - The type of release ("ordinary" or "backport"),
 * which affects how the version is bumped.
 * @param args.mode - The release mode.
 * @param args.output - Where to write user-facing messages.
 * @returns The version of the new release.
 */
export async function startRelease<Data>({
  project,
  releaseType,
  mode,
  output,
}: {
  project: Project;
  releaseType: ReleaseType;
  mode: Mode<Data>;
  output: CliOutput;
}): Promise<{ newReleaseVersion: string }> {
  const newReleaseVersion = determineReleaseVersion(project, releaseType);
  const { firstRun } = await output.step(
    'Creating the release branch',
    async () => await ensureReleaseBranch(project, newReleaseVersion),
  );

  if (firstRun) {
    const notices = await output.step(
      'Updating changelogs',
      async () => await mode.prepare(),
    );
    for (const { title, items } of notices) {
      output.warnList(title, items);
    }
    // `prepare` may change nothing, and the release branch still needs this
    // commit.
    await commitAllChanges(
      project.directoryPath,
      `Initialize Release ${newReleaseVersion}`,
      { allowEmpty: true },
    );
  }

  return { newReleaseVersion };
}

/**
 * The result of `checkChoices`: the errors, or the plan if there are none. In
 * both cases, the missing dependencies and dependents for each package that
 * has any.
 */
export type CheckChoicesResult<Data> =
  | {
      errors: ReleaseChoiceError[];
      dependencyFindings: Record<string, DependencyFinding>;
    }
  | {
      dependencyFindings: Record<string, DependencyFinding>;
      plan: ModePlan<Data>;
    };

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
}): Promise<CheckChoicesResult<Data>> {
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

  return { dependencyFindings, plan: planResult.plan };
}

/**
 * Writes the planned release to the project with the mode, then prints the
 * notices of the mode.
 *
 * @param args - The arguments.
 * @param args.mode - The release mode.
 * @param args.plan - The plan from `checkChoices`.
 * @param args.newReleaseVersion - The version of the new release.
 * @param args.output - Where to write user-facing messages.
 */
export async function applyRelease<Data>({
  mode,
  plan,
  newReleaseVersion,
  output,
}: {
  mode: Mode<Data>;
  plan: ModePlan<Data>;
  newReleaseVersion: string;
  output: CliOutput;
}): Promise<void> {
  const notices = await output.step(
    'Applying the release',
    async () => await mode.apply(plan, newReleaseVersion),
  );
  for (const { title, items } of notices) {
    output.warnList(title, items);
  }
}

/**
 * Fixes constraints, updates the lockfile, deduplicates dependencies, and then
 * commits all changes for the release.
 *
 * @param args - The arguments.
 * @param args.project - Information about the project.
 * @param args.newReleaseVersion - The version of the new release.
 * @param args.output - Where to write user-facing messages.
 */
export async function finishRelease({
  project,
  newReleaseVersion,
  output,
}: {
  project: Project;
  newReleaseVersion: string;
  output: CliOutput;
}): Promise<void> {
  await output.task(
    'Fixing Yarn constraints',
    async (log) => await fixConstraints(project.directoryPath, log),
  );
  await output.task(
    'Installing dependencies',
    async (log) => await updateYarnLockfile(project.directoryPath, log),
  );
  await output.task(
    'Deduplicating dependencies',
    async (log) => await deduplicateDependencies(project.directoryPath, log),
  );
  // Not run in a step: a spinner would draw over a GPG pinentry in the
  // terminal.
  await commitAllChanges(
    project.directoryPath,
    `Update Release ${newReleaseVersion}`,
  );
}
