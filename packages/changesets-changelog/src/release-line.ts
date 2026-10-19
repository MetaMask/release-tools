import type {
  GetDependencyReleaseLine,
  GetReleaseLine,
  NewChangesetWithCommit,
} from '@changesets/types';
import { parseChangesetSummary } from '@metamask/changesets-utils';

import { getGitHubRepository } from './options.js';
import { getPullRequestLink } from './resolve-pull-request.js';

/**
 * Formats one categorized changeset as a Markdown changelog line.
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
  const pullRequestLink = await getPullRequestLink(
    changeset,
    getGitHubRepository(changelogOpts),
  );
  const [firstLine, ...remainingLines] = description.split('\n');
  const breakingPrefix = type === 'major' ? '**BREAKING:** ' : '';

  return [
    `- ${breakingPrefix}${firstLine} (${pullRequestLink})`,
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
