import type {
  GetDependencyReleaseLine,
  GetReleaseLine,
  ModCompWithPackage,
  NewChangesetWithCommit,
} from '@changesets/types';
import { parseChangesetSummary } from '@metamask/changesets-utils';

import { getChangelogOptions } from './options.js';
import { getPullRequestLink } from './resolve-pull-request.js';

const TRAILING_PR_LINK_PATTERN =
  /\(\[#\d+\]\([^)\s]+\)(?:,\s*\[#\d+\]\([^)\s]+\))*\)\.?$/u;

/**
 * Formats one categorized changeset as a Markdown changelog line. Appends a
 * pull request link from the commit subject unless the summary already ends
 * with a pull request link or the commit subject has no pull request number.
 *
 * @param changeset - The changeset to format.
 * @param type - The release's version bump type.
 * @param changelogOpts - The changelog options.
 * @returns The formatted changelog line.
 */
export const getReleaseLine: GetReleaseLine = async (
  changeset,
  type,
  changelogOpts,
) => {
  const { description } = parseChangesetSummary(changeset.summary);
  const { repository, cwd } = getChangelogOptions(changelogOpts);
  const [firstLine, ...remainingLines] = description.split('\n');
  const pullRequestLink = TRAILING_PR_LINK_PATTERN.test(firstLine)
    ? undefined
    : await getPullRequestLink(changeset, repository, cwd);
  const breakingPrefix = type === 'major' ? '**BREAKING:** ' : '';
  const linkSuffix =
    pullRequestLink === undefined ? '' : ` (${pullRequestLink})`;

  return [
    `- ${breakingPrefix}${firstLine}${linkSuffix}`,
    ...remainingLines,
  ].join('\n');
};

/**
 * Assigns a rendered changelog line to its changeset category.
 *
 * @param line - The rendered changelog line.
 * @param changeset - The changeset that produced the line.
 * @returns The categorized line.
 */
export function categorizeReleaseLine(
  line: string,
  changeset: NewChangesetWithCommit,
): { category: string; line: string }[] {
  const { category } = parseChangesetSummary(changeset.summary);
  return [{ category, line }];
}

/**
 * Formats dependency updates as Markdown changelog lines.
 *
 * @param _changesets - The changesets that caused the dependency updates.
 * @param dependenciesUpdated - The updated dependencies.
 * @returns The formatted dependency lines.
 */
export const getDependencyReleaseLine: GetDependencyReleaseLine = (
  _changesets,
  dependenciesUpdated,
) =>
  dependenciesUpdated
    .map(
      ({ name, oldVersion, newVersion }) =>
        `- Bump \`${name}\` from \`${oldVersion}\` to \`${newVersion}\``,
    )
    .join('\n');

/**
 * Assigns dependency updates to the Changed category.
 *
 * @param line - The rendered dependency lines.
 * @returns The categorized dependency lines.
 */
export function categorizeDependencyReleaseLine(
  line: string,
): { category: string; line: string }[] {
  return [{ category: 'Changed', line }];
}

/**
 * Formats a Keep a Changelog version heading.
 *
 * @param release - The release to format.
 * @returns The formatted version heading.
 */
export function getVersionHeader(release: ModCompWithPackage): string {
  return `## [${release.newVersion}]`;
}
