import { readConfig } from '@changesets/config';
import { getReleasePlan } from '@changesets/get-release-plan';
import type { Config, Packages, ReleasePlan } from '@changesets/types';
import { getPackages } from '@manypkg/get-packages';
import path from 'path';

import type { CliOutput } from '../../core/cli-output.js';
import type { ErrorDescription } from '../../core/user-facing-error.js';
import { UserFacingError } from '../../core/user-facing-error.js';
import { isErrorWithCode } from '../../utils/misc-utils.js';

/**
 * The changelog module that Changesets mode requires.
 */
export const CHANGELOG_MODULE = '@metamask/changesets-changelog';

/**
 * The workspace packages, the Changesets configuration, and the release plan
 * of all pending changesets.
 */
export type ChangesetsState = {
  packages: Packages;
  config: Config;
  releasePlan: ReleasePlan;
};

/**
 * A package and file that a setup error applies to.
 *
 * @property name - The package name.
 * @property filePath - The file path.
 */
export type SetupErrorEntry = { name: string; filePath: string };

/**
 * A problem that stops Changesets mode before it writes anything.
 */
export class ChangesetsSetupError extends UserFacingError {
  problem: string;

  entries: SetupErrorEntry[];

  details: string[];

  filePath: string | undefined;

  /**
   * Creates the error.
   *
   * @param args - The arguments.
   * @param args.problem - What is wrong.
   * @param args.entries - The packages and files that have the problem.
   * @param args.details - How to fix it.
   * @param args.filePath - The file that has the problem.
   * @param options - The options.
   * @param options.cause - The error that caused the problem.
   */
  constructor(
    {
      problem,
      entries = [],
      details,
      filePath,
    }: {
      problem: string;
      entries?: SetupErrorEntry[];
      details: string[];
      filePath?: string;
    },
    options?: { cause: unknown },
  ) {
    super(undefined, options);
    this.problem = problem;
    this.entries = entries;
    this.details = details;
    this.filePath = filePath;
    this.message = this.buildPlainMessage();
  }

  describe(format: CliOutput['format']): ErrorDescription {
    return {
      title: this.problem,
      lines: [
        ...this.entries.map(
          ({ name, filePath }) =>
            `${format.name(name)} ${format.dim(filePath)}`,
        ),
        ...this.details,
        ...(this.filePath === undefined ? [] : [format.dim(this.filePath)]),
      ],
    };
  }
}

/**
 * Reads the Changesets configuration, which must use {@link CHANGELOG_MODULE}.
 *
 * @param projectDirectoryPath - The path to the project root.
 * @param packages - The workspace packages.
 * @returns The configuration.
 * @throws A `ChangesetsSetupError` if the configuration is missing, is not
 * valid, or does not use {@link CHANGELOG_MODULE}.
 */
async function readChangesetsConfig(
  projectDirectoryPath: string,
  packages: Packages,
): Promise<Config> {
  const configPath = path.join(
    projectDirectoryPath,
    '.changeset',
    'config.json',
  );

  let result: Awaited<ReturnType<typeof readConfig>>;
  try {
    result = await readConfig(projectDirectoryPath, packages);
  } catch (error) {
    if (isErrorWithCode(error) && error.code === 'ENOENT') {
      throw new ChangesetsSetupError(
        {
          problem: 'Changesets mode needs a Changesets configuration.',
          details: [
            'Set up Changesets in the project, or release it in legacy mode.',
          ],
          filePath: configPath,
        },
        { cause: error },
      );
    }
    throw error;
  }

  if (result.errors !== undefined) {
    throw new ChangesetsSetupError({
      problem: 'The Changesets configuration is not valid:',
      details: result.errors,
      filePath: configPath,
    });
  }

  const { changelog } = result.config;
  if (changelog === false || changelog[0] !== CHANGELOG_MODULE) {
    throw new ChangesetsSetupError({
      problem: `Changesets mode needs the ${CHANGELOG_MODULE} changelog module.`,
      details: [
        `Set "changelog" to ["${CHANGELOG_MODULE}", { "repository": "<owner>/<repo>" }] in the Changesets configuration.`,
      ],
      filePath: configPath,
    });
  }

  return result.config;
}

/**
 * Reads the Changesets state of the project. Pre mode is not supported.
 *
 * @param projectDirectoryPath - The path to the project root.
 * @returns The Changesets state.
 * @throws A `ChangesetsSetupError` if the configuration is missing, is not
 * valid, or does not use {@link CHANGELOG_MODULE}, or if pre mode is on.
 */
export async function loadChangesetsState(
  projectDirectoryPath: string,
): Promise<ChangesetsState> {
  const packages = await getPackages(projectDirectoryPath);
  const config = await readChangesetsConfig(projectDirectoryPath, packages);
  const releasePlan = await getReleasePlan(
    projectDirectoryPath,
    undefined,
    config,
  );

  if (releasePlan.preState?.mode === 'pre') {
    throw new ChangesetsSetupError({
      problem: 'Changesets pre mode is not supported.',
      details: [
        'Exit pre mode with "changeset pre exit", then run this tool again.',
      ],
      filePath: path.join(projectDirectoryPath, '.changeset', 'pre.json'),
    });
  }

  return { packages, config, releasePlan };
}
