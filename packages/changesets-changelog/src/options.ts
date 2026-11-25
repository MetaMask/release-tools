import { hasProperty, isObject } from '@metamask/utils';

export type ChangelogOptions = {
  repository: string;
  cwd?: string | undefined;
};

/**
 * Validates and narrows changelog options.
 *
 * @param changelogOpts - The changelog options.
 * @throws If `repository` is missing or empty, or if `cwd` is not a non-empty
 * string.
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

  if (
    hasProperty(changelogOpts, 'cwd') &&
    changelogOpts.cwd !== undefined &&
    (typeof changelogOpts.cwd !== 'string' || changelogOpts.cwd.trim() === '')
  ) {
    throw new Error(
      'Please provide a non-empty string for the "cwd" changelog option',
    );
  }
}

/**
 * Returns the validated changelog options.
 *
 * @param changelogOpts - The changelog options.
 * @returns The repository in `owner/repo` form and the optional directory
 * path.
 */
export function getChangelogOptions(changelogOpts: unknown): ChangelogOptions {
  validateChangelogOptions(changelogOpts);
  return {
    repository: changelogOpts.repository,
    cwd: changelogOpts.cwd,
  };
}
