import type {
  ChangelogFunctions,
  ModCompWithPackage,
  NewChangesetWithCommit,
} from '@changesets/types';
import validRange from 'semver/ranges/valid.js';

import type {
  CategorizedChangelogFunctions,
  CategorizedReleaseLine,
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

export function isCategorizedChangelogFunctions(
  changelogFuncs: ChangelogFunctions,
): changelogFuncs is CategorizedChangelogFunctions {
  return (
    typeof (changelogFuncs as CategorizedChangelogFunctions)
      .getCategorizedReleaseLines === 'function'
  );
}

// Computes the dependency releases relevant to `release`, and the changesets
// that caused them. Extracted from `getChangelogEntry` so that the categorized
// variant shares it.
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
    const usesWorkspaceRange = versionRange?.startsWith('workspace:') ?? false;
    return Boolean(
      versionRange &&
      (usesWorkspaceRange || validRange(versionRange) !== null) &&
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

// release is the package and version we are releasing
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

  if (isCategorizedChangelogFunctions(changelogFuncs)) {
    return getCategorizedChangelogEntry(
      cwd,
      release,
      releases,
      changesets,
      changelogFuncs,
      changelogOpts,
      dependencyUpdateConfig,
    );
  }

  const changelogLines: ChangelogLines = {
    major: [],
    minor: [],
    patch: [],
  };

  // I sort of feel we can do better, as ComprehensiveReleases have an array
  // of the relevant changesets but since we need the version type for the
  // release in the changeset, I don't know if we can
  // We can filter here, but that just adds another iteration over this list
  changesets.forEach((cs) => {
    const rls = cs.releases.find(
      (packageRelease) => packageRelease.name === release.name,
    );
    if (rls && rls.type !== 'none') {
      changelogLines[rls.type].push(
        Promise.resolve(
          changelogFuncs.getReleaseLine(cs, rls.type, changelogOpts),
        ),
      );
    }
  });

  const { dependentReleases, relevantChangesets } = getUpdatedDependencies(
    cwd,
    release,
    releases,
    changesets,
    dependencyUpdateConfig,
  );

  changelogLines.patch.push(
    Promise.resolve(
      changelogFuncs.getDependencyReleaseLine(
        relevantChangesets,
        dependentReleases,
        changelogOpts,
      ),
    ),
  );

  const resolvedChangelogLines = {
    major: await Promise.all(changelogLines.major),
    minor: await Promise.all(changelogLines.minor),
    patch: await Promise.all(changelogLines.patch),
  };

  const renderedLines = [
    `## ${release.newVersion}`,
    generateMarkdownForVersionType('major', resolvedChangelogLines.major),
    generateMarkdownForVersionType('minor', resolvedChangelogLines.minor),
    generateMarkdownForVersionType('patch', resolvedChangelogLines.patch),
  ].filter((line) => line);

  if (renderedLines.length === 1) {
    renderedLines.push('No changes in this release.');
  }

  return renderedLines.join('\n\n');
}

async function getCategorizedChangelogEntry(
  cwd: string,
  release: ModCompWithPackage,
  releases: ModCompWithPackage[],
  changesets: NewChangesetWithCommit[],
  changelogFuncs: CategorizedChangelogFunctions,
  changelogOpts: null | Record<string, unknown>,
  dependencyUpdateConfig: DependencyUpdateConfig,
): Promise<string> {
  const linesByCategory = new Map<string, string[]>(
    changelogFuncs.categories.map((category) => [category, []]),
  );

  const addLine = (
    { category, line }: CategorizedReleaseLine,
    source: string,
  ): void => {
    const lines = linesByCategory.get(category);
    if (!lines) {
      throw new Error(
        `Unknown changelog category "${category}" returned by ${source} (known categories: ${changelogFuncs.categories.join(
          ', ',
        )})`,
      );
    }
    lines.push(line);
  };

  const categorizedLines = await Promise.all(
    changesets.map(async (cs) => {
      const rls = cs.releases.find(
        (packageRelease) => packageRelease.name === release.name,
      );
      if (rls && rls.type !== 'none') {
        return changelogFuncs.getCategorizedReleaseLines(
          cs,
          rls.type,
          changelogOpts,
        );
      }
      return [];
    }),
  );
  for (const lines of categorizedLines) {
    for (const line of lines) {
      addLine(line, 'getCategorizedReleaseLines');
    }
  }

  const { dependentReleases, relevantChangesets } = getUpdatedDependencies(
    cwd,
    release,
    releases,
    changesets,
    dependencyUpdateConfig,
  );

  const dependencyLines =
    await changelogFuncs.getCategorizedDependencyReleaseLines(
      relevantChangesets,
      dependentReleases,
      changelogOpts,
    );
  for (const line of dependencyLines) {
    addLine(line, 'getCategorizedDependencyReleaseLines');
  }

  const renderedLines: string[] = [`## [${release.newVersion}]`];
  for (const category of changelogFuncs.categories) {
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

// Exported for test only
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
  // Track the new lines to be added between release lines. Start with two as we
  // want the extra spacing after the heading.
  let newLines = 2;

  for (const line of releaseLines) {
    // Factor in the starting new lines preferred by the release line
    const startNewLinesCount = line.match(/^\n*/u)?.[0].length ?? 0;
    newLines += startNewLinesCount;

    // Ensure a minimum of one new line and maximum of two new lines between release lines
    const newLinesContent = '\n'.repeat(Math.min(Math.max(newLines, 1), 2));
    content += newLinesContent + line.trim();

    // Count the ending new lines preferred by the release line for the next run
    const endNewLinesCount = line.match(/\n*$/u)?.[0].length ?? 0;
    newLines = endNewLinesCount;
  }

  return content;
}
