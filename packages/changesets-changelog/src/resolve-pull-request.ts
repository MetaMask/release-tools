import type { NewChangesetWithCommit } from '@changesets/types';
import { execa } from 'execa';

const SQUASH_MERGE_PR_PATTERN = /\(#(\d+)\)$/u;
const MERGE_COMMIT_PR_PATTERN = /Merge pull request #(\d+) from/iu;

/**
 * Extracts a pull request number from a Git commit subject.
 *
 * @param subject - The Git commit subject.
 * @returns The pull request number.
 */
export function extractPullRequestNumber(subject: string): string {
  const match =
    subject.match(SQUASH_MERGE_PR_PATTERN) ??
    subject.match(MERGE_COMMIT_PR_PATTERN);

  if (!match) {
    throw new Error(
      `Commit subject does not contain a pull request number: ${subject}`,
    );
  }

  return match[1];
}

/**
 * Resolves the pull request link for a changeset using its local Git commit.
 *
 * @param changeset - The changeset whose commit should be inspected.
 * @param repo - The GitHub repository in `owner/repo` form.
 * @returns The Markdown pull request link.
 */
export async function getPullRequestLink(
  changeset: NewChangesetWithCommit,
  repo: string,
): Promise<string> {
  if (!changeset.commit) {
    throw new Error(`Changeset ${changeset.id} has no commit`);
  }

  let subject: string;
  try {
    ({ stdout: subject } = await execa('git', [
      'show',
      '-s',
      '--format=%s',
      changeset.commit,
    ]));
  } catch (error) {
    throw new Error(
      `Could not read commit ${changeset.commit} for changeset ${changeset.id}`,
      { cause: error },
    );
  }

  if (!subject.trim()) {
    throw new Error(
      `Could not read commit ${changeset.commit} for changeset ${changeset.id}: empty subject`,
    );
  }

  const pullRequestNumber = extractPullRequestNumber(subject.trim());
  return `[#${pullRequestNumber}](https://github.com/${repo}/pull/${pullRequestNumber})`;
}
