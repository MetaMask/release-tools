import { execa } from 'execa';

const CHANGESET_PATH_PATTERN = /^\.changeset\/[^/]+\.md$/u;
const README_PATH = '.changeset/README.md';

/**
 * Gets added or modified Changeset paths between a Git revision and HEAD.
 *
 * @param repositoryDirectory - The repository directory.
 * @param since - The Git revision to compare with HEAD.
 * @returns Repository-relative Changeset paths.
 */
export async function getChangedChangesetPaths(
  repositoryDirectory: string,
  since: string,
): Promise<string[]> {
  let stdout: string;
  try {
    ({ stdout } = await execa(
      'git',
      [
        'diff',
        '--name-status',
        '-z',
        '--diff-filter=AM',
        since,
        'HEAD',
        '--',
        '.changeset',
      ],
      { cwd: repositoryDirectory },
    ));
  } catch (error) {
    throw new Error(
      `Could not find changed Changeset files since ${since} in ${repositoryDirectory}.`,
      { cause: error },
    );
  }

  const fields = stdout.split('\0');
  const paths: string[] = [];
  for (let index = 0; index < fields.length - 1; index += 2) {
    const status = fields[index];
    const filePath = fields[index + 1];
    if (
      (status === 'A' || status === 'M') &&
      CHANGESET_PATH_PATTERN.test(filePath) &&
      filePath !== README_PATH
    ) {
      paths.push(filePath);
    }
  }
  return paths.sort();
}
