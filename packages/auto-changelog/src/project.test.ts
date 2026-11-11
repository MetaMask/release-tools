import { mkdir, mkdtemp, realpath, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getProjectRoots } from './project.js';

let projectRoot: string;

/**
 * Write a `package.json` file in a directory relative to the test project.
 *
 * @param directory - The directory relative to the project root.
 * @param manifest - The manifest contents.
 */
async function writeManifest(
  directory: string,
  manifest: Record<string, unknown>,
): Promise<void> {
  const absoluteDirectory = path.join(projectRoot, directory);
  await mkdir(absoluteDirectory, { recursive: true });
  await writeFile(
    path.join(absoluteDirectory, 'package.json'),
    JSON.stringify(manifest),
  );
}

describe('getProjectRoots', () => {
  beforeEach(async () => {
    projectRoot = await realpath(
      await mkdtemp(path.join(tmpdir(), 'auto-changelog-project-')),
    );
    await writeFile(path.join(projectRoot, 'yarn.lock'), '');
  });

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  it('returns the repository root and the sorted non-root workspace roots', async () => {
    await writeManifest('.', {
      name: 'root',
      workspaces: ['packages/*'],
    });
    await writeManifest('packages/b', { name: 'b', version: '1.0.0' });
    await writeManifest('packages/a', { name: 'a', version: '1.0.0' });

    expect(await getProjectRoots(projectRoot)).toStrictEqual({
      repoRoot: projectRoot,
      packageRoots: [
        path.join(projectRoot, 'packages', 'a'),
        path.join(projectRoot, 'packages', 'b'),
      ],
    });
  });

  it('finds the project from within a workspace', async () => {
    await writeManifest('.', {
      name: 'root',
      workspaces: ['packages/*'],
    });
    await writeManifest('packages/a', { name: 'a', version: '1.0.0' });

    expect(
      await getProjectRoots(path.join(projectRoot, 'packages', 'a')),
    ).toStrictEqual({
      repoRoot: projectRoot,
      packageRoots: [path.join(projectRoot, 'packages', 'a')],
    });
  });

  it('returns no package roots for a project without workspaces', async () => {
    await writeManifest('.', { name: 'root', version: '1.0.0' });

    expect(await getProjectRoots(projectRoot)).toStrictEqual({
      repoRoot: projectRoot,
      packageRoots: [],
    });
  });
});
