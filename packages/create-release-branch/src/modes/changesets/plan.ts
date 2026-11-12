import { assembleReleasePlan } from '@changesets/assemble-release-plan';
import type {
  ComprehensiveRelease,
  NewChangeset,
  Packages,
  ReleasePlan,
} from '@changesets/types';
import { filterChangesets } from '@metamask/changesets-utils';

import type { Candidate } from '../../core/candidates.js';
import type { ModePlanResult } from '../../core/mode.js';
import {
  INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE,
  normalizeReleaseChoices,
} from '../../core/release-rules.js';
import type {
  ReleaseChoiceError,
  ReleaseChoices,
} from '../../core/release-rules.js';
import type { VersionSpecifiers } from '../../core/types.js';
import type { Project } from '../../project/project.js';
import { semver, SemVer } from '../../utils/semver.js';
import { compareNames, isBumpingRelease } from './candidates.js';
import type { BumpingRelease } from './candidates.js';
import type { ChangesetsState } from './load.js';

/**
 * What Changesets mode needs to apply a release.
 *
 * @property filteredPlan - The release plan of the selected Changesets.
 * @property selectedChangesets - The Changesets that the release consumes,
 * with only the releases that it keeps.
 */
export type ChangesetsPlanData = {
  state: ChangesetsState;
  filteredPlan: ReleasePlan;
  selectedChangesets: NewChangeset[];
};

/**
 * Indexes the releases that bump a version by package name.
 *
 * @param releases - The releases.
 * @returns The bumping releases, by package name.
 */
function indexBumpingReleases(
  releases: ComprehensiveRelease[],
): Map<string, BumpingRelease> {
  return new Map(
    releases.filter(isBumpingRelease).map((release) => [release.name, release]),
  );
}

/**
 * Explains why the plan bumps a package that no selected Changeset names.
 *
 * @param packageName - The name of the package.
 * @param packages - The workspace packages.
 * @param releasesByName - The bumping releases, by package name.
 * @returns The reason, or undefined if no released dependency explains it.
 */
function getPropagationReason(
  packageName: string,
  packages: Packages,
  releasesByName: ReadonlyMap<string, BumpingRelease>,
): string | undefined {
  // Every release of the plan is for one of the packages.
  const { packageJson: manifest } = packages.packages.find(
    ({ packageJson }) => packageJson.name === packageName,
  ) as Packages['packages'][number];
  const withLabel = (
    ranges: Record<string, string> | undefined,
    label: string,
  ): { name: string; range: string; label: string }[] =>
    Object.entries(ranges ?? {}).map(([name, range]) => ({
      name,
      range,
      label,
    }));
  const dependencies = [
    ...withLabel(manifest.dependencies, 'dependency'),
    ...withLabel(manifest.optionalDependencies, 'dependency'),
    ...withLabel(manifest.peerDependencies, 'peer dependency'),
  ].sort((left, right) => compareNames(left.name, right.name));

  for (const { name, range, label } of dependencies) {
    const release = releasesByName.get(name);
    if (release !== undefined && !semver.satisfies(release.newVersion, range)) {
      return `released because ${label} ${name} is released as ${release.type}`;
    }
  }
  return undefined;
}

/**
 * Gives the version that a version specifier sets.
 *
 * @param currentVersion - The current version of the package.
 * @param specifier - The version specifier.
 * @returns The new version.
 */
function getSpecifiedVersion(
  currentVersion: string,
  specifier: VersionSpecifiers[string],
): string {
  return specifier instanceof SemVer
    ? specifier.version
    : new SemVer(currentVersion).inc(specifier).version;
}

/**
 * What the planning function takes. The choices must have passed the shared
 * rules.
 */
type PlanningInput = {
  project: Project;
  state: ChangesetsState;
  candidates: Candidate[];
  choices: ReleaseChoices;
};

/**
 * Plans a Changesets release from the release choices. The Changesets set the
 * version of each package, and the choices only select the packages.
 *
 * @param input - The planning input.
 * @returns The plan, or every problem that prevents it.
 */
export function planChangesetsRelease(
  input: PlanningInput,
): ModePlanResult<ChangesetsPlanData> {
  const { project, state, candidates, choices } = input;
  const specifiers = normalizeReleaseChoices(choices);
  const selected = new Set(
    candidates
      .filter(
        ({ name, kind }) =>
          kind === 'changes' && specifiers[name] !== undefined,
      )
      .map(({ name }) => name),
  );
  const selectedChangesets = filterChangesets(state.fullPlan.changesets, [
    ...selected,
  ]);
  const assembledPlan = assembleReleasePlan(
    selectedChangesets,
    state.packages,
    state.config,
    state.fullPlan.preState,
  );
  const releases = assembledPlan.releases.filter(
    ({ name, type }) =>
      type === 'none' || choices[name] !== INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE,
  );

  const choiceNames = Object.keys(choices);
  const getEntryIndex = (packageName: string): { entryIndex?: number } => {
    const entryIndex = choiceNames.indexOf(packageName);
    return entryIndex === -1 ? {} : { entryIndex };
  };

  const assembledReleases = indexBumpingReleases(assembledPlan.releases);
  const finalReleases = indexBumpingReleases(releases);
  const errors: ReleaseChoiceError[] = [];

  for (const { name, type, newVersion } of [...finalReleases.values()].sort(
    (left, right) => compareNames(left.name, right.name),
  )) {
    const specifier = specifiers[name];
    const currentVersion =
      project.workspacePackages[name].validatedManifest.version.version;
    if (
      !selected.has(name) &&
      getPropagationReason(name, state.packages, finalReleases) === undefined &&
      getPropagationReason(name, state.packages, assembledReleases) !==
        undefined
    ) {
      errors.push({
        packageName: name,
        ...getEntryIndex(name),
        problem:
          'is released only because of packages set to intentionally-skip',
        hint: 'Set it to intentionally-skip too.',
      });
    } else if (specifier === undefined) {
      const reason = getPropagationReason(name, state.packages, finalReleases);
      errors.push({
        packageName: name,
        problem: `is ${reason ?? 'released by the Changesets release plan'}, but it is not in the release spec`,
        hint: 'Add it with a version specifier, or set it to intentionally-skip.',
      });
    } else if (getSpecifiedVersion(currentVersion, specifier) !== newVersion) {
      const proposed =
        getSpecifiedVersion(currentVersion, type) === newVersion
          ? type
          : newVersion;
      errors.push({
        packageName: name,
        ...getEntryIndex(name),
        problem: `is set to ${String(specifier)}, but the Changesets release it as ${newVersion}`,
        hint: `Set it to ${proposed}. You cannot change the version of a package in Changesets mode.`,
      });
    }
  }

  choiceNames.forEach((name, entryIndex) => {
    if (specifiers[name] !== undefined && !finalReleases.has(name)) {
      errors.push({
        packageName: name,
        entryIndex,
        problem:
          'has nothing to release: no selected Changeset and no dependency bump',
        hint: 'Remove it, set it to intentionally-skip, or add a Changeset for it.',
      });
    }
  });

  if (finalReleases.size === 0) {
    errors.push({
      problem: 'does not release any package',
      hint: 'Set a version specifier for at least one package.',
    });
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    plan: {
      releases: [...finalReleases.values()]
        .map(({ name, newVersion }) => ({ name, newVersion }))
        .sort((left, right) => compareNames(left.name, right.name)),
      data: {
        state,
        filteredPlan: { ...assembledPlan, releases },
        selectedChangesets,
      },
    },
  };
}
