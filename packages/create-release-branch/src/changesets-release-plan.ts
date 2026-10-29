import { assembleReleasePlan } from '@changesets/assemble-release-plan';
import type {
  ComprehensiveRelease,
  NewChangeset,
  ReleasePlan,
} from '@changesets/types';
import { filterChangesets } from '@metamask/changesets-utils';
import type { ReleaseType } from 'semver';

import type { LoadedChangesetsPlan } from './changesets-plan.js';
import type { ChangesetsCandidate } from './changesets-release-specification.js';
import { getPropagationReason } from './changesets-release-specification.js';
import type { Project } from './project.js';
import { calculateNewPackageVersion } from './release-plan.js';
import {
  buildReleaseSpecificationErrorMessage,
  INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE,
  parseVersionSpecifier,
} from './release-specification.js';
import { semver, SemVer } from './semver.js';

/**
 * The result of interpreting a release spec in Changesets mode.
 *
 * @property filteredPlan - The release plan built from the selected
 * Changesets, with the overrides of the release spec applied.
 * @property selectedChangesets - Copies of the Changesets that the release
 * consumes, each with only the releases that it keeps.
 * @property legacyReleases - The packages that no Changeset releases but whose
 * changelog has `Unreleased` entries, with their new versions.
 * @property overrides - The released packages of the Changesets release plan
 * whose value in the release spec differs from the planned bump type, sorted
 * by name.
 */
export type ChangesetsReleasePlan = {
  filteredPlan: ReleasePlan;
  selectedChangesets: NewChangeset[];
  legacyReleases: { name: string; newVersion: string }[];
  overrides: ChangesetsOverride[];
};

/**
 * A value in the release spec that differs from the Changesets release plan.
 *
 * @property name - The name of the package.
 * @property plannedType - The bump type in the Changesets release plan.
 * @property plannedVersion - The version in the Changesets release plan.
 * @property versionSpecifier - The value in the release spec.
 * @property newVersion - The version that the release gives the package.
 */
export type ChangesetsOverride = {
  name: string;
  plannedType: BumpType;
  plannedVersion: string;
  versionSpecifier: string;
  newVersion: string;
};

type BumpType = 'major' | 'minor' | 'patch';

const BASE_BUMP_TYPES: Record<ReleaseType, BumpType> = {
  major: 'major',
  premajor: 'major',
  minor: 'minor',
  preminor: 'minor',
  patch: 'patch',
  prepatch: 'patch',
  prerelease: 'patch',
  release: 'patch',
};

const BUMP_TYPE_ORDER: ComprehensiveRelease['type'][] = [
  'none',
  'patch',
  'minor',
  'major',
];

/**
 * Prefix of the ids of the in-memory Changesets that propagate overrides
 * raising propagated releases. Changeset ids are file names, so an id that
 * contains a slash never matches a Changeset file.
 */
const SYNTHETIC_CHANGESET_ID_PREFIX = 'create-release-branch/override/';

/**
 * Compares two strings by code unit, independently of the locale.
 *
 * @param left - The first string.
 * @param right - The second string.
 * @returns A negative number, zero, or a positive number.
 */
function compareNames(left: string, right: string): number {
  return Number(left > right) - Number(left < right);
}

/**
 * Determines the bump type that a version specifier gives a package.
 *
 * @param project - The project.
 * @param packageName - The name of the package.
 * @param versionSpecifier - "major", "minor", "patch", or an exact version
 * greater than the current version of the package.
 * @returns The bump type. For an exact version, the base type of the
 * difference between the current version and the exact version.
 */
function getBumpType(
  project: Project,
  packageName: string,
  versionSpecifier: string,
): BumpType {
  const parsedSpecifier = parseVersionSpecifier(versionSpecifier);
  if (!(parsedSpecifier instanceof SemVer)) {
    return parsedSpecifier;
  }
  const difference = semver.diff(
    project.workspacePackages[packageName].validatedManifest.version,
    parsedSpecifier,
  ) as ReleaseType;
  return BASE_BUMP_TYPES[difference];
}

/**
 * Keeps the releases of the selected packages in the Changesets. A Changeset
 * that keeps a release also keeps its `none` releases, and a Changeset that
 * only has `none` releases is kept as it is.
 *
 * @param changesets - The Changesets.
 * @param selected - The names of the selected packages.
 * @returns Copies of the kept Changesets.
 */
