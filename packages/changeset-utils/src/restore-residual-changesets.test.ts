import type { NewChangesetWithCommit } from '@changesets/types';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { restoreResidualChangesets } from './restore-residual-changesets.js';

describe('restoreResidualChangesets', () => {
  const directories: string[] = [];

  async function createChangesetDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'changeset-utils-'));
    directories.push(directory);
    return directory;
  }

  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map(async (directory) => rm(directory, { recursive: true })),
    );
  });

  it('restores residual releases with the original summary', async () => {
    const changesetDir = await createChangesetDirectory();
    const changeset: NewChangesetWithCommit = {
      id: 'entry-one',
      summary: '\n## Added\n\n- Shared feature\n',
      releases: [
        { name: '@scope/released', type: 'minor' },
        { name: '@scope/unreleased', type: 'patch' },
      ],
    };

    await restoreResidualChangesets({
      changesetDir,
      changesets: [changeset],
      releasedPackageNames: ['@scope/released'],
    });

    expect(await readFile(join(changesetDir, 'entry-one.md'), 'utf8')).toBe(
      '---\n"@scope/unreleased": patch\n---\n\n## Added\n\n- Shared feature\n',
    );
  });

  it('does not recreate a fully consumed changeset', async () => {
    const changesetDir = await createChangesetDirectory();
    const changeset: NewChangesetWithCommit = {
      id: 'entry-one',
      summary: 'Summary',
      releases: [{ name: '@scope/released', type: 'minor' }],
    };

    await restoreResidualChangesets({
      changesetDir,
      changesets: [changeset],
      releasedPackageNames: ['@scope/released'],
    });

    await expect(
      readFile(join(changesetDir, 'entry-one.md'), 'utf8'),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('leaves changesets unrelated to the release untouched', async () => {
    const changesetDir = await createChangesetDirectory();
    const changeset: NewChangesetWithCommit = {
      id: 'unrelated-entry',
      summary: 'Original content',
      releases: [{ name: '@scope/unreleased', type: 'patch' }],
    };
    const filePath = join(changesetDir, 'unrelated-entry.md');
    await writeFile(filePath, 'Original file content');

    await restoreResidualChangesets({
      changesetDir,
      changesets: [changeset],
      releasedPackageNames: ['@scope/released'],
    });

    expect(await readFile(filePath, 'utf8')).toBe('Original file content');
  });

  it('rewrites an existing residual file and is idempotent', async () => {
    const changesetDir = await createChangesetDirectory();
    const changeset: NewChangesetWithCommit = {
      id: 'entry-one',
      summary: '## Fixed\n\n- Fix it',
      releases: [
        { name: '@scope/released', type: 'minor' },
        { name: '@scope/unreleased', type: 'patch' },
      ],
    };
    const filePath = join(changesetDir, 'entry-one.md');
    await writeFile(filePath, 'old content');

    const options = {
      changesetDir,
      changesets: [changeset],
      releasedPackageNames: ['@scope/released'],
    };
    await restoreResidualChangesets(options);
    const firstWrite = await readFile(filePath, 'utf8');
    await restoreResidualChangesets(options);

    expect(await readFile(filePath, 'utf8')).toBe(firstWrite);
  });
});
