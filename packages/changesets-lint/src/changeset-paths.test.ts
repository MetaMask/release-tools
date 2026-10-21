import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { getChangesetPaths } from './changeset-paths.js';

const temporaryDirectories: string[] = [];

/**
 * Creates a temporary repository directory for a test.
 *
 * @returns The temporary repository directory.
 */
async function createRepository(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'changesets-lint-'));
  temporaryDirectories.push(directory);
  return directory;
}

describe('getChangesetPaths', () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories
        .splice(0)
        .map(async (directory) =>
          rm(directory, { recursive: true, force: true }),
        ),
    );
  });
  it('returns sorted Changeset Markdown files from the current tree', async () => {
    const repositoryDirectory = await createRepository();
    const changesetDirectory = path.join(repositoryDirectory, '.changeset');
    await mkdir(path.join(changesetDirectory, 'nested'), { recursive: true });
    await Promise.all([
      writeFile(path.join(changesetDirectory, 'zebra.md'), ''),
      writeFile(path.join(changesetDirectory, 'alpha.md'), ''),
      writeFile(path.join(changesetDirectory, 'README.md'), ''),
      writeFile(path.join(changesetDirectory, 'config.json'), ''),
      writeFile(path.join(changesetDirectory, 'nested', 'hidden.md'), ''),
      writeFile(path.join(repositoryDirectory, 'outside.md'), ''),
    ]);

    expect(await getChangesetPaths(repositoryDirectory)).toStrictEqual([
      '.changeset/alpha.md',
      '.changeset/zebra.md',
    ]);
  });

  it('returns no paths when the Changeset directory does not exist', async () => {
    const repositoryDirectory = await createRepository();

    expect(await getChangesetPaths(repositoryDirectory)).toStrictEqual([]);
  });

  it('reports errors other than a missing Changeset directory', async () => {
    const repositoryDirectory = await createRepository();
    await writeFile(
      path.join(repositoryDirectory, '.changeset'),
      'not a directory',
    );

    await expect(getChangesetPaths(repositoryDirectory)).rejects.toMatchObject({
      code: 'ENOTDIR',
    });
  });
});
