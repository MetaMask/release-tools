import type {
  ChangelogFunctions,
  ModCompWithPackage,
  NewChangesetWithCommit,
} from '@changesets/types';
import validRange from 'semver/ranges/valid.js';

import type {
  CustomCategoryChangelogFunctions,
  CategorizedReleaseLine,
  GetVersionHeader,
} from './types.js';
import { capitalize, shouldUpdateDependencyBasedOnConfig } from './utils.js';

type ChangelogLines = {
  major: Promise<string>[];
  minor: Promise<string>[];
  patch: Promise<string>[];
};

type DependencyUpdateConfig = {
  updateInternalDependencies: 'patch' | 'minor';
  onlyUpdatePeerDependentsWhenOutOfRange: boolean;
};

/**
 * Renders the heading line that opens a release entry, using the module's
 * `getVersionHeader` export when present and the default `## <version>`
 * heading otherwise.
 *
 * @param changelogFuncs - The changelog module.
 * @param release - The release to render a heading for.
 * @param changelogOpts - The options configured for the changelog module.
 * @returns The version heading line.
 */
async function getVersionHeaderLine(
  changelogFuncs: ChangelogFunctions & { getVersionHeader?: GetVersionHeader },
  release: ModCompWithPackage,
  changelogOpts: null | Record<string, unknown>,
): Promise<string> {
  if (changelogFuncs.getVersionHeader) {
    return changelogFuncs.getVersionHeader(release, changelogOpts);
  }
  return `## ${release.newVersion}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Detects whether a changelog module opts into custom category mode. The rest
 * of the custom-category interface is validated by
 * `validateCustomCategoryChangelogFunctions`.
 *
 * @param changelogFuncs - The changelog module.
 * @returns Whether the module exports `categorizeReleaseLine`.
 */
export function isCustomCategoryChangelogFunctions(
  changelogFuncs: ChangelogFunctions,
): changelogFuncs is CustomCategoryChangelogFunctions {
  return (
    typeof (changelogFuncs as CustomCategoryChangelogFunctions)
      .categorizeReleaseLine === 'function'
  );
}

/**
 * Computes the dependency releases relevant to `release`, and the changesets
 * that caused them.
 *
 * @param cwd - The root directory of the project.
 * @param release - The release to compute updated dependencies for.
 * @param releases - All releases in the release plan.
 * @param changesets - The changesets in the release plan.
 * @param config - How internal dependencies are updated.
 * @param config.updateInternalDependencies - The minimum bump type that updates an internal dependency range.
 * @param config.onlyUpdatePeerDependentsWhenOutOfRange - Whether peer dependents are only updated when the new version leaves the declared range.
 * @returns The dependency releases and the changesets that caused them.
 */
function getUpdatedDependencies(
  cwd: string,
  release: ModCompWithPackage,
  releases: ModCompWithPackage[],
  changesets: NewChangesetWithCommit[],
  {
    updateInternalDependencies,
    onlyUpdatePeerDependentsWhenOutOfRange,
  }: DependencyUpdateConfig,
): {
  dependentReleases: ModCompWithPackage[];
  relevantChangesets: NewChangesetWithCommit[];
} {
  const dependentReleases = releases.filter((rel) => {
    const dependencyVersionRange = release.packageJson.dependencies?.[rel.name];
    const peerDependencyVersionRange =
      release.packageJson.peerDependencies?.[rel.name];

    const versionRange = dependencyVersionRange ?? peerDependencyVersionRange;
    const usesWorkspaceRange = versionRange?.startsWith('workspace:');
    return Boolean(
      versionRange &&
        (usesWorkspaceRange === true || validRange(versionRange) !== null) &&
        shouldUpdateDependencyBasedOnConfig(
          cwd,
          rel,
          {
            depVersionRange: versionRange,
            depType: dependencyVersionRange
              ? 'dependencies'
              : 'peerDependencies',
          },
          {
            minReleaseType: updateInternalDependencies,
            onlyUpdatePeerDependentsWhenOutOfRange,
          },
        ),
    );
  });

  const relevantChangesetIds: Set<string> = new Set();
  dependentReleases.forEach((rel) => {
    rel.changesets.forEach((cs) => {
      relevantChangesetIds.add(cs);
    });
  });

  const relevantChangesets = changesets.filter((cs) =>
    relevantChangesetIds.has(cs.id),
  );

  return { dependentReleases, relevantChangesets };
}

function categorizeLines(
  categorizedLines: CategorizedReleaseLine[],
  linesByCategory: Map<string, string[]>,
  source: string,
  categories: readonly string[],
): void {
  for (const { category, line } of categorizedLines) {
    const lines = linesByCategory.get(category);
    if (!lines) {
      throw new Error(
        `Unknown changelog category "${category}" returned by ${source} (known categories: ${categories.join(', ')})`,
      );
    }
    lines.push(line);
  }
}

/**
 * Validates the custom-category interface of a changelog module and returns
 * its categories, trimmed and deduplicated by first occurrence.
 *
 * @param changelogFuncs - The changelog module, known to opt into custom category mode.
 * @returns The normalized categories, in declaration order.
 */
export function validateCustomCategoryChangelogFunctions(
  changelogFuncs: CustomCategoryChangelogFunctions,
): string[] {
  const { categories } = changelogFuncs;
  if (
    typeof changelogFuncs.categorizeDependencyReleaseLine !== 'function' ||
    !Array.isArray(categories) ||
    categories.length === 0
  ) {
    throw new Error(
      'Changelog modules exporting `categorizeReleaseLine` must also export `categorizeDependencyReleaseLine` and a non-empty `categories` array',
    );
  }

  const deduped: string[] = [];
  for (const category of categories) {
    if (!isNonEmptyString(category)) {
      throw new Error(
        'Changelog module categories must be a non-empty array of non-empty strings',
      );
    }
    const trimmed = category.trim();
    if (!deduped.includes(trimmed)) {
      deduped.push(trimmed);
    }
  }

  return deduped;
}

/**
 * Renders a custom-category release entry.
 *
 * @param changelogFuncs - The changelog module.
 * @param release - The release to render an entry for.
 * @param changelogOpts - The options configured for the changelog module.
 * @param relevantChangesets - The changesets that affect dependency updates.
 * @param dependentReleases - The dependency releases relevant to this release.
 * @param changesets - All changesets in the release plan.
 * @returns The rendered release entry.
 */
async function renderCustomCategoryChangelogEntry(
  changelogFuncs: CustomCategoryChangelogFunctions,
  release: ModCompWithPackage,
  changelogOpts: null | Record<string, unknown>,
  relevantChangesets: NewChangesetWithCommit[],
  dependentReleases: ModCompWithPackage[],
  changesets: NewChangesetWithCommit[],
): Promise<string> {
  const categories = validateCustomCategoryChangelogFunctions(changelogFuncs);
  const linesByCategory = new Map<string, string[]>(
    categories.map((category) => [category, []]),
  );

  for (const cs of changesets) {
    const releaseInChangeset = cs.releases.find(
      (candidate) => candidate.name === release.name,
    );
    if (!releaseInChangeset || releaseInChangeset.type === 'none') {
      continue;
    }

    const releaseLine = await changelogFuncs.getReleaseLine(
      cs,
      releaseInChangeset.type,
      changelogOpts,
    );
    if (releaseLine.trim() === '') {
      continue;
    }

    const categorizedLines = await changelogFuncs.categorizeReleaseLine(
      releaseLine,
      cs,
      releaseInChangeset.type,
      changelogOpts,
    );
    categorizeLines(
      categorizedLines,
      linesByCategory,
      'categorizeReleaseLine',
      categories,
    );
  }

  const dependencyLine = await changelogFuncs.getDependencyReleaseLine(
    relevantChangesets,
    dependentReleases,
    changelogOpts,
  );
  if (dependencyLine.trim() !== '') {
    const categorizedDependencyLines =
      await changelogFuncs.categorizeDependencyReleaseLine(
        dependencyLine,
        relevantChangesets,
        dependentReleases,
        changelogOpts,
      );
    categorizeLines(
      categorizedDependencyLines,
      linesByCategory,
      'categorizeDependencyReleaseLine',
      categories,
    );
  }

  const renderedLines: string[] = [
    await getVersionHeaderLine(changelogFuncs, release, changelogOpts),
  ];
  for (const category of linesByCategory.keys()) {
    const section = generateMarkdownForSection(
      category,
      linesByCategory.get(category) ?? [],
    );
    if (section) {
      renderedLines.push(section);
    }
  }

  if (renderedLines.length === 1) {
    renderedLines.push('No changes in this release.');
  }

  return renderedLines.join('\n\n');
}

/**
 * Renders a standard release entry.
 *
 * @param changelogFuncs - The changelog module.
 * @param release - The release to render an entry for.
 * @param changelogOpts - The options configured for the changelog module.
 * @param relevantChangesets - The changesets that affect dependency updates.
 * @param dependentReleases - The dependency releases relevant to this release.
 * @param changesets - All changesets in the release plan.
 * @returns The rendered release entry.
 */
async function renderStandardChangelogEntry(
  changelogFuncs: ChangelogFunctions,
  release: ModCompWithPackage,
  changelogOpts: null | Record<string, unknown>,
  relevantChangesets: NewChangesetWithCommit[],
  dependentReleases: ModCompWithPackage[],
  changesets: NewChangesetWithCommit[],
): Promise<string> {
  const changelogLines: ChangelogLines = {
    major: [],
    minor: [],
    patch: [],
  };

  changesets.forEach((cs) => {
    const rls = cs.releases.find(
      (releaseInChangeset) => releaseInChangeset.name === release.name,
    );
    if (rls && rls.type !== 'none') {
      changelogLines[rls.type].push(
        Promise.resolve(
          changelogFuncs.getReleaseLine(cs, rls.type, changelogOpts),
        ),
      );
    }
  });

  const dependencyLine = await changelogFuncs.getDependencyReleaseLine(
    relevantChangesets,
    dependentReleases,
    changelogOpts,
  );
  if (dependencyLine.trim() !== '') {
    changelogLines.patch.push(Promise.resolve(dependencyLine));
  }

  const resolvedChangelogLines = {
    major: await Promise.all(changelogLines.major),
    minor: await Promise.all(changelogLines.minor),
    patch: await Promise.all(changelogLines.patch),
  };

  const renderedLines = [
    await getVersionHeaderLine(changelogFuncs, release, changelogOpts),
    generateMarkdownForVersionType('major', resolvedChangelogLines.major),
    generateMarkdownForVersionType('minor', resolvedChangelogLines.minor),
    generateMarkdownForVersionType('patch', resolvedChangelogLines.patch),
  ].filter((line) => line);

  if (renderedLines.length === 1) {
    renderedLines.push('No changes in this release.');
  }

  return renderedLines.join('\n\n');
}

/**
 * Renders a release entry for a changelog module.
 *
 * @param cwd - The root directory of the project.
 * @param release - The release to render an entry for.
 * @param releases - All releases in the release plan.
 * @param changesets - The changesets in the release plan.
 * @param changelogFuncs - The changelog module.
 * @param changelogOpts - The options configured for the changelog module.
 * @param dependencyUpdateConfig - How internal dependencies are updated.
 * @returns The rendered release entry.
 */
export async function getChangelogEntry(
  cwd: string,
  release: ModCompWithPackage,
  releases: ModCompWithPackage[],
  changesets: NewChangesetWithCommit[],
  changelogFuncs: ChangelogFunctions,
  changelogOpts: null | Record<string, unknown>,
  dependencyUpdateConfig: DependencyUpdateConfig,
): Promise<string | null> {
  if (release.type === 'none') {
    return null;
  }

  const { dependentReleases, relevantChangesets } = getUpdatedDependencies(
    cwd,
    release,
    releases,
    changesets,
    dependencyUpdateConfig,
  );

  if (isCustomCategoryChangelogFunctions(changelogFuncs)) {
    return renderCustomCategoryChangelogEntry(
      changelogFuncs,
      release,
      changelogOpts,
      relevantChangesets,
      dependentReleases,
      changesets,
    );
  }

  return renderStandardChangelogEntry(
    changelogFuncs,
    release,
    changelogOpts,
    relevantChangesets,
    dependentReleases,
    changesets,
  );
}

/**
 * Renders a custom-category section.
 *
 * @param heading - The section heading.
 * @param lines - The rendered section lines.
 * @returns The rendered section, or null when there are no lines.
 */
export function generateMarkdownForSection(
  heading: string,
  lines: string[],
): string | null {
  if (lines.length === 0) {
    return null;
  }

  return [
    `### ${capitalize(heading)}`,
    ...lines.map((line) => `- ${line}`),
  ].join('\n');
}

/**
 * Renders a standard release-type section.
 *
 * @param heading - The release type heading.
 * @param lines - The rendered release lines.
 * @returns The rendered section, or null when there are no lines.
 */
export function generateMarkdownForVersionType(
  heading: string,
  lines: string[],
): string | null {
  if (lines.length === 0) {
    return null;
  }

  return [
    `### ${capitalize(heading)} Changes`,
    ...lines.map((line) => `- ${line}`),
  ].join('\n');
}
