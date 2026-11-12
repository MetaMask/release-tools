import { assembleReleasePlan } from '@changesets/assemble-release-plan';
import type {
  ComprehensiveRelease,
  Config,
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
  resolveVersionSpecifier,
  suggestVersionSpecifier,
} from '../../core/release-rules.js';
import type {
  ReleaseChoiceError,
  ReleaseChoices,
} from '../../core/release-rules.js';
import type { Project } from '../../project/project.js';
import { semver } from '../../utils/semver.js';
import { compareNames, isBumpingRelease } from './candidates.js';
import type { BumpingRelease } from './candidates.js';
import type { ChangesetsState } from './load.js';

/**
 * What Changesets mode needs to apply a release.
 *
 * @property filteredPlan - The release plan of the selected changesets.
 * @property selectedChangesets - The changesets that the release consumes,
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
 * Explains why the plan bumps a package that no selected changeset names.
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
 * Lists the other released packages that share a fixed group with `packageName`.
 *
 * @param packageName - The name of the package.
 * @param fixedGroups - The fixed groups of the Changesets configuration.
 * @param releasesByName - The bumping releases, by package name.
 * @returns The sorted names of the other released packages in the same fixed
 * group.
 */
function getFixedGroupPeers(
  packageName: string,
  fixedGroups: Config['fixed'],
  releasesByName: ReadonlyMap<string, BumpingRelease>,
): string[] {
  const peers = new Set<string>();
  for (const group of fixedGroups) {
    if (group.includes(packageName)) {
      for (const member of group) {
        if (member !== packageName && releasesByName.has(member)) {
          peers.add(member);
        }
      }
    }
  }
  return [...peers].sort(compareNames);
}

/**
 * Looks up the position of `packageName` in the release spec so errors can
 * point to its line.
 *
 * @param choiceNames - The package names in release spec order.
 * @param packageName - The package name to locate.
 * @returns An object with `entryIndex` if the package is in the release spec.
 */
function getEntryIndex(
  choiceNames: string[],
  packageName: string,
): { entryIndex?: number } {
  const entryIndex = choiceNames.indexOf(packageName);
  return entryIndex === -1 ? {} : { entryIndex };
}

/**
 * Sorts bumping releases by package name.
 *
 * @param releasesByName - The bumping releases, by package name.
 * @returns The sorted releases.
 */
function sortBumpingReleases(
  releasesByName: ReadonlyMap<string, BumpingRelease>,
): BumpingRelease[] {
  return [...releasesByName.values()].sort((left, right) =>
    compareNames(left.name, right.name),
  );
}

/**
 * Filters the pending changesets to the selected packages and assembles the
 * resulting release plan without the packages marked `intentionally-skip`.
 *
 * @param args - The arguments.
 * @param args.state - The Changesets state of the project.
 * @param args.candidates - The candidates that were offered for release.
 * @param args.specifiers - The version specifiers chosen in the release spec.
 * @param args.choices - The release choices that passed the shared rules.
 * @returns The selected packages, filtered changesets, assembled plan, and
 * indexed releases before and after applying `intentionally-skip`.
 */
function assembleSelectedPlan({
  state,
  candidates,
  specifiers,
  choices,
}: {
  state: ChangesetsState;
  candidates: Candidate[];
  specifiers: ReturnType<typeof normalizeReleaseChoices>;
  choices: ReleaseChoices;
}): {
  selected: Set<string>;
  selectedChangesets: NewChangeset[];
  assembledPlan: ReleasePlan;
  releases: ComprehensiveRelease[];
  assembledReleases: Map<string, BumpingRelease>;
  finalReleases: Map<string, BumpingRelease>;
} {
  const selected = new Set(
    candidates
      .filter(
        ({ name, kind }) =>
          kind === 'changes' && specifiers[name] !== undefined,
      )
      .map(({ name }) => name),
  );
  const selectedChangesets = filterChangesets(state.releasePlan.changesets, [
    ...selected,
  ]);
  const assembledPlan = assembleReleasePlan(
    selectedChangesets,
    state.packages,
    state.config,
    state.releasePlan.preState,
  );
  const releases = assembledPlan.releases.filter(
    ({ name, type }) =>
      type === 'none' || choices[name] !== INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE,
  );

  return {
    selected,
    selectedChangesets,
    assembledPlan,
    releases,
    assembledReleases: indexBumpingReleases(assembledPlan.releases),
    finalReleases: indexBumpingReleases(releases),
  };
}

