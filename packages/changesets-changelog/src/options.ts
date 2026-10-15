import type { ChangelogOptions } from './types.js';

/**
 * Reads the GitHub repository from the changelog options.
 *
 * @param changelogOpts - The changelog options.
 * @returns The repository in `owner/repo` form.
 * @throws If the options have no non-empty `repo` string.
 */
export function getRepo(changelogOpts: ChangelogOptions): string {
  const repo = changelogOpts?.repo;

  if (typeof repo !== 'string' || repo.trim() === '') {
    throw new Error(
      'Please provide a repo to this changelog generator like this:\n"changelog": ["@metamask/changesets-changelog", { "repo": "org/repo" }]',
    );
  }

  return repo;
}
