import { readdir } from 'node:fs/promises';
import path from 'node:path';

const CHANGESET_DIRECTORY = '.changeset';
const IGNORED_FILES = new Set(['README.md']);

/**
 * Gets all Changeset Markdown paths from a repository.
 *
 * @param repositoryDirectory - The repository directory.
 * @returns Sorted repository-relative Changeset paths.
 */
export async function getChangesetPaths(
  repositoryDirectory: string,
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(
      path.join(repositoryDirectory, CHANGESET_DIRECTORY),
      {
        withFileTypes: true,
      },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Could not find the Changeset directory in ${repositoryDirectory}.`,
        { cause: error },
      );
    }
    throw error;
  }

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        !IGNORED_FILES.has(entry.name),
    )
    .map((entry) => `${CHANGESET_DIRECTORY}/${entry.name}`)
    .sort();
}