function selectChangesets(
  changesets: NewChangeset[],
  selected: ReadonlySet<string>,
): NewChangeset[] {
  return changesets.flatMap((changeset) => {
    const isKept =
      changeset.releases.every(({ type }) => type === 'none') ||
      changeset.releases.some(({ name }) => selected.has(name));
    if (!isKept) {
      return [];
    }
    const noneReleaseNames = changeset.releases
      .filter(({ type }) => type === 'none')
      .map(({ name }) => name);
    return filterChangesets([changeset], [...selected, ...noneReleaseNames]);
  });
}

/**
 * Indexes the releases that bump a version by package name.
 *
 * @param releases - The releases.
 * @returns The releases that are not of type `none`, by package name.
 */
function getBumpingReleasesByName(
  releases: ComprehensiveRelease[],
): Map<string, ComprehensiveRelease> {
  return new Map(
    releases
      .filter(({ type }) => type !== 'none')
      .map((release) => [release.name, release]),
  );
}

/**
 * Interprets a release spec in Changesets mode: selects the Changesets of the
 * listed packages, applies the overrides, re-plans the release, and checks
 * that the result matches the release spec.
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.plan - The loaded Changesets plan. It is not modified.
 * @param args.candidates - The candidates offered by the release spec.
 * @param args.entries - The raw `packages` map of the release spec, which must
 * already have passed `validateReleaseSpecification`.
 * @param args.releaseSpecificationPath - The path to the release spec file.
 * @returns The filtered release plan, the selected Changesets, the legacy
 * releases, and the overrides.
 * @throws If the re-planned release does not match the release spec. The
 * error lists every problem.
 */
