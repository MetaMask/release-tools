import type { ComprehensiveRelease } from '@changesets/types';
import { parseChangelog } from '@metamask/auto-changelog';
import YAML from 'yaml';

import type { LoadedChangesetsPlan } from './changesets-plan.js';
import { fileExists, readFile } from './fs.js';
import { wrapError } from './misc-utils.js';
import type { Package } from './package.js';
import type { Project } from './project.js';

/**
 * A package listed in a Changesets release spec.
 *
 * @property name - The name of the package.
 * @property kind - Why the package is listed: `direct` if a Changeset releases
 * it, `propagated` if the release plan adds it (for example as a dependent of
 * a released package), `legacy` if only its changelog's `Unreleased` section
 * has entries.
 * @property currentVersion - The version of the package before the release.
 * @property plannedType - The bump type in the release plan (not set for
 * `legacy` packages).
 * @property plannedVersion - The version in the release plan (not set for
 * `legacy` packages).
 * @property changesetCount - The number of Changesets that release the package.
 * @property reason - Why a `propagated` package is released, if a released
 * dependency explains it.
 */
export type ChangesetsCandidate = {
  name: string;
  kind: 'direct' | 'propagated' | 'legacy';
  currentVersion: string;
  plannedType?: 'major' | 'minor' | 'patch';
  plannedVersion?: string;
  changesetCount: number;
  reason?: string;
};

type BumpingRelease = ComprehensiveRelease & {
  type: 'major' | 'minor' | 'patch';
};

const KIND_ORDER: ChangesetsCandidate['kind'][] = [
  'direct',
  'propagated',
  'legacy',
];

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
 * Determines whether a release bumps the version of its package.
 *
 * @param release - The release.
 * @returns Whether the release type is not `none`.
 */
function isBumpingRelease(
  release: ComprehensiveRelease,
): release is BumpingRelease {
  return release.type !== 'none';
}

/**
 * Explains why the release plan adds a package that no Changeset releases.
 *
 * @param packageName - The name of the propagated package.
 * @param plan - The loaded Changesets plan.
 * @param releasesByName - The bumping releases of the plan, by package name.
 * @returns The reason, or undefined if no released dependency explains it.
 */
function getPropagationReason(
  packageName: string,
  plan: LoadedChangesetsPlan,
  releasesByName: Map<string, BumpingRelease>,
): string | undefined {
  const manifest = plan.packages.packages.find(
    ({ packageJson }) => packageJson.name === packageName,
  )?.packageJson;
  const dependencies = [
    ...Object.keys(manifest?.dependencies ?? {}).map((name) => ({
      name,
      label: 'dependency',
    })),
    ...Object.keys(manifest?.peerDependencies ?? {}).map((name) => ({
      name,
      label: 'peer dependency',
    })),
  ].sort((left, right) => compareNames(left.name, right.name));

  for (const { name, label } of dependencies) {
    const release = releasesByName.get(name);
    if (release) {
      return `released because ${label} ${name} is released as ${release.type}`;
    }
  }
  return undefined;
}

/**
 * Determines whether the changelog of a package has entries in its
 * `Unreleased` section.
 *
 * @param project - The project.
 * @param pkg - The package.
 * @returns Whether there are unreleased entries. False if the package has no
 * changelog.
 * @throws If the changelog cannot be parsed. The error names the package.
 */
async function hasLegacyUnreleasedEntries(
  project: Project,
  pkg: Package,
): Promise<boolean> {
  if (!(await fileExists(pkg.changelogPath))) {
    return false;
  }
  const changelogContent = await readFile(pkg.changelogPath);
  try {
    const changelog = parseChangelog({
      changelogContent,
      repoUrl: project.repositoryUrl,
      tagPrefix: `${pkg.validatedManifest.name}@`,
      changesets: true,
    });
    return Object.values(changelog.getUnreleasedChanges()).some(
      (changes) => changes.length > 0,
    );
  } catch (error) {
    throw wrapError(
      `Could not parse the changelog of ${pkg.validatedManifest.name} (${pkg.changelogPath}).`,
      error,
    );
  }
}

/**
 * Lists the packages that a Changesets release spec offers for release.
 *
 * @param args - The arguments.
 * @param args.project - The project.
 * @param args.plan - The loaded Changesets plan.
 * @returns The direct, then propagated, then legacy candidates, each kind
 * sorted by name. Releases of type `none` are not listed.
 */
