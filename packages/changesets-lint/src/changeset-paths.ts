import { readdir } from 'node:fs/promises';
import path from 'node:path';

const CHANGESET_DIRECTORY = '.changeset';
const IGNORED_FILES = new Set(['README.md']);

/**
 * Checks whether a direct file name inside `.changeset/` is a Changeset
 * Markdown file.
 *
 * @param fileName - The file name inside `.changeset/`.
 * @returns Whether the file is a Changeset Markdown file.
 */
function isChangesetFileName(fileName: string): boolean {
  return fileName.endsWith('.md') && !IGNORED_FILES.has(fileName);
}

/**
 * Checks whether a repository-relative path is a Changeset Markdown file.
 *
 * @param filePath - The repository-relative file path.
 * @returns Whether the path is a Changeset Markdown file.
 */
export function isChangesetPath(filePath: string): boolean {
  if (!filePath.startsWith(`${CHANGESET_DIRECTORY}/`)) {
    return false;
  }

  const relativePath = filePath.slice(CHANGESET_DIRECTORY.length + 1);
  return !relativePath.includes('/') && isChangesetFileName(relativePath);
}

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
    .filter((entry) => entry.isFile() && isChangesetFileName(entry.name))
    .map((entry) => `${CHANGESET_DIRECTORY}/${entry.name}`)
    .sort();
}