/**
 * Validates that a package marked `intentionally-skip` does not share a fixed
 * group with a package that is still released.
 *
 * @param args - The arguments.
 * @param args.release - The bumping release before skipping.
 * @param args.project - Information about the project.
 * @param args.state - The Changesets state of the project.
 * @param args.finalReleases - Bumping releases after skipping.
 * @param args.choiceNames - The package names in release spec order.
 * @returns The error, or `undefined` if the package can be skipped.
 */
function validateSkippedFixedGroup({
  release,
  project,
  state,
  finalReleases,
  choiceNames,
}: {
  release: BumpingRelease;
  project: Project;
  state: ChangesetsState;
  finalReleases: ReadonlyMap<string, BumpingRelease>;
  choiceNames: string[];
}): ReleaseChoiceError | undefined {
  const { name, newVersion } = release;
  const fixedPeers = getFixedGroupPeers(
    name,
    state.config.fixed,
    finalReleases,
  );
  if (fixedPeers.length === 0) {
    return undefined;
  }

  const currentVersion =
    project.workspacePackages[name].validatedManifest.version.version;
  const proposed = suggestVersionSpecifier(currentVersion, newVersion);
  return {
    packageName: name,
    ...getEntryIndex(choiceNames, name),
    problem: `cannot be set to intentionally-skip because it is in a fixed group with ${fixedPeers.join(', ')}`,
    hint: `Set it to ${proposed}, or leave out the rest of the fixed group.`,
  };
}

/**
 * Validates that a package bumped by the final plan is in the release spec
 * with a specifier that yields the version computed by Changesets.
 *
 * @param args - The arguments.
 * @param args.release - The bumping release.
 * @param args.project - Information about the project.
 * @param args.state - The Changesets state of the project.
 * @param args.selected - The selected candidate names.
 * @param args.assembledReleases - Bumping releases before skipping.
 * @param args.finalReleases - Bumping releases after skipping.
 * @param args.specifiers - The version specifiers chosen in the release spec.
 * @param args.choiceNames - The package names in release spec order.
 * @returns The error, or `undefined` if the release is valid.
 */
function validateFinalRelease({
  release,
  project,
  state,
  selected,
  assembledReleases,
  finalReleases,
  specifiers,
  choiceNames,
}: {
  release: BumpingRelease;
  project: Project;
  state: ChangesetsState;
  selected: ReadonlySet<string>;
  assembledReleases: ReadonlyMap<string, BumpingRelease>;
  finalReleases: ReadonlyMap<string, BumpingRelease>;
  specifiers: ReturnType<typeof normalizeReleaseChoices>;
  choiceNames: string[];
}): ReleaseChoiceError | undefined {
  const { name, newVersion } = release;
  const specifier = specifiers[name];
  const currentVersion =
    project.workspacePackages[name].validatedManifest.version.version;
  if (
    !selected.has(name) &&
    getPropagationReason(name, state.packages, finalReleases) === undefined &&
    getPropagationReason(name, state.packages, assembledReleases) !== undefined
  ) {
    return {
      packageName: name,
      ...getEntryIndex(choiceNames, name),
      problem: 'is released only because of packages set to intentionally-skip',
      hint: 'Set it to intentionally-skip too.',
    };
  }
  if (specifier === undefined) {
    const fixedPeers = getFixedGroupPeers(
      name,
      state.config.fixed,
      finalReleases,
    );
    if (fixedPeers.length > 0) {
      return {
        packageName: name,
        problem: `is in a fixed group with ${fixedPeers.join(', ')}, but it is not in the release spec`,
        hint: 'Add it with a version specifier, or leave out the rest of the fixed group.',
      };
    }
    const reason = getPropagationReason(name, state.packages, finalReleases);
    return {
      packageName: name,
      problem: `is ${reason ?? 'released by the Changesets release plan'}, but it is not in the release spec`,
      hint: 'Add it with a version specifier, or set it to intentionally-skip.',
    };
  }
  if (resolveVersionSpecifier(currentVersion, specifier) !== newVersion) {
    const proposed = suggestVersionSpecifier(currentVersion, newVersion);
    return {
      packageName: name,
      ...getEntryIndex(choiceNames, name),
      problem: `is set to ${String(specifier)}, but the changesets release it as ${newVersion}`,
      hint: `Set it to ${proposed}. You cannot change the version of a package in Changesets mode.`,
    };
  }
  return undefined;
}

