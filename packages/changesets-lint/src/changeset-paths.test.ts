import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { getChangesetPaths } from './changeset-paths.js';

const temporaryDirectories: string[] = [];

/** Creates a temporary repository directory for a test. */
async function createRepository(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'changesets-lint-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('getChangesetPaths', () => {
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

    await expect(getChangesetPaths(repositoryDirectory)).resolves.toStrictEqual([
      '.changeset/alpha.md',
      '.changeset/zebra.md',
    ]);
  });

  it('returns no paths when the Changeset directory does not exist', async () => {
    const repositoryDirectory = await createRepository();

    await expect(getChangesetPaths(repositoryDirectory)).resolves.toStrictEqual(
      [],
    );
  });
});