export async function findChangesetsCandidates({
  project,
  plan,
}: {
  project: Project;
  plan: LoadedChangesetsPlan;
}): Promise<ChangesetsCandidate[]> {
  const releasesByName = new Map(
    plan.fullPlan.releases
      .filter(isBumpingRelease)
      .map((release) => [release.name, release]),
  );

  const plannedCandidates = [...releasesByName.values()].map(
    (release): ChangesetsCandidate => {
      const changesetCount = plan.fullPlan.changesets.filter(({ releases }) =>
        releases.some(
          ({ name, type }) => name === release.name && type !== 'none',
        ),
      ).length;
      const candidate: ChangesetsCandidate = {
        name: release.name,
        kind: changesetCount > 0 ? 'direct' : 'propagated',
        currentVersion: release.oldVersion,
        plannedType: release.type,
        plannedVersion: release.newVersion,
        changesetCount,
      };
      if (candidate.kind === 'propagated') {
        const reason = getPropagationReason(release.name, plan, releasesByName);
        if (reason !== undefined) {
          candidate.reason = reason;
        }
      }
      return candidate;
    },
  );

  const legacyCandidates: ChangesetsCandidate[] = [];
  for (const pkg of Object.values(project.workspacePackages)) {
    if (
      !releasesByName.has(pkg.validatedManifest.name) &&
      (await hasLegacyUnreleasedEntries(project, pkg))
    ) {
      legacyCandidates.push({
        name: pkg.validatedManifest.name,
        kind: 'legacy',
        currentVersion: pkg.validatedManifest.version.version,
        changesetCount: 0,
      });
    }
  }

  return [...plannedCandidates, ...legacyCandidates].sort(
    (left, right) =>
      KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind) ||
      compareNames(left.name, right.name),
  );
}

/**
 * Builds the comment that follows the line of a candidate in the template.
 *
 * @param candidate - The candidate.
 * @returns The comment text, without the leading `#`.
 */
function describeCandidate(candidate: ChangesetsCandidate): string {
  const versions = `${candidate.currentVersion} -> ${String(
    candidate.plannedVersion,
  )}`;
  switch (candidate.kind) {
    case 'direct':
      return `${versions}, ${candidate.changesetCount} ${
        candidate.changesetCount === 1 ? 'changeset' : 'changesets'
      }`;
    case 'propagated':
      return candidate.reason === undefined
        ? versions
        : `${versions}, ${candidate.reason}`;
    default:
      return 'legacy Unreleased entries only: choose major, minor, patch, or an exact version';
  }
}

/**
 * Generates a skeleton for a release specification from the candidates of a
 * Changesets project. Direct and propagated candidates are prefilled with their
 * planned bump type, and legacy candidates with `null`.
 *
 * @param args - The arguments.
 * @param args.candidates - The candidates, in the order to list them.
 * @param args.isEditorAvailable - Whether or not an executable can be found on
 * the user's computer to edit the release spec once it is generated.
 * @returns The release specification template.
 * @throws If there are no candidates.
 */
export function generateChangesetsReleaseSpecificationTemplate({
  candidates,
  isEditorAvailable,
}: {
  candidates: ChangesetsCandidate[];
  isEditorAvailable: boolean;
}): string {
  if (candidates.length === 0) {
    throw new Error(
      'Could not generate release specification: There are no packages to release.',
    );
  }

  const afterEditingInstructions = isEditorAvailable
    ? `
# When you're finished, save this file and close it. The tool will update the
# versions of the packages you've listed and will apply the Changesets to their
# changelogs.`.trim()
    : `
# When you're finished, save this file and then run create-release-branch again.
# The tool will update the versions of the packages you've listed and will apply
# the Changesets to their changelogs.`.trim();

  const instructions = `
# This file (called the "release spec") allows you to specify which packages you
# want to include in this release along with the new versions they should
# receive.
#
# By default, all packages released by pending Changesets are listed here,
# prefilled with the version bump from the Changesets release plan. This
# includes packages that are only released because one of their dependencies is
# released. Packages that no Changeset releases but whose changelog has entries
# in its "Unreleased" section are listed too, with no version.
#
# You can choose not to publish a package by removing it from this list or by
# setting its version specifier to null. If a package is listed because one of
# its dependencies is released and you do not want to release it, set its
# version specifier to "intentionally-skip" instead.
#
# You can change the version specifier of any package. A version specifier (the
# value that goes after each package in the list below) can be one of the
# following:
#
# - "major" (if you want to bump the major part of the package's version)
# - "minor" (if you want to bump the minor part of the package's version)
# - "patch" (if you want to bump the patch part of the package's version)
# - an exact version with major, minor, and patch parts (e.g. "1.2.3")
#
${afterEditingInstructions}
  `.trim();

  const packageLines = candidates.map((candidate) => {
    const value = candidate.kind === 'legacy' ? null : candidate.plannedType;
    const line = YAML.stringify({ [candidate.name]: value }).trimEnd();
    return `  ${line} # ${describeCandidate(candidate)}`;
  });

  return [instructions, ['packages:', ...packageLines, ''].join('\n')].join(
    '\n\n',
  );
}