/**
 * Validates every package bumped by the assembled plan, checking skipped
 * fixed-group peers and final release entries.
 *
 * @param args - The arguments.
 * @param args.project - Information about the project.
 * @param args.state - The Changesets state of the project.
 * @param args.selected - The selected candidate names.
 * @param args.assembledReleases - Bumping releases before skipping.
 * @param args.finalReleases - Bumping releases after skipping.
 * @param args.specifiers - The version specifiers chosen in the release spec.
 * @param args.choices - The release choices from the release spec.
 * @param args.choiceNames - The package names in release spec order.
 * @returns Every problem with the planned releases.
 */
function validateReleases({
  project,
  state,
  selected,
  assembledReleases,
  finalReleases,
  specifiers,
  choices,
  choiceNames,
}: {
  project: Project;
  state: ChangesetsState;
  selected: ReadonlySet<string>;
  assembledReleases: ReadonlyMap<string, BumpingRelease>;
  finalReleases: ReadonlyMap<string, BumpingRelease>;
  specifiers: ReturnType<typeof normalizeReleaseChoices>;
  choices: ReleaseChoices;
  choiceNames: string[];
}): ReleaseChoiceError[] {
  const errors: ReleaseChoiceError[] = [];

  for (const release of sortBumpingReleases(assembledReleases)) {
    let error: ReleaseChoiceError | undefined;
    if (choices[release.name] === INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE) {
      error = validateSkippedFixedGroup({
        release,
        project,
        state,
        finalReleases,
        choiceNames,
      });
    } else {
      error = validateFinalRelease({
        release,
        project,
        state,
        selected,
        assembledReleases,
        finalReleases,
        specifiers,
        choiceNames,
      });
    }
    if (error !== undefined) {
      errors.push(error);
    }
  }

  return errors;
}

/**
 * Validates that no package given a version specifier in the release spec has
 * nothing to release in the final plan.
 *
 * @param choiceNames - The package names in release spec order.
 * @param specifiers - The version specifiers chosen in the release spec.
 * @param finalReleases - Bumping releases after skipping.
 * @returns Every error for un-bumped selections.
 */
function validateUnexpectedSelections(
  choiceNames: string[],
  specifiers: ReturnType<typeof normalizeReleaseChoices>,
  finalReleases: ReadonlyMap<string, BumpingRelease>,
): ReleaseChoiceError[] {
  const errors: ReleaseChoiceError[] = [];

  choiceNames.forEach((name, entryIndex) => {
    if (specifiers[name] !== undefined && !finalReleases.has(name)) {
      errors.push({
        packageName: name,
        entryIndex,
        problem:
          'has nothing to release: no selected changeset and no dependency bump',
        hint: 'Remove it, set it to intentionally-skip, or add a changeset for it.',
      });
    }
  });

  return errors;
}

/**
 * Plans a Changesets release from the release choices. The changesets set the
 * version of each package, and the choices only select the packages.
 *
 * @param input - The planning input.
 * @param input.project - Information about the project.
 * @param input.state - The Changesets state of the project.
 * @param input.candidates - The candidates that were offered for release.
 * @param input.choices - The release choices that passed the shared rules.
 * @returns The plan, or every problem that prevents it.
 */
export function planChangesetsRelease(input: {
  project: Project;
  state: ChangesetsState;
  candidates: Candidate[];
  choices: ReleaseChoices;
}): ModePlanResult<ChangesetsPlanData> {
  const { project, state, candidates, choices } = input;
  const specifiers = normalizeReleaseChoices(choices);
  const choiceNames = Object.keys(choices);
  const {
    selected,
    selectedChangesets,
    assembledPlan,
    releases,
    assembledReleases,
    finalReleases,
  } = assembleSelectedPlan({ state, candidates, specifiers, choices });

  const errors: ReleaseChoiceError[] = [
    ...validateReleases({
      project,
      state,
      selected,
      assembledReleases,
      finalReleases,
      specifiers,
      choices,
      choiceNames,
    }),
    ...validateUnexpectedSelections(choiceNames, specifiers, finalReleases),
  ];

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
      releases: sortBumpingReleases(finalReleases).map(
        ({ name, newVersion }) => ({ name, newVersion }),
      ),
      data: {
        state,
        filteredPlan: { ...assembledPlan, releases },
        selectedChangesets,
      },
    },
  };
}
