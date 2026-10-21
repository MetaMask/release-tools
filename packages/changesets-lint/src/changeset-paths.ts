import { readdir } from 'node:fs/promises';
import path from 'node:path';

const CHANGESET_DIRECTORY = '.changeset';
const README_FILE = 'README.md';

/**
 * Gets all Changeset Markdown paths from the current working tree.
 *
 * @param repositoryDirectory - The repository directory.
 * @returns Sorted repository-relative Changeset paths.
 */
export async function getChangesetPaths(
  repositoryDirectory: string,
): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(repositoryDirectory, CHANGESET_DIRECTORY), {
      withFileTypes: true,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith('.md') &&
        entry.name !== README_FILE,
    )
    .map((entry) => `${CHANGESET_DIRECTORY}/${entry.name}`)
    .sort();
}
