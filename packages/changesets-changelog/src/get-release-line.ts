import type { NewChangesetWithCommit, VersionType } from '@changesets/types';
import { parseChangesetSummary } from '@metamask/changesets-utils';

import { getRepo } from './options.js';
import { getPullRequestLink } from './resolve-pull-request.js';
import type { CategorizedReleaseLine, ChangelogOptions } from './types.js';

/**
 * Renders the changelog line for a changeset.
 *
 * The line holds the entry description, a pull request link, and a
 * `**BREAKING:**` prefix for major releases. Continuation lines and
 * sub-bullets of the description are kept and indented below the entry.
 *
 * @param changeset - The changeset to render.
 * @param type - The bump type of the release.
 * @param changelogOpts - The changelog options. Must contain `repo`.
 * @returns The rendered changelog line.
 * @throws If the options have no `repo`, if the summary does not follow the
 * changeset grammar, or if the pull request cannot be resolved.
 */
export async function getReleaseLine(
  changeset: NewChangesetWithCommit,
  type: VersionType,
  changelogOpts: ChangelogOptions,
): Promise<string> {
  const repo = getRepo(changelogOpts);
  const { description } = parseChangesetSummary(changeset.summary);
  const pullRequestLink = await getPullRequestLink(changeset, repo);

  const [firstLine, ...rest] = description.split('\n');
  const entry = `- ${type === 'major' ? '**BREAKING:** ' : ''}${firstLine} (${pullRequestLink})`;
  const continuation = rest.map((line) =>
    /^\s/u.test(line) ? line : `  ${line}`,
  );

  return [entry, ...continuation].join('\n');
}

/**
 * Assigns a changelog line to the category declared by its changeset.
 *
 * @param line - The line rendered by `getReleaseLine`.
 * @param changeset - The changeset the line was rendered from.
 * @returns The line and the section it belongs to.
 */
export async function categorizeReleaseLine(
  line: string,
  changeset: NewChangesetWithCommit,
): Promise<CategorizedReleaseLine[]> {
  const { category } = parseChangesetSummary(changeset.summary);
  return [{ category, line }];
}
