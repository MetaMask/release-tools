import type {
  ChangelogFunctions,
  ModCompWithPackage,
  NewChangesetWithCommit,
} from '@changesets/types';
import validRange from 'semver/ranges/valid.js';

import type {
  CategorizedChangelogFunctions,
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
    return await changelogFuncs.getVersionHeader(release, changelogOpts);
  }
  return `## ${release.newVersion}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

export function isCategorizedChangelogFunctions(
  changelogFuncs: ChangelogFunctions,
): changelogFuncs is CategorizedChangelogFunctions {
  return (
    typeof (changelogFuncs as CategorizedChangelogFunctions)
      .categorizeReleaseLine === 'function' &&
    typeof (changelogFuncs as CategorizedChangelogFunctions)
      .categorizeDependencyReleaseLine === 'function' &&
    Array.isArray((changelogFuncs as CategorizedChangelogFunctions).categories)
  );
}

export function normalizeCategories(categories: readonly unknown[]): string[] {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error(
      'Changelog modules exporting `categorizeReleaseLine` must also export `categorizeDependencyReleaseLine` and a non-empty `categories` array',
    );
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const category of categories) {
    if (!isNonEmptyString(category)) {
      throw new Error(
        'Changelog module categories must be a non-empty array of non-empty strings',
      );
    }
    const trimmed = category.trim();
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      deduped.push(trimmed);
    }
  }

  if (deduped.length === 0) {
    throw new Error(
      'Changelog module categories must be a non-empty array of non-empty strings',
    );
  }

  return deduped;
}

function skipEmptyLine(line: string): boolean {
  return line.trim() === '';
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
          depType: dependencyVersionRange ? 'dependencies' : 'peerDependencies',
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

function validateCategorizedChangelogFunctions(
  changelogFuncs: CategorizedChangelogFunctions,
): string[] {
  if (
    typeof changelogFuncs.categorizeReleaseLine !== 'function' ||
    typeof changelogFuncs.categorizeDependencyReleaseLine !== 'function'
  ) {
    throw new Error(
      'Changelog modules exporting `categorizeReleaseLine` must also export `categorizeDependencyReleaseLine` and a non-empty `categories` array',
    );
  }
  return normalizeCategories(changelogFuncs.categories);
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

  if (isCategorizedChangelogFunctions(changelogFuncs)) {
    const categories = validateCategorizedChangelogFunctions(changelogFuncs);
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
      if (skipEmptyLine(releaseLine)) {
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
    if (!skipEmptyLine(dependencyLine)) {
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
 * Renders a changelog section: a heading followed by the given release lines.
 *
 * @param type - The release bucket to render.
 * @param lines - The lines to include in the section.
 * @returns The rendered section heading and lines, or `undefined` if there are no lines.
 */
export function generateMarkdownForVersionType(
  type: keyof ChangelogLines,
  lines: string[],
): string | undefined {
  return generateMarkdownForSection(`${capitalize(type)} Changes`, lines);
}

function generateMarkdownForSection(
  title: string,
  lines: string[],
): string | undefined {
  const releaseLines = lines.filter((line) => line);
  if (!releaseLines.length) {
    return undefined;
  }

  let content = `### ${title}`;
  let newLines = 2;

  for (const line of releaseLines) {
    const startNewLinesCount = line.match(/^\n*/u)?.[0].length ?? 0;
    newLines += startNewLinesCount;

    const newLinesContent = '\n'.repeat(Math.min(Math.max(newLines, 1), 2));
    content += newLinesContent + line.trim();

    const endNewLinesCount = line.match(/\n*$/u)?.[0].length ?? 0;
    newLines = endNewLinesCount;
  }

  return content;
}
