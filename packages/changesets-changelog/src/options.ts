import { hasProperty, isObject } from '@metamask/utils';

export type ChangelogOptions = {
  repository: string;
};

/**
 * Validates and narrows changelog options.
 *
 * @param changelogOpts - The changelog options.
 * @throws If `repository` is missing or empty.
 */
export function validateChangelogOptions(
  changelogOpts: unknown,
): asserts changelogOpts is ChangelogOptions {
  if (
    !isObject(changelogOpts) ||
    !hasProperty(changelogOpts, 'repository') ||
    typeof changelogOpts.repository !== 'string' ||
    changelogOpts.repository.trim() === ''
  ) {
    throw new Error(
      'Please provide a repository to this changelog generator: "repository": "org/repo"',
    );
  }
}

/**
 * Returns the configured GitHub repository.
 *
 * @param changelogOpts - The changelog options.
 * @returns The repository in `owner/repo` form.
 */
export function getGitHubRepository(changelogOpts: unknown): string {
  validateChangelogOptions(changelogOpts);
  return changelogOpts.repository;
}
