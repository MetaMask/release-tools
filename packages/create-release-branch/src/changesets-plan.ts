import { readConfig } from '@changesets/config';
import { getReleasePlan } from '@changesets/get-release-plan';
import type {
  Config,
  NewChangeset,
  Packages,
  ReleasePlan,
} from '@changesets/types';
import { getPackages } from '@manypkg/get-packages';

/**
 * The state of a Changesets project before any selection is made.
 */
export type LoadedChangesetsPlan = {
  packages: Packages;
  config: Config;
  fullPlan: ReleasePlan;
  originalChangesets: NewChangeset[];
};

/**
 * Reads the workspace packages, the Changesets configuration and the release
 * plan for all pending Changesets. Nothing is written.
 *
 * @param projectDirectoryPath - The path to the project root.
 * @returns The packages, the configuration, the full release plan and the
 * Changesets it was built from.
 * @throws If the configuration is invalid, if the project is in pre mode, or
 * if the configuration has no changelog setting.
 */
export async function loadChangesetsPlan(
  projectDirectoryPath: string,
): Promise<LoadedChangesetsPlan> {
  const packages = await getPackages(projectDirectoryPath);
  const parsedConfig = await readConfig(projectDirectoryPath, packages);

  if (parsedConfig.errors) {
    throw new Error(
      `Invalid Changesets configuration:\n${parsedConfig.errors.join('\n')}`,
    );
  }

  const { config } = parsedConfig;
  const fullPlan = await getReleasePlan(
    projectDirectoryPath,
    undefined,
    config,
  );

  if (fullPlan.preState?.mode === 'pre') {
    throw new Error(
      'Changesets pre mode is not supported by create-release-branch.',
    );
  }

  if (config.changelog === false) {
    throw new Error(
      'Changesets mode requires a "changelog" setting in .changeset/config.json.',
    );
  }

  return {
    packages,
    config,
    fullPlan,
    originalChangesets: fullPlan.changesets,
  };
}