export function planChangesetsRelease({
  project,
  plan,
  candidates,
  entries,
  releaseSpecificationPath,
}: {
  project: Project;
  plan: LoadedChangesetsPlan;
  candidates: ChangesetsCandidate[];
  entries: Record<string, string | null>;
  releaseSpecificationPath: string;
}): ChangesetsReleasePlan {
  const candidatesByName = new Map(
    candidates.map((candidate) => [candidate.name, candidate]),
  );
  const getVersionSpecifier = (packageName: string): string | undefined => {
    const entry = entries[packageName];
    return entry === undefined ||
      entry === null ||
      entry === INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE
      ? undefined
      : entry;
  };
  const getOverride = (packageName: string): string | undefined => {
    const versionSpecifier = getVersionSpecifier(packageName);
    return versionSpecifier === candidatesByName.get(packageName)?.plannedType
      ? undefined
      : versionSpecifier;
  };

  const selected = new Set(
    candidates
      .filter(
        ({ name, kind }) =>
          kind === 'direct' && getVersionSpecifier(name) !== undefined,
      )
      .map(({ name }) => name),
  );

  const changesets = selectChangesets(plan.originalChangesets, selected).map(
    (changeset) => ({
      ...changeset,
      releases: changeset.releases.map((release) => {
        const override = getOverride(release.name);
        return selected.has(release.name) &&
          release.type !== 'none' &&
          override !== undefined
          ? { ...release, type: getBumpType(project, release.name, override) }
          : release;
      }),
    }),
  );

  const syntheticChangesets: NewChangeset[] = [];
  let replannedPlan: ReleasePlan;
  let syntheticChangesetCount: number;
  do {
    syntheticChangesetCount = syntheticChangesets.length;
    replannedPlan = assembleReleasePlan(
      [...changesets, ...syntheticChangesets],
      plan.packages,
      plan.config,
      plan.fullPlan.preState,
    );
    for (const release of replannedPlan.releases) {
      const override = getOverride(release.name);
      if (
        release.type === 'none' ||
        selected.has(release.name) ||
        override === undefined
      ) {
        continue;
      }
      const type = getBumpType(project, release.name, override);
      if (
        BUMP_TYPE_ORDER.indexOf(type) > BUMP_TYPE_ORDER.indexOf(release.type)
      ) {
        syntheticChangesets.push({
          id: `${SYNTHETIC_CHANGESET_ID_PREFIX}${release.name}`,
          summary: '',
          releases: [{ name: release.name, type }],
        });
      }
    }
  } while (syntheticChangesets.length > syntheticChangesetCount);

  const syntheticChangesetIds = new Set(
    syntheticChangesets.map(({ id }) => id),
  );

  const releases = replannedPlan.releases
    .map((release) => ({
      ...release,
      changesets: release.changesets.filter(
        (id) => !syntheticChangesetIds.has(id),
      ),
    }))
    .filter(
      ({ name, type }) =>
        type === 'none' ||
        entries[name] !== INTENTIONALLY_SKIP_PACKAGE_DIRECTIVE,
    )
    .map((release) => {
      const override = getOverride(release.name);
      if (release.type === 'none' || override === undefined) {
        return release;
      }
      const parsedOverride = parseVersionSpecifier(override);
      const newVersion = calculateNewPackageVersion(
        project.workspacePackages[release.name],
        parsedOverride,
      );
      if (selected.has(release.name)) {
        return parsedOverride instanceof SemVer
          ? { ...release, newVersion }
          : release;
      }
      return {
        ...release,
        type: getBumpType(project, release.name, override),
        newVersion,
      };
    });

  const replannedReleasesByName = getBumpingReleasesByName(
    replannedPlan.releases,
  );
  const finalReleasesByName = getBumpingReleasesByName(releases);
  const errors: string[] = [];

  for (const name of [...finalReleasesByName.keys()].sort(compareNames)) {
    if (selected.has(name)) {
      continue;
    }
    const reason = getPropagationReason(
      name,
      plan.packages,
      finalReleasesByName,
    );
    if (
      reason === undefined &&
      getPropagationReason(name, plan.packages, replannedReleasesByName) !==
        undefined
    ) {
      errors.push(
        `${name} is released only because of packages marked "intentionally-skip". Mark it "intentionally-skip" too.`,
      );
    } else if (getVersionSpecifier(name) === undefined) {
      errors.push(
        `${name} is ${
          reason ?? 'released by the Changesets release plan'
        }, but it is not in the release spec. Add it with a version specifier, or mark it "intentionally-skip".`,
      );
    }
  }

  const legacyReleases: ChangesetsReleasePlan['legacyReleases'] = [];
  for (const { name, kind } of candidates) {
    const versionSpecifier = getVersionSpecifier(name);
    if (
      kind === 'legacy' &&
      versionSpecifier !== undefined &&
      !finalReleasesByName.has(name)
    ) {
      legacyReleases.push({
        name,
        newVersion: calculateNewPackageVersion(
          project.workspacePackages[name],
          parseVersionSpecifier(versionSpecifier),
        ),
      });
    }
  }

  for (const name of Object.keys(entries)) {
    if (
      getVersionSpecifier(name) !== undefined &&
      !finalReleasesByName.has(name) &&
      candidatesByName.get(name)?.kind !== 'legacy'
    ) {
      errors.push(
        `${name} is listed in the release spec but has nothing to release (no selected changesets, no Unreleased entries, and no dependency update). Remove it, mark it "intentionally-skip", or add a changeset.`,
      );
    }
  }

  if (finalReleasesByName.size === 0 && legacyReleases.length === 0) {
    errors.push('The release spec does not select any package to release.');
  }

  if (errors.length > 0) {
    throw new Error(
      buildReleaseSpecificationErrorMessage(
        errors.map((message) => ({ message })),
        releaseSpecificationPath,
      ),
    );
  }

  const overrides: ChangesetsOverride[] = [];
  for (const { name, type, newVersion } of releases) {
    const versionSpecifier = getOverride(name);
    const { plannedType, plannedVersion } = candidatesByName.get(name) ?? {};
    if (
      type !== 'none' &&
      versionSpecifier !== undefined &&
      plannedType !== undefined &&
      plannedVersion !== undefined
    ) {
      overrides.push({
        name,
        plannedType,
        plannedVersion,
        versionSpecifier,
        newVersion,
      });
    }
  }

  return {
    filteredPlan: {
      ...replannedPlan,
      changesets: replannedPlan.changesets.filter(
        ({ id }) => !syntheticChangesetIds.has(id),
      ),
      releases,
    },
    selectedChangesets: changesets,
    legacyReleases,
    overrides: overrides.sort((left, right) =>
      compareNames(left.name, right.name),
    ),
  };
}
